import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import ExcelJS, { type Row, type Worksheet } from "exceljs";
import { all, base, clearKind, get, put, transaction, withStore } from "./db";
import { audit } from "./service";
import {
  PRODUCTION_SIZES,
  type Brand,
  type DeliveryChallan,
  type FabricOrder,
  type FabricOrderStatus,
  type FabricReceipt,
  type FabricSpec,
  type ImportIssue,
  type Kind,
  type Organization,
  type OrganizationRole,
  type Person,
  type ProductionInward,
  type ProductionWorkOrder,
  type ReferenceValue,
  type SizeBreakdown,
  type SyncConflict,
  type SyncRun,
  type TransportMovement,
  type User,
} from "./types";

export const WORKBOOK_SHEETS = [
  "MASTER DATA",
  "FABRIC ORDERS",
  "TRANSPORT",
  "PRODUCTION",
  "CLEARED LOTS",
  "DASHBOARD",
] as const;

export const operationalKinds = [
  "organizations",
  "people",
  "fabricSpecs",
  "fabricOrders",
  "fabricReceipts",
  "transports",
  "challans",
  "workOrders",
  "inwards",
  "brands",
  "referenceValues",
  "importIssues",
  "syncConflicts",
] as const satisfies readonly Kind[];

type ImportableKind = (typeof operationalKinds)[number];
type ParsedRecords = Partial<{
  [K in ImportableKind]: Array<ExtractRecord<K>>;
}>;
type ExtractRecord<K extends ImportableKind> = import("./types").Entities[K];
export type WorkbookPreview = {
  runId: string;
  summary: Record<string, number>;
  issues: Array<
    Pick<ImportIssue, "sheet" | "rowNumber" | "severity" | "message">
  >;
  mode: "replace" | "sync";
  conflicts: Array<
    Pick<SyncConflict, "id" | "kind" | "sheet" | "rowNumber" | "field">
  >;
};
type ParsedWorkbook = {
  records: ParsedRecords;
  issues: ImportIssue[];
  counts: Record<string, number>;
  fingerprint: string;
  baseline: Record<
    string,
    {
      version: number;
      hash: string;
      rowHash: string;
      sheet: string;
      row: number;
      legacyId: string;
    }
  >;
};

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const stableId = (prefix: string, value: string) =>
  `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
const syncHash = (value: unknown) => {
  const copy = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  for (const key of [
    "createdAt",
    "updatedAt",
    "sourceSheet",
    "sourceRow",
    "legacyId",
    "sourceHash",
    "version",
  ])
    delete copy[key];
  return hash(copy);
};
const now = () => new Date().toISOString();
const traced = (
  id: string,
  sheet: string,
  row: number,
  legacyId: string,
  values: unknown,
) => ({
  id,
  createdAt: now(),
  updatedAt: now(),
  sourceSheet: sheet,
  sourceRow: row,
  legacyId,
  sourceHash: hash(values),
  version: 1,
});
const plain = (value: unknown): unknown => {
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    const candidate = value as {
      result?: unknown;
      richText?: { text: string }[];
      error?: string;
    };
    if (candidate.error) return "";
    if ("result" in candidate) return candidate.result ?? "";
    if (candidate.richText)
      return candidate.richText.map((item) => item.text).join("");
  }
  return value ?? "";
};
const cell = (row: Row, column: number) => plain(row.getCell(column).value);
const textValue = (value: unknown) => String(plain(value) ?? "").trim();
const text = (row: Row, column: number) => textValue(cell(row, column));
const numeric = (value: unknown) => {
  const cleaned =
    typeof value === "string" ? value.replace(/[₹,%\s,]/g, "") : value;
  const result = Number(cleaned);
  return Number.isFinite(result) ? result : 0;
};
const number = (row: Row, column: number) => numeric(cell(row, column));
const isoDate = (value: unknown) => {
  const raw = plain(value);
  if (!raw) return "";
  if (raw instanceof Date && !Number.isNaN(raw.valueOf()))
    return raw.toISOString().slice(0, 10);
  if (typeof raw === "number") {
    const date = new Date(Date.UTC(1899, 11, 30) + raw * 86_400_000);
    return date.toISOString().slice(0, 10);
  }
  const parsed = new Date(String(raw));
  return Number.isNaN(parsed.valueOf())
    ? ""
    : parsed.toISOString().slice(0, 10);
};
const date = (row: Row, column: number) => isoDate(cell(row, column));
const normalized = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();
const rows = (
  sheet: Worksheet,
  start: number,
  predicate: (row: Row) => boolean,
) => {
  const result: Row[] = [];
  for (let index = start; index <= sheet.rowCount; index += 1) {
    const row = sheet.getRow(index);
    if (predicate(row)) result.push(row);
  }
  return result;
};
const required = (
  issues: ImportIssue[],
  runId: string,
  sheet: string,
  rowNumber: number,
  values: Record<string, unknown>,
  fields: [string, unknown][],
) => {
  const missing = fields
    .filter(
      ([, value]) => value === "" || value === undefined || value === null,
    )
    .map(([field]) => field);
  if (!missing.length) return true;
  issues.push({
    ...base("issue"),
    runId,
    sheet,
    rowNumber,
    severity: "error",
    code: "REQUIRED_FIELD",
    message: `Missing required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
    values,
    resolved: false,
  });
  return false;
};

