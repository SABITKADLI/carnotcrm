import { z } from "zod";
import { createHash } from "node:crypto";
import {
  all,
  base,
  get,
  operation,
  put,
  saveSettings,
  saveOperation,
  sequence,
  settings,
  transaction,
  withStore,
} from "./db";
import {
  createUser,
  isDemo,
  resetPassword,
  setUserActive,
  users,
} from "./auth";
import type {
  Invoice,
  InvoiceLine,
  State,
  User,
} from "./types";
import { PRODUCTION_SIZES } from "./types";
import { productionStageRules } from "./production-workflow";

export type Input = Record<string, unknown>;
const str = (v: unknown, max = 500) =>
  z.string().trim().min(1).max(max).parse(v);
const optional = (v: unknown, max = 3000) =>
  z
    .string()
    .trim()
    .max(max)
    .parse(v ?? "");
const num = (v: unknown, min = 0, max = 1e9) =>
  z.coerce.number().finite().min(min).max(max).parse(v);
const integer = (v: unknown, min = 0, max = 1e9) =>
  z.coerce.number().int().min(min).max(max).parse(v);
const date = (v: unknown) => z.iso.date().parse(v);
const cents = (v: unknown) => Math.round(num(v, 0, 1e7) * 100);
const mm = (v: unknown) => Math.round(num(v, 0.001, 1e6) * 1000);
const requireAdmin = (user: User) => {
  if (user.role !== "admin") throw new Error("Administrator access required");
};
export function audit(
  user: User,
  action: string,
  subject: string,
  detail = "",
) {
  put("activities", {
    ...base("evt"),
    actor: user.name,
    action,
    subject,
    detail,
  });
}
function movement(
  user: User,
  type: string,
  reference: string,
  quantity: number,
  ids: { fabricId?: string; fabricOrderId?: string; productId?: string },
  note = "",
) {
  put("movements", {
    ...base("mov"),
    ...ids,
    quantity,
    type,
    reference,
    actor: user.name,
    note,
  });
}
function customer(id: unknown) {
  const customerId = str(id);
  const organization = all("organizations").find(
    (item) => item.id === customerId && !item.archived,
  );
  if (organization) {
    if (!organization.roles.some((role) => role === "customer" || role === "distributor"))
      throw new Error("Select a customer / party");
    return organization;
  }
  throw new Error("Select a customer / party from Master Data");
}
export function state(user: User, includeOperations = true): State {
  return withStore(() => {
    const config = settings();
    const organizations = includeOperations ? all("organizations") : [];
    const people = includeOperations ? all("people") : [];
    const fabricSpecs = includeOperations ? all("fabricSpecs") : [];
    const allFabricOrders = includeOperations ? all("fabricOrders") : [];
    const allFabricReceipts = includeOperations ? all("fabricReceipts") : [];
    const allTransports = includeOperations ? all("transports") : [];
    const allChallans = includeOperations ? all("challans") : [];
    const allWorkOrders = includeOperations ? all("workOrders") : [];
    const allInwards = includeOperations ? all("inwards") : [];
    const allAttachments = includeOperations
      ? all("attachments").filter((item) => !item.deletedAt)
      : [];
    const partnerId = user.partnerId || "";
    const partnerName =
      organizations
        .find((organization) => organization.id === partnerId)
        ?.name.toLowerCase() || "";
    const scopedFabricOrders =
      user.role === "admin"
        ? allFabricOrders
        : allFabricOrders.filter(
            (order) =>
              (user.role === "supplier" && order.supplierId === partnerId) ||
              (user.role === "agent" && order.agentId === partnerId) ||
              (user.role === "distributor" &&
                !!partnerName &&
                order.purposeParty.toLowerCase().includes(partnerName)),
          );
    const scopedTransports =
      user.role === "admin"
        ? allTransports
        : allTransports.filter(
            (movement) =>
              (user.role === "supplier" && movement.supplierId === partnerId) ||
              (user.role === "transporter" &&
                movement.transporterId === partnerId) ||
              (user.role === "delivery" &&
                movement.pickedByPersonId === partnerId) ||
              (["jobworker", "tailor"].includes(user.role) &&
                movement.destinationJobworkerId === partnerId) ||
              (user.role === "distributor" && movement.partyId === partnerId),
          );
    const scopedChallans =
      user.role === "admin"
        ? allChallans
        : allChallans.filter(
            (challan) =>
              (["jobworker", "tailor"].includes(user.role) &&
                challan.jobworkerId === partnerId) ||
              scopedTransports.some(
                (movement) => movement.challanId === challan.id,
              ),
          );
    const scopedWorkOrders =
      user.role === "admin"
        ? allWorkOrders
        : allWorkOrders.filter(
            (workOrder) =>
              ["jobworker", "tailor"].includes(user.role) &&
              workOrder.jobworkerId === partnerId,
          );
    const scopedInwards =
      user.role === "admin"
        ? allInwards
        : allInwards.filter((inward) =>
            scopedWorkOrders.some(
              (workOrder) => workOrder.id === inward.workOrderId,
            ),
          );
    const jobs: State["jobs"] = [];
    const orders: State["orders"] = [];
    if (user.role !== "admin") {
      return {
        user,
        users: [user],
        jobs,
        orders: orders.map((o) => ({
          ...o,
          customerId: "",
          unitPrice: 0,
          laborCost: 0,
          issuedCost: 0,
        })),
        contacts: [],
        fabrics: [],
        purchases: [],
        products: [],
        invoices: [],
        payments: [],
        movements: [],
        activities: [],
        organizations: organizations.filter(
          (organization) => organization.id === partnerId,
        ),
        people: people.filter(
          (person) =>
            person.id === partnerId || person.organizationId === partnerId,
        ),
        fabricSpecs:
          user.role === "supplier"
            ? fabricSpecs.filter((spec) => spec.supplierId === partnerId)
            : [],
        fabricOrders: scopedFabricOrders.map((order) =>
          ["supplier", "agent", "distributor"].includes(user.role)
            ? order
            : { ...order, pricePerMetre: 0, fabricValue: 0 },
        ),
        fabricReceipts: allFabricReceipts.filter((receipt) =>
          scopedFabricOrders.some(
            (order) => order.id === receipt.fabricOrderId,
          ),
        ),
        transports: scopedTransports.map((movement) =>
          ["supplier", "agent", "distributor"].includes(user.role)
            ? movement
            : { ...movement, pricePerMetre: 0, value: 0 },
        ),
        challans: scopedChallans,
        workOrders: scopedWorkOrders.map((workOrder) => ({
          ...workOrder,
          pricePerMetre: 0,
          value: 0,
        })),
        inwards: scopedInwards,
        brands: includeOperations ? all("brands") : [],
        referenceValues: includeOperations ? all("referenceValues") : [],
        importIssues: [],
        syncRuns: [],
        syncConflicts: [],
        operationalBackups: [],
        attachments: allAttachments.filter((attachment) =>
          scopedFabricOrders.some((order) => order.id === attachment.entityId),
        ),
        settings: { ...config, address: "", taxId: "", paymentDetails: "" },
        shopify: {
          configured: false,
          domain: "",
          publication: false,
          inventory: false,
        },
        demo: isDemo(),
      };
    }
    const team = users();
    if (!team.some((person) => person.id === user.id)) team.unshift(user);
    return {
      user,
      users: team,
      contacts: [],
      fabrics: [],
      purchases: [],
      orders,
      jobs,
      products: all("products"),
      invoices: all("invoices"),
      payments: all("payments"),
      movements: all("movements"),
      activities: all("activities").slice(0, 200),
      organizations,
      people,
      fabricSpecs,
      fabricOrders: allFabricOrders,
      fabricReceipts: allFabricReceipts,
      transports: allTransports,
      challans: allChallans,
      workOrders: allWorkOrders,
      inwards: allInwards,
      brands: includeOperations ? all("brands") : [],
      referenceValues: includeOperations ? all("referenceValues") : [],
      importIssues: includeOperations ? all("importIssues") : [],
      syncRuns: includeOperations
        ? all("syncRuns").map((run) => ({ ...run, payload: undefined }))
        : [],
      syncConflicts: includeOperations ? all("syncConflicts") : [],
      operationalBackups: includeOperations
        ? all("operationalBackups").map((backup) => ({
            id: backup.id,
            createdAt: backup.createdAt,
            updatedAt: backup.updatedAt,
            label: backup.label,
            createdBy: backup.createdBy,
            counts: backup.counts,
          }))
        : [],
      attachments: allAttachments,
      settings: config,
      shopify: {
        configured: !!(
          process.env.SHOPIFY_SHOP && process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
        ),
        domain: process.env.SHOPIFY_SHOP || "",
        publication: !!process.env.SHOPIFY_PUBLICATION_ID,
        inventory: !!process.env.SHOPIFY_LOCATION_ID,
      },
      demo: isDemo(),
    };
  }) as State;
}