function productionRow(
  row: Row,
  sheet: "PRODUCTION" | "CLEARED LOTS",
  org: (name: string, role: OrganizationRole) => Organization,
  brands: Map<string, Brand>,
  challans: Map<string, DeliveryChallan>,
): ProductionWorkOrder {
  const dcNumber = text(row, 1);
  const woNumber = text(row, 4);
  const jobworkerName = text(row, 2);
  const brandName = text(row, 5);
  const jobworker = org(jobworkerName, "jobworker");
  const brand = brands.get(normalized(brandName));
  const ratio: SizeBreakdown = {};
  const cutting: SizeBreakdown = {};
  PRODUCTION_SIZES.forEach((size, index) => {
    const ratioValue = number(row, 12 + index);
    const cutValue = number(row, 38 + index);
    if (ratioValue) ratio[size] = ratioValue;
    if (cutValue) cutting[size] = cutValue;
  });
  const bodyFabric = number(row, 7);
  const approvedConsumption = number(row, 30) || undefined;
  const actualReady = date(row, 37);
  const outward = date(row, 3);
  const totalCutQuantity = Object.values(cutting).reduce(
    (sum, value) => sum + (value || 0),
    0,
  );
  const linkedChallan = challans.get(normalized(dcNumber));
  const firstLine = linkedChallan?.lines[0];
  const price = firstLine?.pricePerMetre || number(row, 59);
  return {
    ...traced(
      stableId("wo", woNumber || `${sheet}:${row.number}`),
      sheet,
      row.number,
      woNumber,
      row.values,
    ),
    archived: sheet === "CLEARED LOTS",
    challanId: linkedChallan?.id,
    dcNumber,
    jobworkerId: jobworker.id,
    jobworkerName,
    fabricOutwardDate: outward,
    woNumber,
    brandId: brand?.id,
    brandName,
    itemName: text(row, 6),
    bodyFabric,
    trimFabric: number(row, 8),
    issuedDate: date(row, 9),
    ageingDays:
      actualReady && outward
        ? Math.max(
            0,
            Math.round(
              (Date.parse(actualReady) - Date.parse(outward)) / 86_400_000,
            ),
          )
        : outward
          ? Math.max(
              0,
              Math.round((Date.now() - Date.parse(outward)) / 86_400_000),
            )
          : 0,
    remarks: text(row, 11),
    ratio,
    approvedConsumption,
    cuttingDate: date(row, 31),
    expectedQuantity: approvedConsumption
      ? bodyFabric / approvedConsumption
      : 0,
    status: text(row, 33) || (sheet === "CLEARED LOTS" ? "Cleared" : "Pending"),
    lastUpdateDate: date(row, 34) || actualReady || date(row, 9),
    fiDone: ["yes", "true", "done", "1"].includes(text(row, 35).toLowerCase()),
    productionRemarks: text(row, 36),
    actualGoodsReadyDate: actualReady,
    cutting,
    totalCutQuantity,
    fabricName: firstLine?.fabricName || text(row, 57),
    fabricSupplier: text(row, 58),
    pricePerMetre: price,
    value: bodyFabric * price,
  };
}

export async function parseWorkbook(
  buffer: Buffer,
  runId = stableId("sync", `${Date.now()}:${buffer.length}`),
): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  for (const name of WORKBOOK_SHEETS)
    if (!workbook.getWorksheet(name))
      throw new Error(`Workbook is missing the ${name} sheet`);
  const records: ParsedRecords = {};
  const baseline: ParsedWorkbook["baseline"] = {};
  const syncSheet = workbook.getWorksheet("_CARNOT_SYNC");
  if (syncSheet)
    for (const row of rows(
      syncSheet,
      2,
      (candidate) => !!text(candidate, 1) && !!text(candidate, 2),
    )) {
      const kind = text(row, 1),
        id = text(row, 2);
      baseline[`${kind}:${id}`] = {
        version: number(row, 3) || 1,
        sheet: text(row, 4),
        row: number(row, 5),
        legacyId: text(row, 6),
        hash: text(row, 7),
        rowHash: text(row, 8) || text(row, 7),
      };
    }
  const baselineByLocation = new Map<string, string>();
  for (const key of Object.keys(baseline)) {
    const separator = key.indexOf(":");
    const kind = key.slice(0, separator);
    const id = key.slice(separator + 1);
    const prior = baseline[key];
    if (prior.sheet && prior.row)
      baselineByLocation.set(`${kind}:${prior.sheet}:${prior.row}`, id);
  }
  const claimedSyncIds = new Set<string>();
  const syncedId = (
    kind: ImportableKind,
    sheet: string,
    row: number,
    fallback: string,
    embedded = "",
  ) => {
    const candidates = [
      embedded,
      baselineByLocation.get(`${kind}:${sheet}:${row}`) || "",
    ];
    for (const candidate of candidates)
      if (
        candidate &&
        baseline[`${kind}:${candidate}`] &&
        !claimedSyncIds.has(`${kind}:${candidate}`)
      ) {
        claimedSyncIds.add(`${kind}:${candidate}`);
        return candidate;
      }
    return fallback;
  };
  const issues: ImportIssue[] = [];
  const organizations = new Map<string, Organization>();
  const people = new Map<string, Person>();
  const brands = new Map<string, Brand>();
  const referenceValues = new Map<string, ReferenceValue>();
  const org = (name: string, role: OrganizationRole) => {
    const clean = name.trim() || "Unspecified";
    const key = normalized(clean);
    const existing = organizations.get(key);
    if (existing) {
      if (!existing.roles.includes(role)) existing.roles.push(role);
      return existing;
    }
    const value: Organization = {
      ...traced(stableId("org", key), "MASTER DATA", 0, clean, clean),
      name: clean,
      roles: [role],
      email: "",
      phone: "",
      address: "",
      taxId: "",
      notes: "",
    };
    organizations.set(key, value);
    return value;
  };
  org("Singal Fabrics", "legal_entity");
  const master = workbook.getWorksheet("MASTER DATA")!;
  const specs: FabricSpec[] = [];
  for (const row of rows(master, 3, (candidate) => !!text(candidate, 1))) {
    const values = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [
        index + 1,
        cell(row, index + 1),
      ]),
    );
    const fabricName = text(row, 1),
      supplierName = text(row, 9),
      content = text(row, 8),
      width = text(row, 3),
      folding = text(row, 4);
    if (
      !required(issues, runId, "MASTER DATA", row.number, values, [
        ["Fabric Name", fabricName],
        ["Width", width],
        ["Folding", folding],
        ["Content", content],
        ["Supplier Name", supplierName],
      ])
    )
      continue;
    const supplier = org(supplierName, "supplier");
    const agentName = text(row, 10);
    const agent =
      agentName && normalized(agentName) !== "na"
        ? org(agentName, "agent")
        : undefined;
    specs.push({
      ...traced(
        stableId("fs", `${normalized(fabricName)}:${normalized(supplierName)}`),
        "MASTER DATA",
        row.number,
        fabricName,
        values,
      ),
      name: fabricName,
      rangeName: text(row, 2),
      width,
      folding,
      weave: text(row, 5),
      threadCount: text(row, 6),
      construction: text(row, 7),
      content,
      supplierId: supplier.id,
      agentId: agent?.id,
    });
  }
  const list = (column: number, role: OrganizationRole) =>
    rows(master, 3, (r) => !!text(r, column)).forEach((r) =>
      org(text(r, column), role),
    );
  list(13, "jobworker");
  list(15, "distributor");
  rows(master, 3, (r) => !!text(r, 17)).forEach((row) => {
    const name = text(row, 17);
    const key = normalized(name);
    brands.set(key, {
      ...traced(stableId("brand", key), "MASTER DATA", row.number, name, name),
      name,
    });
  });
  ([18, 19, 20] as const).forEach((column) => {
    const category =
      column === 18
        ? "production_status"
        : column === 19
          ? "order_status"
          : "fabric_for";
    rows(master, 3, (r) => !!text(r, column)).forEach((row, index) => {
      const value = text(row, column);
      const key = `${category}:${normalized(value)}`;
      referenceValues.set(key, {
        ...traced(
          stableId("ref", key),
          "MASTER DATA",
          row.number,
          value,
          value,
        ),
        category,
        value,
        active: true,
        sortOrder: index,
      });
    });
  });
  const specByName = new Map(
    specs.map((spec) => [normalized(spec.name), spec]),
  );
  const orderSheet = workbook.getWorksheet("FABRIC ORDERS")!;
  const orders: FabricOrder[] = [];
  for (const row of rows(
    orderSheet,
    3,
    (candidate) => !!text(candidate, 3) || !!text(candidate, 5),
  )) {
    const poNumber = text(row, 3),
      fabricName = text(row, 5),
      orderDate = date(row, 2),
      quantityOrdered = number(row, 19),
      pricePerMetre = number(row, 15),
      purposeParty = text(row, 20),
      fabricFor = text(row, 21);
    const values = Object.fromEntries(
      Array.from({ length: 25 }, (_, index) => [
        index + 1,
        cell(row, index + 1),
      ]),
    );
    const spec = specByName.get(normalized(fabricName));
    const supplierName =
      text(row, 6) ||
      (spec ? organizations.get(spec.supplierId)?.name : "") ||
      "";
    if (
      !required(issues, runId, "FABRIC ORDERS", row.number, values, [
        ["Order By", text(row, 1)],
        ["Order Date", orderDate],
        ["PO No.", poNumber],
        ["Fabric Name", fabricName],
        ["Supplier", supplierName],
        ["Price", pricePerMetre || ""],
        ["Designs", text(row, 17)],
        ["Colors", text(row, 18)],
        ["Qty Ordered", quantityOrdered || ""],
        ["Purpose / Party", purposeParty],
        ["Fabric For", fabricFor],
      ])
    )
      continue;
    const supplier = org(supplierName, "supplier");
    const agentName =
      text(row, 13) ||
      (spec?.agentId ? organizations.get(spec.agentId)?.name || "" : "");
    const agent =
      agentName && normalized(agentName) !== "na"
        ? org(agentName, "agent")
        : undefined;
    const status = "Ordered" as FabricOrderStatus;
    orders.push({
      ...traced(
        syncedId(
          "fabricOrders",
          "FABRIC ORDERS",
          row.number,
          stableId("fpo", `${poNumber || "row"}:${row.number}`),
          text(row, 26),
        ),
        "FABRIC ORDERS",
        row.number,
        poNumber,
        values,
      ),
      orderBy: text(row, 1),
      orderDate,
      poNumber,
      internalItemName: text(row, 4) || spec?.rangeName || "",
      fabricSpecId: spec?.id,
      fabricName,
      supplierId: supplier.id,
      supplierName,
      width: text(row, 7) || spec?.width || "",
      folding: text(row, 8) || spec?.folding || "",
      weave: text(row, 9) || spec?.weave || "",
      content: text(row, 10) || spec?.content || "",
      construction: text(row, 11) || spec?.construction || "",
      threadCount: text(row, 12) || spec?.threadCount || "",
      agentId: agent?.id,
      agentName,
      fabricType: text(row, 14),
      pricePerMetre,
      deliveryDate: date(row, 16),
      designs: text(row, 17),
      colors: text(row, 18),
      quantityOrdered,
      purposeParty,
      fabricFor,
      receivedMetres: 0,
      cancelledMetres: 0,
      status,
      remarks: text(row, 24),
      fabricValue: quantityOrdered * pricePerMetre,
    });
  }
  const orderByPo = new Map(
    orders.map((order) => [normalized(order.poNumber), order]),
  );
  const transportSheet = workbook.getWorksheet("TRANSPORT")!;
  const transports: TransportMovement[] = [];
  for (const row of rows(
    transportSheet,
    3,
    (candidate) =>
      !!text(candidate, 12) || (!!text(candidate, 2) && !!number(candidate, 9)),
  )) {
    const poNumber = text(row, 1),
      dcNumber = text(row, 12),
      fabricName = text(row, 2),
      supplierName = text(row, 3),
      partyName = text(row, 4),
      jobworkerName = text(row, 10),
      quantity = number(row, 9),
      transportName = text(row, 8),
      pickedBy = text(row, 11);
    const values = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        index + 1,
        cell(row, index + 1),
      ]),
    );
    if (
      !required(issues, runId, "TRANSPORT", row.number, values, [
        ["Fabric Name", fabricName],
        ["Supplier", supplierName],
        ["Party Name", partyName],
        ["No. of Bales", number(row, 7) || ""],
        ["Transport Name", transportName],
        ["Fabric Qty", quantity || ""],
        ["Jobworker", jobworkerName],
        ["Picked By", pickedBy],
        ["Outward DC No.", dcNumber],
        ["DC Issue Date", date(row, 13)],
      ])
    )
      continue;
    const linkedOrder = orderByPo.get(normalized(poNumber));
    const supplier = org(supplierName, "supplier"),
      party = org(partyName, "distributor"),
      jobworker = org(jobworkerName, "jobworker"),
      transporter = org(transportName, "transporter");
    const personKey = normalized(pickedBy);
    let person = people.get(personKey);
    if (!person) {
      person = {
        ...traced(
          stableId("person", personKey),
          "TRANSPORT",
          row.number,
          pickedBy,
          pickedBy,
        ),
        name: pickedBy,
        role: "pickup",
        email: "",
        phone: "",
        notes: "",
      };
      people.set(personKey, person);
    }
    const price = linkedOrder?.pricePerMetre || number(row, 19);
    transports.push({
      ...traced(
        syncedId(
          "transports",
          "TRANSPORT",
          row.number,
          stableId("tm", `TRANSPORT:${row.number}:${dcNumber}`),
          text(row, 21),
        ),
        "TRANSPORT",
        row.number,
        `${dcNumber}:${row.number}`,
        values,
      ),
      fabricOrderId: linkedOrder?.id,
      poNumber,
      fabricName,
      supplierId: supplier.id,
      supplierName,
      partyId: party.id,
      partyName,
      lrDate: date(row, 5),
      lrNumber: text(row, 6),
      numberOfBales: number(row, 7),
      transporterId: transporter.id,
      transportName,
      fabricQuantity: quantity,
      destinationJobworkerId: jobworker.id,
      destinationJobworkerName: jobworkerName,
      pickedByPersonId: person.id,
      pickedBy,
      outwardDcNumber: dcNumber,
      dcIssueDate: date(row, 13),
      balePickupDate: date(row, 14),
      balePickupInward: text(row, 15),
      stage: text(row, 16) || "Issued",
      priority: text(row, 17),
      remarks: text(row, 18),
      pricePerMetre: price,
      priceOverride: !linkedOrder && !!number(row, 19),
      value: quantity * price,
    });
  }
  const challans = new Map<string, DeliveryChallan>();
  for (const movement of transports) {
    const key = normalized(movement.outwardDcNumber);
    let challan = challans.get(key);
    if (!challan) {
      const consignee = organizations.get(
        normalized(movement.destinationJobworkerName),
      )!;
      challan = {
        ...traced(
          stableId("dc", key),
          "TRANSPORT",
          movement.sourceRow || 0,
          movement.outwardDcNumber,
          movement.outwardDcNumber,
        ),
        number: movement.outwardDcNumber,
        issueDate: movement.dcIssueDate,
        status: "Issued",
        issuer: {
          name: "Singal Fabrics",
          address:
            "76, Ground Floor, Singal Square, 3rd Cross Rd, Lal Bagh Road, Bengaluru, Karnataka – 560027",
          taxId: "29AGDPS5158E1Z5",
          email: "contact@singalfabrics.com",
          phone: "+91 96862 95345",
        },
        consignee: {
          name: consignee.name,
          address: consignee.address,
          taxId: consignee.taxId,
          email: consignee.email,
          phone: consignee.phone,
        },
        jobworkerId: consignee.id,
        driverName: movement.pickedBy,
        driverPhone: "",
        transportName: movement.transportName,
        lrNumber: movement.lrNumber,
        purpose:
          "Goods sent for job work; not for sale. Issued under GST Rule 55.",
        terms:
          "Material remains the property of Singal Fabrics. Quantity and condition must be verified on receipt.",
        remarks: movement.remarks,
        lines: [],
        issuedAt: movement.dcIssueDate,
      };
      challans.set(key, challan);
    }
    challan.lines.push({
      id: stableId("dcl", movement.id),
      transportMovementId: movement.id,
      fabricOrderId: movement.fabricOrderId,
      fabricName: movement.fabricName,
      quantityMetres: movement.fabricQuantity,
      transportName: movement.transportName,
      lrNumber: movement.lrNumber,
      bundles: movement.numberOfBales,
      pricePerMetre: movement.pricePerMetre,
    });
    movement.challanId = challan.id;
  }
  const receipts: FabricReceipt[] = [];
  const receivedByOrder = new Map<string, number>();
  for (const movement of transports)
    if (movement.fabricOrderId)
      receivedByOrder.set(
        movement.fabricOrderId,
        (receivedByOrder.get(movement.fabricOrderId) || 0) +
          movement.fabricQuantity,
      );
  for (const order of orders) {
    const received = Math.min(
      order.quantityOrdered,
      receivedByOrder.get(order.id) || 0,
    );
    order.receivedMetres = received;
    order.status =
      received >= order.quantityOrdered
        ? "Received"
        : received > 0
          ? "Partial"
          : "Ordered";
    if (received)
      receipts.push({
        ...traced(
          stableId("receipt", order.id),
          "TRANSPORT",
          0,
          order.poNumber,
          received,
        ),
        fabricOrderId: order.id,
        receiptDate: order.orderDate,
        quantityMetres: received,
        warehouse: "Singal Fabrics",
        lotNumber: "",
        remarks: "Calculated from imported transport records",
      });
  }
  const workOrders = new Map<string, ProductionWorkOrder>();
  const inwards: ProductionInward[] = [];
  const productionSheet = workbook.getWorksheet("PRODUCTION")!;
  for (const row of rows(
    productionSheet,
    4,
    (candidate) => !!text(candidate, 1) && !!text(candidate, 4),
  )) {
    const record = productionRow(row, "PRODUCTION", org, brands, challans);
    record.id = syncedId(
      "workOrders",
      "PRODUCTION",
      row.number,
      record.id,
      text(row, 62),
    );
    const values = Object.fromEntries(
      Array.from({ length: 61 }, (_, index) => [
        index + 1,
        cell(row, index + 1),
      ]),
    );
    if (
      required(issues, runId, "PRODUCTION", row.number, values, [
        ["DC No.", record.dcNumber],
        ["Jobworker", record.jobworkerName],
        ["WO No.", record.woNumber],
        ["Brand", record.brandName],
        ["Item Name", record.itemName],
        ["Body Fabric", record.bodyFabric || ""],
        ["WO Issued Date", record.issuedDate],
        ["Status", record.status],
      ])
    )
      workOrders.set(record.id, record);
  }
  const clearedSheet = workbook.getWorksheet("CLEARED LOTS")!;
  for (const row of rows(
    clearedSheet,
    4,
    (candidate) => !!text(candidate, 1) && !!text(candidate, 4),
  )) {
    const record = productionRow(row, "CLEARED LOTS", org, brands, challans);
    record.id = syncedId(
      "workOrders",
      "CLEARED LOTS",
      row.number,
      record.id,
      text(row, 69),
    );
    const values = Object.fromEntries(
      Array.from({ length: 68 }, (_, index) => [
        index + 1,
        cell(row, index + 1),
      ]),
    );
    if (
      !required(issues, runId, "CLEARED LOTS", row.number, values, [
        ["DC No.", record.dcNumber],
        ["Jobworker", record.jobworkerName],
        ["WO No.", record.woNumber],
        ["Brand", record.brandName],
        ["Item Name", record.itemName],
        ["Body Fabric", record.bodyFabric || ""],
        ["WO Issued Date", record.issuedDate],
        ["Inward Date", date(row, 61)],
      ])
    )
      continue;
    workOrders.set(record.id, record);
    const setwise = number(row, 62),
      mix = number(row, 63),
      damage = number(row, 64);
    const total = setwise + mix + damage;
    inwards.push({
      ...traced(
        syncedId(
          "inwards",
          "CLEARED LOTS",
          row.number,
          stableId("inward", `${record.id}:${row.number}`),
          text(row, 70),
        ),
        "CLEARED LOTS",
        row.number,
        record.woNumber,
        values,
      ),
      workOrderId: record.id,
      inwardDate: date(row, 61),
      setwiseQuantity: setwise,
      mixPiecesQuantity: mix,
      damagePiecesQuantity: damage,
      totalInward: total,
      remarks: total
        ? "Imported from cleared lots"
        : "Awaiting inward quantity",
    });
    if (!total)
      issues.push({
        ...base("issue"),
        runId,
        sheet: "CLEARED LOTS",
        rowNumber: row.number,
        severity: "warning",
        code: "AWAITING_INWARD",
        message: "Cleared lot is awaiting inward quantity",
        values,
        resolved: false,
      });
  }
  records.organizations = [...organizations.values()];
  records.people = [...people.values()];
  records.fabricSpecs = specs;
  records.fabricOrders = orders;
  records.fabricReceipts = receipts;
  records.transports = transports;
  records.challans = [...challans.values()];
  records.workOrders = [...workOrders.values()];
  records.inwards = inwards;
  records.brands = [...brands.values()];
  records.referenceValues = [...referenceValues.values()];
  const sourceFabricOrderRows = rows(
    orderSheet,
    3,
    (candidate) => !!text(candidate, 3) || !!text(candidate, 5),
  ).length;
  const sourceTransportRows = rows(
    transportSheet,
    3,
    (candidate) =>
      !!text(candidate, 12) || (!!text(candidate, 2) && !!number(candidate, 9)),
  ).length;
  for (const [sheet, actual, expected] of [
    ["FABRIC ORDERS", sourceFabricOrderRows, 298],
    ["TRANSPORT", sourceTransportRows, 376],
  ] as const) {
    if (actual !== expected)
      issues.push({
        ...base("issue"),
        runId,
        sheet,
        rowNumber: 0,
        severity: "warning",
        code: "SOURCE_COUNT_CHANGED",
        message: `${sheet} contains ${actual} source rows; the implementation baseline was ${expected}. All current rows were evaluated.`,
        values: { actual, expected },
        resolved: false,
      });
  }
  records.importIssues = issues;
  for (const values of Object.values(records))
    for (const record of values || [])
      if ("sourceHash" in record) record.sourceHash = syncHash(record);
  const counts = Object.fromEntries(
    Object.entries(records).map(([kind, values]) => [
      kind,
      values?.length || 0,
    ]),
  );
  counts.sourceFabricOrders = sourceFabricOrderRows;
  counts.sourceTransportRows = sourceTransportRows;
  counts.sourceActiveWorkOrders = rows(
    productionSheet,
    4,
    (candidate) => !!text(candidate, 1) && !!text(candidate, 4),
  ).length;
  counts.sourceClearedLots = rows(
    clearedSheet,
    4,
    (candidate) => !!text(candidate, 1) && !!text(candidate, 4),
  ).length;
  return { records, issues, counts, fingerprint: hash(buffer), baseline };
}