/** Idempotency and all stock/accounting changes share the same write transaction. */
export function execute(
  user: User,
  action: string,
  input: Input,
  operationId: string,
) {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(operationId))
    throw new Error("A valid operation ID is required");
  return transaction(() => {
    const payload = createHash("sha256")
      .update(JSON.stringify({ action, input }))
      .digest("hex");
    const previous = operation(operationId);
    if (previous) {
      if (previous.actor !== user.id || previous.payload !== payload)
        throw new Error("Operation ID already used for a different request");
      return JSON.parse(String(previous.result));
    }
    const result = perform(user, action, input);
    saveOperation({
      id: operationId,
      actor: user.id,
      payload,
      result: JSON.stringify(result ?? null),
      created: Date.now(),
    });
    return result;
  });
}
function perform(user: User, action: string, input: Input): unknown {
  if (["fabric", "adjustStock", "purchase", "receive", "order", "plan", "cancelOrder", "assign", "quality", "progress", "contact"].includes(action))
    throw new Error("This older workflow has been retired. Use Fabric Orders, Production, Master Data and Customers.");
  if (action === "changePassword") {
    resetPassword(user.id, str(input.password, 128));
    audit(user, "Changed password", user.name);
    return { success: true };
  }
  if (action === "challanStatus") {
    const challan = get("challans", str(input.id));
    const allowed =
      user.role === "admin" ||
      (["jobworker", "tailor"].includes(user.role) &&
        challan.jobworkerId === user.partnerId) ||
      all("transports").some(
        (movement) =>
          movement.challanId === challan.id &&
          ((user.role === "transporter" &&
            movement.transporterId === user.partnerId) ||
            (user.role === "delivery" &&
              movement.pickedByPersonId === user.partnerId)),
      );
    if (!allowed)
      throw new Error("You do not have access to this delivery challan");
    const status = z
      .enum([
        "Issued",
        "Picked Up",
        "Delivered",
        "Acknowledged",
        "Void",
        "Returned",
      ])
      .parse(input.status);
    if (["Void", "Returned"].includes(status) && user.role !== "admin")
      throw new Error("Administrator access required");
    const updated = put("challans", {
      ...challan,
      status,
      acknowledgedAt:
        status === "Acknowledged"
          ? new Date().toISOString()
          : challan.acknowledgedAt,
      version: challan.version + 1,
    });
    audit(
      user,
      `Marked challan ${status.toLowerCase()}`,
      challan.number,
      optional(input.notes),
    );
    return updated;
  }
  if (action === "supplierUpdate") {
    const order = get("fabricOrders", str(input.id));
    if (
      user.role !== "admin" &&
      !(user.role === "supplier" && order.supplierId === user.partnerId)
    )
      throw new Error("You can only update your own purchase orders");
    const updated = put("fabricOrders", {
      ...order,
      supplierAcknowledgedAt: input.acknowledged
        ? new Date().toISOString()
        : order.supplierAcknowledgedAt,
      supplierDeliveryEstimate:
        optional(input.deliveryEstimate, 10) || order.supplierDeliveryEstimate,
      supplierNotes: optional(input.notes, 3000),
      dispatchDetails: optional(input.dispatchDetails, 3000),
      version: order.version + 1,
    });
    audit(
      user,
      "Updated supplier commitment",
      order.poNumber,
      updated.supplierNotes || "Acknowledged",
    );
    return updated;
  }
  if (action === "recordNote") {
    const kind = z
      .enum(["fabricOrders", "transports", "workOrders"])
      .parse(input.kind);
    const id = str(input.id);
    const note = str(input.note, 3000);
    const entry = {
      userId: user.id,
      author: user.name,
      role: user.role,
      note,
      date: new Date().toISOString(),
    };
    if (kind === "fabricOrders") {
      const record = get("fabricOrders", id);
      const distributorName =
        user.role === "distributor" && user.partnerId
          ? get("organizations", user.partnerId).name.toLowerCase()
          : "";
      const allowed =
        user.role === "admin" ||
        (user.role === "agent" && record.agentId === user.partnerId) ||
        (user.role === "supplier" && record.supplierId === user.partnerId) ||
        (user.role === "distributor" &&
          !!distributorName &&
          record.purposeParty.toLowerCase().includes(distributorName));
      if (!allowed) throw new Error("You cannot add a note to this record");
      const updated = put("fabricOrders", {
        ...record,
        notesLog: [...(record.notesLog || []), entry],
        version: record.version + 1,
      });
      audit(user, "Added partner note", record.poNumber, note);
      return updated;
    }
    if (kind === "transports") {
      const record = get("transports", id);
      const allowed =
        user.role === "admin" ||
        (user.role === "distributor" && record.partyId === user.partnerId) ||
        (user.role === "transporter" &&
          record.transporterId === user.partnerId) ||
        (["jobworker", "tailor"].includes(user.role) &&
          record.destinationJobworkerId === user.partnerId);
      if (!allowed) throw new Error("You cannot add a note to this record");
      const updated = put("transports", {
        ...record,
        notesLog: [...(record.notesLog || []), entry],
        version: record.version + 1,
      });
      audit(user, "Added partner note", record.outwardDcNumber, note);
      return updated;
    }
    const record = get("workOrders", id);
    if (
      user.role !== "admin" &&
      !(
        ["jobworker", "tailor"].includes(user.role) &&
        record.jobworkerId === user.partnerId
      )
    )
      throw new Error("You cannot add a note to this record");
    const updated = put("workOrders", {
      ...record,
      notesLog: [...(record.notesLog || []), entry],
      version: record.version + 1,
    });
    audit(user, "Added partner note", record.woNumber, note);
    return updated;
  }
  if (action === "productionUpdate") {
    const workOrder = get("workOrders", str(input.id));
    if (
      user.role !== "admin" &&
      !(
        ["jobworker", "tailor"].includes(user.role) &&
        workOrder.jobworkerId === user.partnerId
      )
    )
      throw new Error("You can only update your own work orders");
    const cuttingInput = (
      input.cutting && typeof input.cutting === "object" ? input.cutting : {}
    ) as Record<string, unknown>;
    const ratioInput = (
      input.ratio && typeof input.ratio === "object" ? input.ratio : {}
    ) as Record<string, unknown>;
    const cutting = { ...workOrder.cutting };
    const ratio = { ...workOrder.ratio };
    for (const size of PRODUCTION_SIZES) {
      if (cuttingInput[size] !== undefined)
        cutting[size] = integer(cuttingInput[size], 0, 1_000_000);
      if (ratioInput[size] !== undefined)
        ratio[size] = num(ratioInput[size], 0, 1_000_000);
    }
    const totalCutQuantity = Object.values(cutting).reduce(
      (sum, value) => sum + (value || 0),
      0,
    );
    const status = str(input.status, 100);
    const availableStatuses = all("referenceValues")
      .filter((item) => item.category === "production_status" && item.active)
      .map((item) => item.value);
    if (
      availableStatuses.length &&
      status !== workOrder.status &&
      !availableStatuses.includes(status)
    )
      throw new Error("Select an active production stage from Master Data");
    const stageRules = productionStageRules(status);
    const approvedConsumption =
      input.approvedConsumption === undefined ||
      input.approvedConsumption === ""
        ? workOrder.approvedConsumption
        : num(input.approvedConsumption, 0.001, 100);
    if (stageRules.requireConsumption && !approvedConsumption)
      throw new Error("Approved consumption is required before cutting starts");
    if (
      stageRules.requireRatio &&
      !Object.values(ratio).some((value) => (value || 0) > 0)
    )
      throw new Error("Enter at least one size ratio before cutting starts");
    const cuttingDate =
      optional(input.cuttingDate, 10) || workOrder.cuttingDate;
    if (stageRules.requireCuttingDate && !cuttingDate)
      throw new Error("Cutting date is required at Cutting Completed or later");
    if (stageRules.requireCuttingQuantities && totalCutQuantity <= 0)
      throw new Error("Enter at least one cut quantity for this stage");
    const actualGoodsReadyDate =
      optional(input.actualGoodsReadyDate, 10) ||
      workOrder.actualGoodsReadyDate;
    if (stageRules.requireGoodsReadyDate && !actualGoodsReadyDate)
      throw new Error("Actual goods ready date is required for this stage");
    const productionRemarks = optional(input.productionRemarks, 3000);
    if (stageRules.requireRemarks && !productionRemarks)
      throw new Error("Production remarks are required for this stage");
    const updated = put("workOrders", {
      ...workOrder,
      cutting,
      ratio,
      totalCutQuantity,
      status,
      approvedConsumption,
      cuttingDate,
      fiDone:
        input.fiDone === undefined
          ? workOrder.fiDone
          : z.coerce.boolean().parse(input.fiDone),
      productionRemarks,
      actualGoodsReadyDate,
      expectedQuantity: approvedConsumption
        ? workOrder.bodyFabric / approvedConsumption
        : 0,
      lastUpdateDate: new Date().toISOString().slice(0, 10),
      version: workOrder.version + 1,
    });
    audit(user, "Updated work order", workOrder.woNumber, status);
    return updated;
  }
  if (action === "productionInward") {
    const workOrder = get("workOrders", str(input.workOrderId));
    if (
      user.role !== "admin" &&
      !(
        ["jobworker", "tailor"].includes(user.role) &&
        workOrder.jobworkerId === user.partnerId
      )
    )
      throw new Error("You can only record inward for your own work orders");
    if (!productionStageRules(workOrder.status).allowInward)
      throw new Error(
        "Garment inward can only be recorded when goods are ready or dispatched",
      );
    const setwiseQuantity = integer(input.setwiseQuantity ?? 0, 0),
      mixPiecesQuantity = integer(input.mixPiecesQuantity ?? 0, 0),
      damagePiecesQuantity = integer(input.damagePiecesQuantity ?? 0, 0);
    const totalInward =
      setwiseQuantity + mixPiecesQuantity + damagePiecesQuantity;
    if (!totalInward) throw new Error("Enter at least one inward quantity");
    const inward = put("inwards", {
      ...base("inward"),
      version: 1,
      workOrderId: workOrder.id,
      inwardDate: date(input.inwardDate),
      setwiseQuantity,
      mixPiecesQuantity,
      damagePiecesQuantity,
      totalInward,
      remarks: optional(input.remarks),
    });
    const totalReceived = all("inwards")
      .filter((item) => item.workOrderId === workOrder.id)
      .reduce((sum, item) => sum + item.totalInward, 0);
    put("workOrders", {
      ...workOrder,
      archived: totalReceived > 0,
      status: "Cleared",
      actualGoodsReadyDate: workOrder.actualGoodsReadyDate || inward.inwardDate,
      lastUpdateDate: inward.inwardDate,
      version: workOrder.version + 1,
    });
    const accepted = setwiseQuantity + mixPiecesQuantity;
    if (accepted) {
      const existingProduct = all("products").find(
        (product) => product.orderId === workOrder.id,
      );
      const sizes = Object.entries(workOrder.cutting)
        .filter(([, quantity]) => (quantity || 0) > 0)
        .map(([size, quantity]) => `${size}:${quantity}`)
        .join(", ");
      const product = put(
        "products",
        existingProduct
          ? {
              ...existingProduct,
              stock: existingProduct.stock + accepted,
            }
          : {
              ...base("prd"),
              name: workOrder.itemName,
              sku: `WO-${workOrder.woNumber}`,
              orderId: workOrder.id,
              category: workOrder.brandName,
              sizes,
              stock: accepted,
              price: 0,
              cost: accepted
                ? Math.round((workOrder.value * 100) / accepted)
                : 0,
              channelStock: 0,
            },
      );
      put("movements", {
        ...base("mov"),
        productId: product.id,
        quantity: accepted,
        type: "Garment inward",
        reference: workOrder.woNumber,
        actor: user.name,
        note: `${damagePiecesQuantity} damaged`,
        fromLocation: workOrder.jobworkerName,
        toLocation: "Finished goods",
      });
    }
    audit(
      user,
      "Recorded garment inward",
      workOrder.woNumber,
      `${totalInward} pieces`,
    );
    return inward;
  }
  requireAdmin(user);
  switch (action) {
    case "organization": {
      const existing = input.id
        ? get("organizations", str(input.id))
        : { ...base("org"), version: 1 };
      const roles = z
        .array(
          z.enum([
            "supplier",
            "vendor",
            "agent",
            "jobworker",
            "transporter",
            "coolie",
            "distributor",
            "customer",
            "legal_entity",
          ]),
        )
        .min(1)
        .parse(input.roles);
      const record = put("organizations", {
        ...existing,
        name: str(input.name, 160),
        roles,
        email: optional(input.email, 254),
        phone: optional(input.phone, 50),
        address: optional(input.address),
        taxId: optional(input.taxId, 100),
        notes: optional(input.notes),
        version: existing.version + (input.id ? 1 : 0),
      });
      audit(user, "Saved partner", record.name, roles.join(", "));
      return record;
    }
    case "fabricOrderUpdate": {
      const order = get("fabricOrders", str(input.id));
      const quantityOrdered = num(
        input.quantityOrdered ?? order.quantityOrdered,
        0.001,
      );
      const pricePerMetre = num(
        input.pricePerMetre ?? order.pricePerMetre,
        0.01,
      );
      if (order.receivedMetres + order.cancelledMetres > quantityOrdered)
        throw new Error(
          "Ordered metres cannot be below received and cancelled metres",
        );
      const supplierId = optional(input.supplierId, 100) || order.supplierId;
      const supplier = get("organizations", supplierId);
      const partyIds = Array.isArray(input.partyIds)
        ? input.partyIds.map((value) => str(value, 100))
        : order.partyIds || [];
      const parties = partyIds.map((id) => get("organizations", id));
      const updated = put("fabricOrders", {
        ...order,
        orderDate: input.orderDate ? date(input.orderDate) : order.orderDate,
        deliveryDate: input.deliveryDate
          ? date(input.deliveryDate)
          : order.deliveryDate,
        internalItemName:
          input.internalItemName === undefined
            ? order.internalItemName
            : optional(input.internalItemName, 150),
        fabricName:
          input.fabricName === undefined
            ? order.fabricName
            : str(input.fabricName, 160),
        supplierId: supplier.id,
        supplierName: supplier.name,
        fabricType:
          input.fabricType === undefined
            ? order.fabricType
            : str(input.fabricType, 100),
        pricePerMetre,
        quantityOrdered,
        designs:
          input.designs === undefined ? order.designs : str(input.designs, 100),
        colors:
          input.colors === undefined ? order.colors : str(input.colors, 100),
        purposeParty:
          parties.length > 0
            ? parties.map((party) => party.name).join(", ")
            : input.purposeParty === undefined
              ? order.purposeParty
              : str(input.purposeParty, 500),
        partyIds,
        fabricFor:
          input.fabricFor === undefined
            ? order.fabricFor
            : str(input.fabricFor, 100),
        remarks:
          input.remarks === undefined ? order.remarks : optional(input.remarks),
        fabricValue: quantityOrdered * pricePerMetre,
        version: order.version + 1,
      });
      audit(user, "Edited fabric purchase order", order.poNumber);
      return updated;
    }
    case "fabricOrderStatus": {
      const order = get("fabricOrders", str(input.id));
      const status = z
        .enum(["Ordered", "Partial", "Received", "Cancelled"])
        .parse(input.status);
      if (status === "Partial" || status === "Received")
        throw new Error("Record the actual received quantity through Mark received");
      const receivedMetres = order.receivedMetres;
      let cancelledMetres =
        input.cancelledMetres === undefined || input.cancelledMetres === ""
          ? order.cancelledMetres
          : num(input.cancelledMetres, 0, order.quantityOrdered);
      if (status === "Cancelled" && input.cancelledMetres === undefined) {
        cancelledMetres = order.quantityOrdered - receivedMetres;
      }
      if (receivedMetres + cancelledMetres > order.quantityOrdered)
        throw new Error(
          "Received and cancelled metres cannot exceed ordered metres",
        );
      if (status === "Ordered" && receivedMetres > 0)
        throw new Error("An order with receipts must be Partial or Received");
      const voidOrder = z.coerce.boolean().catch(false).parse(input.void);
      const updated = put("fabricOrders", {
        ...order,
        status,
        receivedMetres,
        cancelledMetres,
        archived: voidOrder ? true : order.archived,
        voidedAt: voidOrder ? new Date().toISOString() : order.voidedAt,
        voidReason: voidOrder ? str(input.reason, 500) : order.voidReason,
        version: order.version + 1,
      });
      audit(
        user,
        voidOrder ? "Voided fabric purchase order" : `Marked PO ${status}`,
        order.poNumber,
        optional(input.reason, 500),
      );
      return updated;
    }
    case "fabricOrder": {
      const manualSpec = input.fabricSpecId === "__new__";
      const createOrganization = (
        idValue: unknown,
        nameValue: unknown,
        role: "supplier" | "agent" | "distributor",
      ) => {
        const id = optional(idValue, 100);
        if (id && id !== "__new__") return get("organizations", id);
        const name = optional(nameValue, 160);
        if (!name) return undefined;
        const existing = all("organizations").find(
          (item) =>
            !item.archived &&
            item.name.trim().toLowerCase() === name.trim().toLowerCase(),
        );
        if (existing) {
          if (!existing.roles.includes(role))
            return put("organizations", {
              ...existing,
              roles: [...existing.roles, role],
              version: existing.version + 1,
            });
          return existing;
        }
        return put("organizations", {
          ...base("org"),
          version: 1,
          name,
          roles: [role],
          email: "",
          phone: "",
          address: "",
          taxId: "",
          notes: "Created while entering a fabric PO",
        });
      };
      const manualSupplier = manualSpec
        ? createOrganization(
            input.supplierId,
            input.newSupplierName,
            "supplier",
          )
        : undefined;
      if (manualSpec && !manualSupplier)
        throw new Error("Choose a supplier or enter a new supplier name");
      const manualAgent = manualSpec
        ? createOrganization(input.agentId, input.newAgentName, "agent")
        : undefined;
      const spec = manualSpec
        ? put("fabricSpecs", {
            ...base("fs"),
            version: 1,
            name: str(input.fabricName, 160),
            rangeName: optional(input.internalItemName, 150),
            width: str(input.width, 50),
            folding: str(input.folding, 100),
            weave: optional(input.weave, 100),
            threadCount: optional(input.threadCount, 100),
            construction: optional(input.construction, 160),
            content: str(input.content, 160),
            supplierId: manualSupplier!.id,
            agentId: manualAgent?.id,
          })
        : get("fabricSpecs", str(input.fabricSpecId));
      const supplier = get("organizations", spec.supplierId);
      const poNumbers = all("fabricOrders").map((order) =>
        Number(order.poNumber.match(/(\d+)$/)?.[1] || 0),
      );
      const poNumber =
        optional(input.poNumber, 50) ||
        `PO2627/${String(Math.max(0, ...poNumbers) + 1).padStart(3, "0")}`;
      const quantityOrdered = num(input.quantityOrdered, 0.001),
        pricePerMetre = num(input.pricePerMetre, 0.01);
      const agentName = spec.agentId
        ? get("organizations", spec.agentId).name
        : "";
      const partyIds = Array.isArray(input.partyIds)
        ? input.partyIds
            .map((value) => str(value, 100))
            .filter((value) => value !== "__new__")
        : [];
      const newParty = createOrganization(
        "__new__",
        input.newPartyName,
        "distributor",
      );
      if (newParty) partyIds.push(newParty.id);
      const purposeParty = partyIds.length
        ? partyIds.map((id) => get("organizations", id).name).join(", ")
        : optional(input.purposeParty, 500);
      if (!purposeParty)
        throw new Error("Choose a customer / party or enter a new one");
      const order = put("fabricOrders", {
        ...base("fpo"),
        version: 1,
        orderBy: user.name,
        orderDate: date(input.orderDate),
        poNumber,
        internalItemName:
          optional(input.internalItemName, 150) || spec.rangeName,
        fabricSpecId: spec.id,
        fabricName: spec.name,
        supplierId: supplier.id,
        supplierName: supplier.name,
        width: spec.width,
        folding: spec.folding,
        weave: spec.weave,
        content: spec.content,
        construction: spec.construction,
        threadCount: spec.threadCount,
        agentId: spec.agentId,
        agentName,
        fabricType: str(input.fabricType, 100),
        pricePerMetre,
        deliveryDate: date(input.deliveryDate),
        designs: str(input.designs, 100),
        colors: str(input.colors, 100),
        quantityOrdered,
        purposeParty,
        partyIds,
        fabricFor: str(input.fabricFor, 100),
        receivedMetres: 0,
        cancelledMetres: 0,
        status: "Ordered",
        remarks: optional(input.remarks),
        fabricValue: quantityOrdered * pricePerMetre,
      });
      audit(user, "Created fabric purchase order", poNumber, spec.name);
      return order;
    }
    case "transport": {
      const fabricOrderId = optional(input.fabricOrderId, 100) || undefined;
      const order = fabricOrderId
        ? get("fabricOrders", fabricOrderId)
        : undefined;
      const supplier = get(
        "organizations",
        str(input.supplierId || order?.supplierId),
      );
      const party = get("organizations", str(input.partyId));
      const jobworker = get("organizations", str(input.jobworkerId));
      const transporter = get("organizations", str(input.transporterId));
      const quantity = num(input.fabricQuantity, 0.001),
        price = order?.pricePerMetre || num(input.pricePerMetre ?? 0, 0);
      if (order) {
        const alreadyDispatched = all("transports")
          .filter((item) => item.fabricOrderId === order.id && !["Void", "Returned"].includes(item.stage))
          .reduce((sum, item) => sum + item.fabricQuantity, 0);
        const alreadySold = all("movements")
          .filter((item) => item.fabricOrderId === order.id && item.type === "Direct sale")
          .reduce((sum, item) => sum - item.quantity / 1000, 0);
        if (quantity > Math.max(0, order.receivedMetres - alreadyDispatched - alreadySold) + 0.0005)
          throw new Error(`${order.poNumber}: dispatch exceeds received fabric available in stock`);
      }
      const existingNumbers = all("challans").map((challan) =>
        Number(challan.number.match(/SF(\d+)/i)?.[1] || 0),
      );
      const dcNumber =
        optional(input.outwardDcNumber, 50) ||
        `SF${Math.max(1386, ...existingNumbers) + 1}`;
      const issueDate = date(input.dcIssueDate),
        transportName = transporter.name,
        selectedPersonId = optional(input.pickedByPersonId, 100),
        selectedPerson = selectedPersonId
          ? get("people", selectedPersonId)
          : undefined,
        pickedBy = selectedPerson?.name || str(input.pickedBy, 120);
      if (
        selectedPerson &&
        selectedPerson.organizationId &&
        selectedPerson.organizationId !== transporter.id
      )
        throw new Error("This driver belongs to another transporter");
      if (selectedPerson && !["driver", "pickup", "delivery"].includes(selectedPerson.role))
        throw new Error("Select a driver, pickup or delivery person");
      const driverPhone = optional(input.driverPhone, 50);
      const person = selectedPerson
        ? put("people", {
            ...selectedPerson,
            organizationId: transporter.id,
            phone: driverPhone || selectedPerson.phone,
            version: selectedPerson.version + 1,
          })
        : (() => {
            const existing = all("people").find(
              (item) =>
                item.name.toLowerCase() === pickedBy.toLowerCase() &&
                item.organizationId === transporter.id,
            );
            return existing
              ? put("people", {
                  ...existing,
                  phone: driverPhone || existing.phone,
                  version: existing.version + 1,
                })
              : put("people", {
                  ...base("person"),
                  version: 1,
                  name: pickedBy,
                  organizationId: transporter.id,
                  role: "driver" as const,
                  email: "",
                  phone: driverPhone,
                  notes: "Created from delivery challan",
                });
          })();
      const movement = put("transports", {
        ...base("tm"),
        version: 1,
        fabricOrderId: order?.id,
        poNumber: order?.poNumber || "",
        fabricName: order?.fabricName || str(input.fabricName, 160),
        supplierId: supplier.id,
        supplierName: supplier.name,
        partyId: party.id,
        partyName: party.name,
        lrDate: optional(input.lrDate, 10),
        lrNumber: optional(input.lrNumber, 100),
        numberOfBales: integer(input.numberOfBales, 1),
        transporterId: transporter.id,
        transportName,
        fabricQuantity: quantity,
        destinationJobworkerId: jobworker.id,
        destinationJobworkerName: jobworker.name,
        pickedByPersonId: person.id,
        pickedBy,
        outwardDcNumber: dcNumber,
        dcIssueDate: issueDate,
        balePickupDate: optional(input.balePickupDate, 10),
        balePickupInward: "",
        stage: "Issued",
        priority: optional(input.priority, 40),
        remarks: optional(input.remarks),
        pricePerMetre: price,
        priceOverride: !order,
        value: quantity * price,
      });
      const config = settings();
      const challan = put("challans", {
        ...base("dc"),
        version: 1,
        number: dcNumber,
        issueDate,
        status: "Issued",
        issuer: {
          name: config.logisticsName || "Singal Fabrics",
          address: config.logisticsAddress || "",
          taxId: config.logisticsTaxId || "",
          email: config.logisticsEmail || "",
          phone: config.logisticsPhone || "",
        },
        consignee: {
          name: jobworker.name,
          address: jobworker.address,
          taxId: jobworker.taxId,
          email: jobworker.email,
          phone: jobworker.phone,
        },
        jobworkerId: jobworker.id,
        driverPersonId: person.id,
        driverName: pickedBy,
        driverPhone: person.phone,
        transportName,
        lrNumber: optional(input.lrNumber, 100),
        purpose:
          "Goods sent for job work; not for sale. Issued under GST Rule 55.",
        terms:
          "Material remains the property of Singal Fabrics. Quantity and condition must be verified on receipt.",
        remarks: optional(input.remarks),
        lines: [
          {
            id: `${movement.id}:1`,
            transportMovementId: movement.id,
            fabricOrderId: order?.id,
            fabricName: movement.fabricName,
            quantityMetres: quantity,
            transportName,
            lrNumber: movement.lrNumber,
            bundles: movement.numberOfBales,
            pricePerMetre: price,
          },
        ],
        issuedAt: new Date().toISOString(),
      });
      put("transports", { ...movement, challanId: challan.id });
      put("movements", {
        ...base("mov"),
        quantity: -Math.round(quantity * 1000),
        type: "Jobworker issue",
        reference: dcNumber,
        actor: user.name,
        note: movement.fabricName,
        fromLocation: "Singal Fabrics",
        toLocation: jobworker.name,
      });
      audit(
        user,
        "Issued delivery challan",
        dcNumber,
        `${quantity} m to ${jobworker.name}`,
      );
      return challan;
    }
    case "workOrder": {
      const challan = get("challans", str(input.challanId));
      if (!challan.jobworkerId)
        throw new Error("The challan is not linked to a jobworker");
      const jobworker = get("organizations", challan.jobworkerId);
      const brand = get("brands", str(input.brandId));
      const bodyFabric = num(input.bodyFabric, 0.001),
        trimFabric = num(input.trimFabric ?? 0, 0);
      const sequenceNumber =
        Math.max(
          0,
          ...all("workOrders").map((order) =>
            Number(order.woNumber.match(/(\d+)$/)?.[1] || 0),
          ),
        ) + 1;
      const issuedDate = date(input.issuedDate),
        firstLine = challan.lines[0];
      const record = put("workOrders", {
        ...base("wo"),
        version: 1,
        challanId: challan.id,
        dcNumber: challan.number,
        jobworkerId: jobworker.id,
        jobworkerName: jobworker.name,
        fabricOutwardDate: challan.issueDate,
        woNumber: optional(input.woNumber, 50) || String(sequenceNumber),
        brandId: brand.id,
        brandName: brand.name,
        itemName: str(input.itemName, 200),
        bodyFabric,
        trimFabric,
        issuedDate,
        ageingDays: Math.max(
          0,
          Math.round((Date.now() - Date.parse(issuedDate)) / 86_400_000),
        ),
        remarks: optional(input.remarks),
        ratio: {},
        approvedConsumption: input.approvedConsumption
          ? num(input.approvedConsumption, 0.001, 100)
          : undefined,
        cuttingDate: "",
        expectedQuantity: input.approvedConsumption
          ? bodyFabric / num(input.approvedConsumption, 0.001, 100)
          : 0,
        status: "Pending",
        lastUpdateDate: issuedDate,
        fiDone: false,
        productionRemarks: "",
        actualGoodsReadyDate: "",
        cutting: {},
        totalCutQuantity: 0,
        fabricName: firstLine?.fabricName || "",
        fabricSupplier: "",
        pricePerMetre: firstLine?.pricePerMetre || 0,
        value: bodyFabric * (firstLine?.pricePerMetre || 0),
        archived: false,
      });
      audit(
        user,
        "Created production work order",
        record.woNumber,
        `${record.itemName} · ${jobworker.name}`,
      );
      return record;
    }
    case "fabricReceipt": {
      const order = get("fabricOrders", str(input.fabricOrderId));
      const outstanding =
        order.quantityOrdered - order.receivedMetres - order.cancelledMetres;
      if (outstanding <= 0)
        throw new Error("This purchase order has no outstanding metres");
      const quantityMetres = num(input.quantityMetres, 0.001, outstanding);
      const transporterId = optional(input.transporterId, 100) || undefined;
      const transporter = transporterId
        ? get("organizations", transporterId)
        : undefined;
      const receipt = put("fabricReceipts", {
        ...base("receipt"),
        version: 1,
        fabricOrderId: order.id,
        receiptDate: date(input.receiptDate),
        quantityMetres,
        warehouse: str(input.warehouse, 120),
        lotNumber: optional(input.lotNumber, 120),
        remarks: optional(input.remarks),
        lrNumber: optional(input.lrNumber, 100),
        lrDate: optional(input.lrDate, 10),
        transporterId,
        transportName: transporter?.name || "",
        numberOfBales: input.numberOfBales
          ? integer(input.numberOfBales, 1)
          : 0,
        sourceLocation:
          optional(input.sourceLocation, 200) || order.supplierName,
        destinationLocation:
          optional(input.destinationLocation, 200) || str(input.warehouse, 120),
        dispatchDetails: optional(input.dispatchDetails),
      });
      const receivedMetres = order.receivedMetres + quantityMetres;
      put("fabricOrders", {
        ...order,
        receivedMetres,
        status:
          receivedMetres + order.cancelledMetres >= order.quantityOrdered
            ? "Received"
            : "Partial",
        version: order.version + 1,
      });
      put("movements", {
        ...base("mov"),
        quantity: Math.round(quantityMetres * 1000),
        type: "Fabric receipt",
        fabricOrderId: order.id,
        reference: order.poNumber,
        actor: user.name,
        note: receipt.remarks,
        fromLocation: order.supplierName,
        toLocation: receipt.warehouse,
      });
      audit(user, "Received fabric", order.poNumber, `${quantityMetres} m`);
      if (input.jobworkerId && input.partyId && transporterId) {
        const challan = perform(user, "transport", {
          fabricOrderId: order.id,
          supplierId: order.supplierId,
          partyId: input.partyId,
          jobworkerId: input.jobworkerId,
          transporterId,
          fabricQuantity: input.transportQuantity || quantityMetres,
          numberOfBales: input.numberOfBales || 1,
          pickedBy: input.pickedBy || user.name,
          lrNumber: input.lrNumber || "",
          lrDate: input.lrDate || "",
          dcIssueDate: input.dispatchDate || input.receiptDate,
          remarks: input.remarks || "",
        }) as { id: string; lines: Array<{ transportMovementId?: string }> };
        return put("fabricReceipts", {
          ...receipt,
          challanId: challan.id,
          transportMovementId: challan.lines[0]?.transportMovementId,
          version: receipt.version + 1,
        });
      }
      return receipt;
    }
    case "importIssue": {
      const issue = get("importIssues", str(input.id));
      const updated = put("importIssues", {
        ...issue,
        resolved: z.coerce.boolean().parse(input.resolved),
      });
      audit(
        user,
        updated.resolved ? "Resolved import issue" : "Reopened import issue",
        `${issue.sheet} row ${issue.rowNumber}`,
      );
      return updated;
    }
    case "syncConflict": {
      const conflict = get("syncConflicts", str(input.id));
      const resolution = z
        .enum(["portal", "workbook", "archive"])
        .parse(input.resolution);
      const updated = put("syncConflicts", { ...conflict, resolution });
      audit(
        user,
        "Resolved workbook conflict",
        `${conflict.sheet} row ${conflict.rowNumber}`,
        resolution,
      );
      return updated;
    }
    case "invoice": {
      const client = customer(input.customerId);
      const config = settings();
      const inputs = z
        .array(
          z.object({
            kind: z.enum(["fabric", "product"]),
            itemId: z.string(),
            quantity: z.coerce.number().positive(),
            price: z.coerce.number().nonnegative().max(1e7),
          }),
        )
        .min(1)
        .max(50)
        .parse(input.lines);
      const number = sequence("invoices", config.invoicePrefix);
      const lines: InvoiceLine[] = inputs.map((line) => {
        const price = cents(line.price);
        if (line.kind === "fabric") {
          const po = all("fabricOrders").find((order) => order.id === line.itemId && !order.archived);
          if (!po) throw new Error("Select a received fabric purchase order");
            const quantity = mm(line.quantity);
            const dispatched = all("transports")
              .filter((item) => item.fabricOrderId === po.id && item.stage !== "Void" && item.stage !== "Returned")
              .reduce((sum, item) => sum + item.fabricQuantity, 0);
            const sold = all("movements")
              .filter((item) => item.fabricOrderId === po.id && item.type === "Direct sale")
              .reduce((sum, item) => sum - item.quantity / 1000, 0);
            if (line.quantity > Math.max(0, po.receivedMetres - dispatched - sold) + 0.0005)
              throw new Error(`${po.poNumber}: insufficient received fabric in stock`);
            movement(user, "Direct sale", number, -quantity, { fabricOrderId: po.id });
            return {
              ...line,
              description: `${po.fabricName} · ${po.poNumber}`,
              quantity: quantity / 1000,
              unit: "m",
              price,
              total: Math.round((quantity / 1000) * price),
            };
        }
        const product = get("products", line.itemId);
        const quantity = integer(line.quantity, 1, 100000);
        if (quantity > product.stock - product.channelStock)
          throw new Error(
            `${product.name}: insufficient stock outside Shopify allocation`,
          );
        put("products", { ...product, stock: product.stock - quantity });
        movement(user, "Direct sale", number, -quantity, {
          productId: product.id,
        });
        return {
          ...line,
          description: `${product.name} · ${product.sku}`,
          quantity,
          unit: "pcs",
          price,
          total: quantity * price,
        };
      });
      const subtotal = lines.reduce((s, l) => s + l.total, 0);
      const discount = cents(input.discount);
      if (discount > subtotal)
        throw new Error("Discount exceeds the invoice subtotal");
      const taxRate = num(input.taxRate, 0, 100);
      const tax = Math.round(((subtotal - discount) * taxRate) / 100);
      const total = subtotal - discount + tax;
      const invoice: Invoice = {
        ...base("inv"),
        number,
        customerId: client.id,
        customerName: client.name,
        customerAddress: client.address,
        customerTaxId: client.taxId,
        companyName: config.companyName,
        companyAddress: config.address,
        companyTaxId: config.taxId,
        currency: config.currency,
        lines,
        subtotal,
        discount,
        taxRate,
        tax,
        total,
        paid: 0,
        dueDate: date(input.dueDate),
        notes: optional(input.notes),
        status: total === 0 ? "paid" : "unpaid",
      };
      put("invoices", invoice);
      audit(user, "Issued invoice & delivered stock", number, client.name);
      return invoice;
    }
    case "payment": {
      const invoice = get("invoices", str(input.invoiceId));
      const amount = cents(input.amount);
      if (amount <= 0 || amount > invoice.total - invoice.paid)
        throw new Error(
          "Payment must be positive and cannot exceed the outstanding balance",
        );
      const payment = put("payments", {
        ...base("pay"),
        invoiceId: invoice.id,
        amount,
        method: z
          .enum(["Bank transfer", "UPI", "Cash", "Card", "Cheque"])
          .parse(input.method),
        reference: str(input.reference, 150),
        date: date(input.date),
      });
      put("invoices", {
        ...invoice,
        paid: invoice.paid + amount,
        status: invoice.paid + amount === invoice.total ? "paid" : "partial",
      });
      audit(user, "Recorded payment", invoice.number, payment.reference);
      return payment;
    }
    case "settings": {
      const currency = z
        .string()
        .regex(/^[A-Z]{3}$/)
        .parse(input.currency);
      try {
        new Intl.NumberFormat("en", { style: "currency", currency });
      } catch {
        throw new Error("Use a valid three-letter currency code");
      }
      if (
        currency !== settings().currency &&
        (all("fabricOrders").length ||
          all("invoices").length)
      )
        throw new Error(
          "Currency cannot change after monetary records are created",
        );
      const config = {
        companyName: str(input.companyName, 120),
        email: optional(input.email, 254),
        phone: optional(input.phone, 50),
        address: optional(input.address),
        taxId: optional(input.taxId, 100),
        currency,
        taxRate: num(input.taxRate, 0, 100),
        invoicePrefix: z
          .string()
          .regex(/^[A-Z0-9-]{1,10}$/)
          .parse(input.invoicePrefix),
        paymentDetails: optional(input.paymentDetails),
        portalName: optional(input.portalName, 120) || "Carnot CRM",
        brandName: optional(input.brandName, 120) || "Carnot",
        logisticsName: optional(input.logisticsName, 120) || "Singal Fabrics",
        logisticsEmail: optional(input.logisticsEmail, 254),
        logisticsPhone: optional(input.logisticsPhone, 50),
        logisticsAddress: optional(input.logisticsAddress),
        logisticsTaxId: optional(input.logisticsTaxId, 100),
      };
      saveSettings(config);
      audit(user, "Updated company settings", config.companyName);
      return config;
    }
    case "user": {
      const role = z
        .enum([
          "admin",
          "supplier",
          "agent",
          "transporter",
          "delivery",
          "jobworker",
          "distributor",
          "tailor",
        ])
        .parse(input.role);
      const partnerId = optional(input.partnerId, 100) || undefined;
      if (!["admin", "tailor"].includes(role) && !partnerId)
        throw new Error(
          "Link partner accounts to an imported organization or person",
        );
      const linkedOrganization = partnerId
        ? all("organizations").find(
            (organization) => organization.id === partnerId,
          )
        : undefined;
      const linkedPerson = partnerId
        ? all("people").find((person) => person.id === partnerId)
        : undefined;
      if (partnerId && !linkedOrganization && !linkedPerson)
        throw new Error("Linked partner record was not found");
      if (role === "delivery" && !linkedPerson)
        throw new Error(
          "Delivery accounts must link to a driver, pickup, or delivery person",
        );
      if (
        [
          "supplier",
          "agent",
          "transporter",
          "jobworker",
          "distributor",
        ].includes(role)
      ) {
        if (!linkedOrganization)
          throw new Error(`${role} accounts must link to an organization`);
        const acceptedRoles: Record<string, string[]> = {
          supplier: ["supplier", "vendor"],
          agent: ["agent"],
          transporter: ["transporter"],
          jobworker: ["jobworker"],
          distributor: ["distributor"],
        };
        if (
          !linkedOrganization.roles.some((linkedRole) =>
            acceptedRoles[role].includes(linkedRole),
          )
        )
          throw new Error(
            `Choose an organization marked as ${acceptedRoles[role].join(" or ")}`,
          );
      }
      if (
        role === "tailor" &&
        partnerId &&
        (!linkedOrganization || !linkedOrganization.roles.includes("jobworker"))
      )
        throw new Error(
          "Tailor accounts must link to a jobworker organization when a partner is selected",
        );
      const person = createUser(
        str(input.name, 100),
        z.email().parse(input.email),
        str(input.password, 128),
        role,
        partnerId,
      );
      audit(user, "Created account", person.name, person.role);
      return person;
    }
    case "userStatus": {
      const id = str(input.id);
      const active = z.boolean().parse(input.active);
      if (id === user.id)
        throw new Error("You cannot disable your own account");
      const person = users().find((u) => u.id === id);
      if (!person) throw new Error("User not found");
      if (
        !active &&
        all("jobs").some((j) => j.tailorId === id && j.status !== "accepted")
      )
        throw new Error(
          "Complete open tailor assignments before disabling this account",
        );
      setUserActive(id, active);
      audit(user, active ? "Enabled account" : "Disabled account", person.name);
      return { success: true };
    }
    case "resetPassword": {
      const id = str(input.id);
      const person = users().find((u) => u.id === id);
      if (!person) throw new Error("User not found");
      resetPassword(id, str(input.password, 128));
      audit(user, "Reset account password", person.name);
      return { success: true };
    }
    default:
      throw new Error("Unknown operation");
  }
}