const pack = (value: unknown) =>
  gzipSync(JSON.stringify(value)).toString("base64");
const unpack = <T>(value: string) =>
  JSON.parse(gunzipSync(Buffer.from(value, "base64")).toString("utf8")) as T;

export async function previewWorkbook(
  buffer: Buffer,
  fileName: string,
  user: User,
): Promise<WorkbookPreview> {
  if (user.role !== "admin") throw new Error("Administrator access required");
  const runBase = base("sync");
  const parsed = await parseWorkbook(buffer, runBase.id);
  const mode = (await withStore(() => all("fabricOrders").length))
    ? "sync"
    : "replace";
  const conflicts: SyncConflict[] = [];
  const syncInputKinds = new Set<ImportableKind>([
    "organizations",
    "fabricSpecs",
    "fabricOrders",
    "transports",
    "workOrders",
    "inwards",
    "brands",
    "referenceValues",
  ]);
  if (mode === "sync" && Object.keys(parsed.baseline).length) {
    await withStore(() => {
      for (const [kind, values] of Object.entries(parsed.records) as [
        ImportableKind,
        ExtractRecord<ImportableKind>[],
      ][]) {
        if (!syncInputKinds.has(kind)) continue;
        type SyncRecord = {
          id: string;
          version: number;
          sourceHash?: string;
          sourceSheet?: string;
          sourceRow?: number;
        };
        const syncValues = values as unknown as SyncRecord[];
        const currentById = new Map(
          (all(kind) as unknown as SyncRecord[]).map((record) => [
            record.id,
            record,
          ]),
        );
        for (let index = 0; index < syncValues.length; index += 1) {
          const workbookRecord = syncValues[index],
            current = currentById.get(workbookRecord.id),
            prior = parsed.baseline[`${kind}:${workbookRecord.id}`];
          if (!current || !prior) continue;
          const portalChanged =
            current.version > prior.version || syncHash(current) !== prior.hash;
          const workbookChanged = workbookRecord.sourceHash !== prior.rowHash;
          if (
            portalChanged &&
            workbookChanged &&
            syncHash(current) !== workbookRecord.sourceHash
          ) {
            conflicts.push({
              ...base("conflict"),
              runId: runBase.id,
              kind,
              recordId: current.id,
              sheet: workbookRecord.sourceSheet || prior.sheet,
              rowNumber: workbookRecord.sourceRow || prior.row,
              field: "$record",
              baselineValue: prior.hash,
              portalValue: current,
              workbookValue: workbookRecord,
            });
            syncValues[index] = current;
          } else if (portalChanged && !workbookChanged)
            syncValues[index] = current;
          else if (workbookChanged)
            workbookRecord.version = current.version + 1;
        }
        const workbookIds = new Set(syncValues.map((record) => record.id));
        for (const [key, prior] of Object.entries(parsed.baseline))
          if (key.startsWith(`${kind}:`)) {
            const id = key.slice(kind.length + 1),
              current = currentById.get(id);
            if (current && !workbookIds.has(id)) {
              conflicts.push({
                ...base("conflict"),
                runId: runBase.id,
                kind,
                recordId: id,
                sheet: prior.sheet,
                rowNumber: prior.row,
                field: "$archive",
                baselineValue: prior.hash,
                portalValue: current,
                workbookValue: null,
              });
              syncValues.push(current);
            }
          }
      }
    });
  }
  parsed.counts.syncConflicts = conflicts.length;
  const run: SyncRun = {
    ...runBase,
    fileName,
    status: "preview",
    mode,
    summary: parsed.counts,
    sourceFingerprint: parsed.fingerprint,
    createdBy: user.id,
    payload: pack(parsed),
  };
  await transaction(() => {
    clearKind("syncConflicts");
    for (const conflict of conflicts) put("syncConflicts", conflict);
    put("syncRuns", run);
  });
  return {
    runId: run.id,
    summary: parsed.counts,
    issues: parsed.issues
      .slice(0, 200)
      .map(({ sheet, rowNumber, severity, message }) => ({
        sheet,
        rowNumber,
        severity,
        message,
      })),
    mode,
    conflicts: conflicts.map(({ id, kind, sheet, rowNumber, field }) => ({
      id,
      kind,
      sheet,
      rowNumber,
      field,
    })),
  };
}

export async function commitWorkbook(runId: string, user: User) {
  if (user.role !== "admin") throw new Error("Administrator access required");
  return transaction(() => {
    const run = get("syncRuns", runId);
    if (run.status !== "preview" || !run.payload)
      throw new Error("This workbook preview is not available for commit");
    const parsed = unpack<ParsedWorkbook>(run.payload);
    for (const conflict of all("syncConflicts").filter(
      (item) => item.runId === run.id,
    )) {
      const values = parsed.records[conflict.kind as ImportableKind] as
        ExtractRecord<ImportableKind>[] | undefined;
      if (!values || !conflict.recordId) continue;
      const index = values.findIndex((value) => value.id === conflict.recordId);
      if (
        conflict.resolution === "workbook" &&
        conflict.workbookValue &&
        index >= 0
      )
        values[index] = conflict.workbookValue as ExtractRecord<ImportableKind>;
      if (conflict.resolution === "archive" && index >= 0)
        values.splice(index, 1);
    }
    const backupKinds: Kind[] = [
      "contacts",
      "fabrics",
      "purchases",
      "orders",
      "jobs",
      "movements",
      ...operationalKinds,
    ];
    const snapshot = Object.fromEntries(
      backupKinds.map((kind) => [kind, all(kind)]),
    );
    put("operationalBackups", {
      ...base("backup"),
      label: `Before ${run.fileName}`,
      createdBy: user.id,
      counts: Object.fromEntries(
        backupKinds.map((kind) => [kind, all(kind).length]),
      ),
      payload: pack(snapshot),
    });
    for (const kind of operationalKinds)
      if (kind !== "syncConflicts") clearKind(kind);
    for (const [kind, values] of Object.entries(parsed.records) as [
      ImportableKind,
      ExtractRecord<ImportableKind>[],
    ][])
      for (const value of values || []) put(kind, value as never);
    const importedWorkOrders = (parsed.records.workOrders ||
      []) as ProductionWorkOrder[];
    const importedInwards = (parsed.records.inwards ||
      []) as ProductionInward[];
    for (const workOrder of importedWorkOrders.filter(
      (item) => item.archived,
    )) {
      const accepted = importedInwards
        .filter((item) => item.workOrderId === workOrder.id)
        .reduce(
          (sum, item) => sum + item.setwiseQuantity + item.mixPiecesQuantity,
          0,
        );
      if (!accepted) continue;
      const existing = all("products").find(
        (product) => product.orderId === workOrder.id,
      );
      const sizes = Object.entries(workOrder.cutting)
        .filter(([, quantity]) => (quantity || 0) > 0)
        .map(([size, quantity]) => `${size}:${quantity}`)
        .join(", ");
      put(
        "products",
        existing
          ? { ...existing, stock: accepted, sizes }
          : {
              ...base("prd"),
              name: workOrder.itemName,
              sku: `WO-${workOrder.woNumber}`,
              orderId: workOrder.id,
              category: workOrder.brandName,
              sizes,
              stock: accepted,
              price: 0,
              cost: Math.round((workOrder.value * 100) / accepted),
              channelStock: 0,
            },
      );
    }
    put("syncRuns", {
      ...run,
      status: "committed",
      committedAt: now(),
      payload: undefined,
    });
    audit(
      user,
      "Imported operations workbook",
      run.fileName,
      Object.entries(parsed.counts)
        .map(([kind, count]) => `${kind}: ${count}`)
        .join(" · "),
    );
    return {
      success: true,
      counts: parsed.counts,
      issues: parsed.issues.length,
    };
  });
}

const headers = {
  fabricOrders: [
    "Order By",
    "Order Date",
    "PO No.",
    "Internal Item Name",
    "Fabric Name",
    "Supplier",
    "Width (in)",
    "Folding",
    "Weave",
    "Content",
    "Construction",
    "Thread Count",
    "Agent Name",
    "Fabric Type",
    "Price (₹/mtr)",
    "Delivery Date",
    "Designs",
    "Colors",
    "Qty Ordered (mtrs)",
    "Purpose / Party",
    "Fabric For",
    "Received (mtrs)",
    "Status",
    "Remarks",
    "Fabric Value (₹)",
  ],
  transport: [
    "Fabric PO No.",
    "Fabric Name",
    "Supplier",
    "Party Name",
    "LR Date",
    "LR No.",
    "No. of Bales",
    "Transport Name",
    "Fabric Qty (mtrs)",
    "To Factory (Jobworker)",
    "Picked By",
    "Outward DC No.",
    "Fabric DC Issue Date",
    "Bale Pickup Date",
    "Bale pickup inward",
    "Stage",
    "Priority",
    "Remarks",
    "Price (₹/mtr)",
    "Value (₹)",
  ],
};
const styleSheet = (
  sheet: Worksheet,
  title: string,
  columns: number,
  headerRow = 2,
) => {
  sheet.mergeCells(1, 1, 1, columns);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 16, color: { argb: "FFF7F2E8" } };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF26342E" },
  };
  titleCell.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 30;
  const header = sheet.getRow(headerRow);
  header.font = { bold: true, color: { argb: "FF26342E" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE6E9DC" },
  };
  header.alignment = { vertical: "middle", wrapText: true };
  header.height = 32;
  sheet.views = [{ state: "frozen", ySplit: headerRow }];
  sheet.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow, column: columns },
  };
  sheet.columns.forEach((column) => {
    column.width = 18;
  });
};
const addRows = (sheet: Worksheet, values: unknown[][]) =>
  values.forEach((value) => sheet.addRow(value));

export async function exportWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const syncLocations = new Map<string, { sheet: string; row: number }>();
  const track = (
    kind: ImportableKind,
    id: string,
    sheet: string,
    row: number,
  ) => syncLocations.set(`${kind}:${id}`, { sheet, row });
  workbook.creator = "Carnot CRM";
  workbook.created = new Date();
  const master = workbook.addWorksheet("MASTER DATA");
  const masterHeaders = [
    "Fabric Name",
    "Range Name",
    "Width (in)",
    "Folding",
    "Fabric Weave",
    "Thread Count",
    "Construction",
    "Content",
    "Supplier Name",
    "Agent Name",
    "",
    "",
    "Jobworker Name",
    "",
    "Party / Distributor",
    "",
    "Brand",
    "Prod Status",
    "Order Status",
    "Fabric For",
  ];
  master.addRow(["MASTER DATA | Singal Fabrics"]);
  master.addRow(masterHeaders);
  const specs = all("fabricSpecs"),
    organizations = all("organizations"),
    byId = new Map(organizations.map((item) => [item.id, item]));
  const jobworkers = organizations.filter((item) =>
    item.roles.includes("jobworker"),
  );
  const parties = organizations.filter((item) =>
    item.roles.includes("distributor"),
  );
  const brands = all("brands");
  const refs = all("referenceValues");
  const max = Math.max(
    specs.length,
    jobworkers.length,
    parties.length,
    brands.length,
    ...["production_status", "order_status", "fabric_for"].map(
      (category) => refs.filter((item) => item.category === category).length,
    ),
  );
  for (let index = 0; index < max; index += 1) {
    const spec = specs[index];
    master.addRow([
      spec?.name,
      spec?.rangeName,
      spec?.width,
      spec?.folding,
      spec?.weave,
      spec?.threadCount,
      spec?.construction,
      spec?.content,
      spec ? byId.get(spec.supplierId)?.name : "",
      spec?.agentId ? byId.get(spec.agentId)?.name : "",
      "",
      "",
      jobworkers[index]?.name,
      "",
      parties[index]?.name,
      "",
      brands[index]?.name,
      refs.filter((item) => item.category === "production_status")[index]
        ?.value,
      refs.filter((item) => item.category === "order_status")[index]?.value,
      refs.filter((item) => item.category === "fabric_for")[index]?.value,
    ]);
  }
  styleSheet(master, "MASTER DATA | Singal Fabrics", masterHeaders.length);
  const orderSheet = workbook.addWorksheet("FABRIC ORDERS");
  orderSheet.addRow(["FABRIC ORDERS | Singal Fabrics"]);
  orderSheet.addRow([...headers.fabricOrders, "_CARNOT_ID"]);
  all("fabricOrders").forEach((o) => {
    const row = orderSheet.addRow([
      o.orderBy,
      o.orderDate,
      o.poNumber,
      o.internalItemName,
      o.fabricName,
      o.supplierName,
      o.width,
      o.folding,
      o.weave,
      o.content,
      o.construction,
      o.threadCount,
      o.agentName,
      o.fabricType,
      o.pricePerMetre,
      o.deliveryDate,
      o.designs,
      o.colors,
      o.quantityOrdered,
      o.purposeParty,
      o.fabricFor,
      o.receivedMetres,
      o.status,
      o.remarks,
      o.fabricValue,
      o.id,
    ]);
    track("fabricOrders", o.id, "FABRIC ORDERS", row.number);
  });
  styleSheet(
    orderSheet,
    "FABRIC ORDERS | Singal Fabrics",
    headers.fabricOrders.length,
  );
  orderSheet.getColumn(headers.fabricOrders.length + 1).hidden = true;
  const transportSheet = workbook.addWorksheet("TRANSPORT");
  transportSheet.addRow(["TRANSPORT | Singal Fabrics"]);
  transportSheet.addRow([...headers.transport, "_CARNOT_ID"]);
  all("transports").forEach((m) => {
    const row = transportSheet.addRow([
      m.poNumber,
      m.fabricName,
      m.supplierName,
      m.partyName,
      m.lrDate,
      m.lrNumber,
      m.numberOfBales,
      m.transportName,
      m.fabricQuantity,
      m.destinationJobworkerName,
      m.pickedBy,
      m.outwardDcNumber,
      m.dcIssueDate,
      m.balePickupDate,
      m.balePickupInward,
      m.stage,
      m.priority,
      m.remarks,
      m.pricePerMetre,
      m.value,
      m.id,
    ]);
    track("transports", m.id, "TRANSPORT", row.number);
  });
  styleSheet(
    transportSheet,
    "TRANSPORT | Singal Fabrics",
    headers.transport.length,
  );
  transportSheet.getColumn(headers.transport.length + 1).hidden = true;
  const productionHeaders = [
    "DC No.",
    "Jobworker Name",
    "Date of Fabric Outward",
    "WO No.",
    "Brand",
    "Item Name",
    "Body Fabric (mtrs)",
    "Trim Fabric (mtrs)",
    "WO Issued Date",
    "WO Ageing (days)",
    "Remarks",
    ...PRODUCTION_SIZES,
    "Approved Consumption",
    "Cutting Date",
    "Expected Qty",
    "Status",
    "Last Update Date",
    "FI Done",
    "Production Remarks",
    "Actual Goods Ready Date",
    ...PRODUCTION_SIZES,
    "Total Cut Qty",
    "Fabric Name",
    "Fabric Supplier",
    "Price (₹/mtr)",
    "Value (₹)",
    "Archived?",
  ];
  const productionValues = (o: ProductionWorkOrder) => [
    o.dcNumber,
    o.jobworkerName,
    o.fabricOutwardDate,
    o.woNumber,
    o.brandName,
    o.itemName,
    o.bodyFabric,
    o.trimFabric,
    o.issuedDate,
    o.ageingDays,
    o.remarks,
    ...PRODUCTION_SIZES.map((size) => o.ratio[size] || 0),
    o.approvedConsumption || 0,
    o.cuttingDate,
    o.expectedQuantity,
    o.status,
    o.lastUpdateDate,
    o.fiDone ? "Yes" : "No",
    o.productionRemarks,
    o.actualGoodsReadyDate,
    ...PRODUCTION_SIZES.map((size) => o.cutting[size] || 0),
    o.totalCutQuantity,
    o.fabricName,
    o.fabricSupplier,
    o.pricePerMetre,
    o.value,
    o.archived ? "Yes" : "No",
  ];
  const production = workbook.addWorksheet("PRODUCTION");
  production.addRow(["PRODUCTION (ACTIVE WOs) | Singal Fabrics"]);
  production.addRow([]);
  production.addRow([...productionHeaders, "_CARNOT_ID"]);
  all("workOrders")
    .filter((item) => !item.archived)
    .forEach((item) => {
      const row = production.addRow([...productionValues(item), item.id]);
      track("workOrders", item.id, "PRODUCTION", row.number);
    });
  styleSheet(
    production,
    "PRODUCTION (ACTIVE WOs) | Singal Fabrics",
    productionHeaders.length,
    3,
  );
  production.getColumn(productionHeaders.length + 1).hidden = true;
  const cleared = workbook.addWorksheet("CLEARED LOTS");
  const clearedHeaders = [
    ...productionHeaders.slice(0, 60),
    "Inward Date",
    "Setwise Inward Qnty",
    "Mix Pcs Qnty",
    "Damage Pcs Qnty",
    "Total Inward Qty",
    "Final Consumption (mtrs/pc)",
    "Mix Pcs %",
    "Damage Pcs %",
  ];
  cleared.addRow(["CLEARED LOTS | Singal Fabrics"]);
  cleared.addRow([]);
  cleared.addRow([
    ...clearedHeaders,
    "_CARNOT_WORK_ORDER_ID",
    "_CARNOT_INWARD_ID",
  ]);
  const inwardsByWo = new Map<string, ProductionInward[]>();
  for (const inward of all("inwards"))
    inwardsByWo.set(inward.workOrderId, [
      ...(inwardsByWo.get(inward.workOrderId) || []),
      inward,
    ]);
  all("workOrders")
    .filter((item) => item.archived)
    .forEach((o) => {
      const inwardRecords = inwardsByWo.get(o.id) || [];
      const inward = {
        inwardDate:
          inwardRecords
            .map((item) => item.inwardDate)
            .filter(Boolean)
            .sort()
            .at(-1) || "",
        setwiseQuantity: inwardRecords.reduce(
          (sum, item) => sum + item.setwiseQuantity,
          0,
        ),
        mixPiecesQuantity: inwardRecords.reduce(
          (sum, item) => sum + item.mixPiecesQuantity,
          0,
        ),
        damagePiecesQuantity: inwardRecords.reduce(
          (sum, item) => sum + item.damagePiecesQuantity,
          0,
        ),
        totalInward: inwardRecords.reduce(
          (sum, item) => sum + item.totalInward,
          0,
        ),
      };
      const total = inward.totalInward;
      const row = cleared.addRow([
        ...productionValues(o).slice(0, 60),
        inward.inwardDate,
        inward.setwiseQuantity,
        inward.mixPiecesQuantity,
        inward.damagePiecesQuantity,
        total,
        total ? o.bodyFabric / total : "",
        total ? (inward.mixPiecesQuantity / total) * 100 : "",
        total ? (inward.damagePiecesQuantity / total) * 100 : "",
        o.id,
        inwardRecords.length === 1 ? inwardRecords[0].id : "",
      ]);
      track("workOrders", o.id, "CLEARED LOTS", row.number);
      if (inwardRecords.length === 1)
        track("inwards", inwardRecords[0].id, "CLEARED LOTS", row.number);
    });
  styleSheet(
    cleared,
    "CLEARED LOTS | Singal Fabrics",
    clearedHeaders.length,
    3,
  );
  cleared.getColumn(clearedHeaders.length + 1).hidden = true;
  cleared.getColumn(clearedHeaders.length + 2).hidden = true;
  const dashboard = workbook.addWorksheet("DASHBOARD");
  dashboard.addRow(["SINGAL FABRICS — OPERATIONS DASHBOARD"]);
  dashboard.addRow(["Generated", new Date().toISOString()]);
  dashboard.addRow([]);
  dashboard.addRow(["Metric", "Value"]);
  const workOrders = all("workOrders"),
    inwards = all("inwards");
  addRows(dashboard, [
    ["Fabric orders", all("fabricOrders").length],
    [
      "Fabric ordered (mtrs)",
      all("fabricOrders").reduce((s, o) => s + o.quantityOrdered, 0),
    ],
    [
      "Fabric order value (₹)",
      all("fabricOrders").reduce((s, o) => s + o.fabricValue, 0),
    ],
    ["Transport rows", all("transports").length],
    [
      "Fabric at jobworkers (mtrs)",
      workOrders
        .filter((o) => !o.archived)
        .reduce((s, o) => s + o.bodyFabric + o.trimFabric, 0),
    ],
    ["Active work orders", workOrders.filter((o) => !o.archived).length],
    ["Cleared lots", workOrders.filter((o) => o.archived).length],
    ["Total garment inward", inwards.reduce((s, i) => s + i.totalInward, 0)],
    ["Damage pieces", inwards.reduce((s, i) => s + i.damagePiecesQuantity, 0)],
    [
      "Open import issues",
      all("importIssues").filter((i) => !i.resolved).length,
    ],
  ]);
  styleSheet(dashboard, "SINGAL FABRICS — OPERATIONS DASHBOARD", 2, 4);
  const visibleWorkbook = Buffer.from(await workbook.xlsx.writeBuffer());
  const visibleRecords = await parseWorkbook(visibleWorkbook, "export");
  const rowHashesById = new Map<string, string>();
  const rowHashesByLocation = new Map<string, string>();
  for (const [kind, values] of Object.entries(visibleRecords.records) as [
    ImportableKind,
    ExtractRecord<ImportableKind>[] | undefined,
  ][]) {
    for (const record of values || []) {
      if (!("sourceHash" in record)) continue;
      rowHashesById.set(`${kind}:${record.id}`, record.sourceHash || "");
      if (record.sourceSheet && record.sourceRow)
        rowHashesByLocation.set(
          `${kind}:${record.sourceSheet}:${record.sourceRow}`,
          record.sourceHash || "",
        );
    }
  }
  const sync = workbook.addWorksheet("_CARNOT_SYNC");
  sync.state = "veryHidden";
  sync.addRow([
    "Kind",
    "Record UUID",
    "Version",
    "Source Sheet",
    "Source Row",
    "Legacy ID",
    "Baseline Hash",
    "Workbook Row Hash",
  ]);
  for (const kind of operationalKinds)
    for (const record of all(kind)) {
      const location = syncLocations.get(`${kind}:${record.id}`);
      const sourceSheet =
        location?.sheet || ("sourceSheet" in record ? record.sourceSheet : "");
      const sourceRow =
        location?.row || ("sourceRow" in record ? record.sourceRow : 0);
      sync.addRow([
        kind,
        record.id,
        "version" in record ? record.version : 1,
        sourceSheet,
        sourceRow,
        "legacyId" in record ? record.legacyId : "",
        syncHash(record),
        rowHashesById.get(`${kind}:${record.id}`) ||
          rowHashesByLocation.get(`${kind}:${sourceSheet}:${sourceRow}`) ||
          syncHash(record),
      ]);
    }
  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
}
