"use client";

import Link from "next/link";
import {
  Archive,
  Building2,
  Download,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  Truck,
  Upload,
  X,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import type {
  FabricOrder,
  Organization,
  OrganizationRole,
  State,
} from "@/lib/types";
import {
  currentFinancialYear,
  inPeriod,
  periodQuery,
  type PeriodMode,
} from "@/lib/period";
import type { Mutate } from "./editor";
import { Badge, Empty, SectionTitle } from "./ui";

const PAGE_SIZE = 50;
const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

export type OperationFilters = Record<string, string | undefined>;

export function usePeriodSelection(initial: OperationFilters = {}) {
  const requested = initial.period as PeriodMode | undefined;
  const [mode, setMode] = useState<PeriodMode>(
    requested &&
      [
        "last-7",
        "last-30",
        "last-90",
        "last-180",
        "current-quarter",
        "year-to-date",
        "fy",
        "custom",
        "all",
        "this-month",
        "previous-month",
        "month",
      ].includes(requested)
      ? requested
      : "last-90",
  );
  const [month, setMonth] = useState(
    initial.month || new Date().toISOString().slice(0, 7),
  );
  const [fy, setFy] = useState(initial.fy || currentFinancialYear());
  const now = new Date(),
    defaultEnd = now.toISOString().slice(0, 10),
    defaultStart = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate())
      .toISOString()
      .slice(0, 10);
  const [customStart, setCustomStart] = useState(
    initial.start || defaultStart,
  );
  const [customEnd, setCustomEnd] = useState(initial.end || defaultEnd);
  return {
    mode,
    setMode,
    month,
    setMonth,
    fy,
    setFy,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
  };
}

export function inSelectedPeriod(
  value: string | undefined,
  period: ReturnType<typeof usePeriodSelection>,
) {
  return inPeriod(
    value,
    period.mode,
    period.month,
    period.fy,
    new Date(),
    period.customStart,
    period.customEnd,
  );
}

export function PeriodBar({
  period,
}: {
  period: ReturnType<typeof usePeriodSelection>;
}) {
  const start = Number(currentFinancialYear().split("-")[0]);
  return (
    <div className="period-bar" aria-label="Period filter">
      <label>
        <span>Period</span>
        <select
          value={period.mode}
          onChange={(event) => period.setMode(event.target.value as PeriodMode)}
        >
          <option value="last-7">Last 7 days</option>
          <option value="last-30">Last 30 days</option>
          <option value="last-90">Last 90 days</option>
          <option value="last-180">Last 6 months</option>
          <option value="current-quarter">Current quarter</option>
          <option value="year-to-date">Calendar year to date</option>
          <option value="fy">Indian financial year (Apr–Mar)</option>
          <option value="custom">Custom date range</option>
          <option value="all">All time</option>
        </select>
      </label>
      {period.mode === "fy" && (
        <label>
          <span>Financial year</span>
          <select
            value={period.fy}
            onChange={(event) => period.setFy(event.target.value)}
          >
            {[start - 2, start - 1, start, start + 1].map((year) => (
              <option
                key={year}
                value={`${year}-${String(year + 1).slice(-2)}`}
              >
                FY {year}–{String(year + 1).slice(-2)} · 1 Apr {year}–31 Mar {year + 1}
              </option>
            ))}
          </select>
        </label>
      )}
      {period.mode === "custom" && (
        <>
          <label>
            <span>From</span>
            <input
              type="date"
              value={period.customStart}
              onChange={(event) => period.setCustomStart(event.target.value)}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              value={period.customEnd}
              min={period.customStart}
              onChange={(event) => period.setCustomEnd(event.target.value)}
            />
          </label>
        </>
      )}
      {period.mode === "fy" && (
        <p className="period-help">Indian FY runs from 1 April to 31 March.</p>
      )}
    </div>
  );
}

const table = (headings: string[], rows: ReactNode) => (
  <div className="table-scroll">
    <table>
      <thead>
        <tr>
          {headings.map((heading) => (
            <th key={heading}>{heading}</th>
          ))}
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
  </div>
);

function Pager({
  total,
  page,
  setPage,
}: {
  total: number;
  page: number;
  setPage: (page: number) => void;
}) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  return (
    <div className="pagination">
      <span>
        Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}{" "}
        of {total}
      </span>
      <div>
        <button
          className="button secondary small"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button
          className="button secondary small"
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function EnhancedDashboard({
  state,
  filters = {},
}: {
  state: State;
  filters?: OperationFilters;
}) {
  const period = usePeriodSelection(filters);
  const orders = state.fabricOrders.filter(
    (item) => !item.archived && inSelectedPeriod(item.orderDate, period),
  );
  const transports = state.transports.filter((item) =>
    inSelectedPeriod(item.dcIssueDate || item.lrDate, period),
  );
  const active = state.workOrders.filter(
    (item) =>
      !item.archived &&
      inSelectedPeriod(item.issuedDate || item.fabricOutwardDate, period),
  );
  const inwardIds = new Set(
    state.inwards
      .filter((item) => inSelectedPeriod(item.inwardDate, period))
      .map((item) => item.id),
  );
  const inwards = state.inwards.filter((item) => inwardIds.has(item.id));
  const clearedIds = new Set(inwards.map((item) => item.workOrderId));
  const cleared = state.workOrders.filter(
    (item) => item.archived && clearedIds.has(item.id),
  );
  const totalInward = inwards.reduce((sum, item) => sum + item.totalInward, 0);
  const damage = inwards.reduce(
    (sum, item) => sum + item.damagePiecesQuantity,
    0,
  );
  const query = periodQuery(
    period.mode,
    period.month,
    period.fy,
    period.customStart,
    period.customEnd,
  );
  const attention = active
    .filter((item) => item.ageingDays >= 45)
    .sort((a, b) => b.ageingDays - a.ageingDays)
    .slice(0, 8);
  const openChallans = state.challans.filter(
    (challan) =>
      transports.some((movement) => movement.challanId === challan.id) &&
      !["Acknowledged", "Void", "Returned"].includes(challan.status),
  );
  return (
    <>
      <PeriodBar period={period} />
      <div className="stats clickable-stats">
        <Link href={`/fabric-orders?${query}`} className="stat">
          <span className="stat-label">Fabric ordered</span>
          <strong>
            {orders
              .reduce((sum, item) => sum + item.quantityOrdered, 0)
              .toLocaleString("en-IN")}{" "}
            m
          </strong>
          <span>
            {money(orders.reduce((sum, item) => sum + item.fabricValue, 0))} ·
            view orders
          </span>
        </Link>
        <Link href={`/production?${query}`} className="stat">
          <span className="stat-label">At jobworkers</span>
          <strong>
            {active
              .reduce((sum, item) => sum + item.bodyFabric + item.trimFabric, 0)
              .toLocaleString("en-IN")}{" "}
            m
          </strong>
          <span>{active.length} active work orders · drill down</span>
        </Link>
        <Link href={`/cleared-lots?${query}`} className="stat">
          <span className="stat-label">Garments inward</span>
          <strong>{totalInward.toLocaleString("en-IN")}</strong>
          <span>{damage.toLocaleString("en-IN")} damaged · reconcile</span>
        </Link>
        <Link href={`/cleared-lots?${query}`} className="stat">
          <span className="stat-label">Lots cleared</span>
          <strong>{cleared.length}</strong>
          <span>
            {state.importIssues.filter((item) => !item.resolved).length} import
            issues
          </span>
        </Link>
      </div>
      <div className="operations-dashboard">
        <section className="panel">
          <SectionTitle title="Production ageing">
            Active work orders crossing the 45-day attention threshold.
          </SectionTitle>
          {attention.length ? (
            table(
              ["Work order", "Jobworker", "Item", "Stage", "Age"],
              attention.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link
                      className="text-link"
                      href={`/production?${query}&open=${encodeURIComponent(item.id)}`}
                    >
                      {item.woNumber}
                    </Link>
                    <small>{item.dcNumber}</small>
                  </td>
                  <td>{item.jobworkerName}</td>
                  <td>{item.itemName}</td>
                  <td>
                    <Badge>{item.status}</Badge>
                  </td>
                  <td>
                    <Badge tone={item.ageingDays >= 60 ? "red" : "amber"}>
                      {item.ageingDays} days
                    </Badge>
                  </td>
                </tr>
              )),
            )
          ) : (
            <Empty title="No ageing work orders in this period" />
          )}
        </section>
        <aside className="panel dashboard-attention">
          <SectionTitle title="Flow health" />
          <Link
            href={`/fabric-orders?${query}&status=Received`}
            className="health-row"
          >
            <FileText size={18} />
            <span>
              <strong>
                {orders.filter((item) => item.status === "Received").length}
              </strong>{" "}
              purchase orders received
            </span>
          </Link>
          <Link
            href={`/transport-dc?${query}&stage=open`}
            className="health-row"
          >
            <Truck size={18} />
            <span>
              <strong>{openChallans.length}</strong> challans awaiting
              acknowledgement
            </span>
          </Link>
          <Link href={`/production?${query}&age=60`} className="health-row">
            <Archive size={18} />
            <span>
              <strong>
                {active.filter((item) => item.ageingDays >= 60).length}
              </strong>{" "}
              work orders over 60 days
            </span>
          </Link>
        </aside>
      </div>
    </>
  );
}

function parties(state: State) {
  return state.organizations.filter(
    (organization) =>
      !organization.archived && organization.roles.includes("distributor"),
  );
}

export function EnhancedFabricOrders({
  state,
  query,
  mutate,
  filters = {},
}: {
  state: State;
  query: string;
  mutate: Mutate;
  filters?: OperationFilters;
}) {
  const period = usePeriodSelection(filters);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(filters.open || "");
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [urlStatus] = useState(filters.status || "");
  const normalizedQuery = query.trim().toLowerCase();
  const orders = state.fabricOrders.filter((order) => {
    const searchable = JSON.stringify({
      ...order,
      source: `${order.sourceSheet || "Portal"} ${order.sourceRow || ""}`,
    }).toLowerCase();
    return (
      !order.archived &&
      (!normalizedQuery || searchable.includes(normalizedQuery)) &&
      (!urlStatus || order.status === urlStatus) &&
      inSelectedPeriod(order.orderDate, period)
    );
  });
  const selected = state.fabricOrders.find((order) => order.id === selectedId);
  const visible = orders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("fabricOrder", {
      ...Object.fromEntries(form),
      partyIds: form.getAll("partyIds"),
    });
    event.currentTarget.reset();
    setCreateOpen(false);
  }
  return (
    <>
      <PeriodBar period={period} />
      {state.user.role === "admin" && (
        <section className="panel quick-create">
          <div className="row-between">
            <div>
              <span className="eyebrow">PURCHASING</span>
              <h3>Create a fabric purchase order</h3>
            </div>
            <button
              className="button secondary small"
              onClick={() => setCreateOpen(!createOpen)}
            >
              <Plus size={15} /> {createOpen ? "Close" : "New PO"}
            </button>
          </div>
          {createOpen && (
            <form className="inline-create" onSubmit={create}>
              <select name="fabricSpecId" required defaultValue="">
                <option value="" disabled>
                  Fabric specification
                </option>
                {state.fabricSpecs.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ·{" "}
                    {
                      state.organizations.find(
                        (org) => org.id === item.supplierId,
                      )?.name
                    }
                  </option>
                ))}
              </select>
              <input
                name="orderDate"
                type="date"
                required
                aria-label="Order date"
              />
              <input
                name="deliveryDate"
                type="date"
                required
                aria-label="Delivery date"
              />
              <input name="fabricType" required placeholder="Fabric type" />
              <input
                name="pricePerMetre"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="Price per metre"
              />
              <input
                name="quantityOrdered"
                type="number"
                min="0.001"
                step="0.001"
                required
                placeholder="Quantity metres"
              />
              <input name="designs" required placeholder="Designs" />
              <input name="colors" required placeholder="Colors" />
              <label className="multi-field">
                <span>Parties / distributors</span>
                <select name="partyIds" multiple required>
                  {parties(state).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <input name="fabricFor" required placeholder="Fabric for" />
              <input name="remarks" placeholder="Remarks" />
              <button className="button primary" type="submit">
                Create PO
              </button>
            </form>
          )}
        </section>
      )}
      <section className="panel operations-panel">
        <SectionTitle title="Fabric purchase orders">
          Search covers every PO field, dates, quantities, values, remarks, and
          workbook source metadata.
        </SectionTitle>
        {orders.length ? (
          table(
            [
              "PO / date",
              "Fabric",
              "Supplier",
              "Purpose",
              "Ordered / received",
              "Value",
              "Status",
              "",
            ],
            visible.map((order) => (
              <tr key={order.id}>
                <td>
                  <button
                    className="text-link strong-link"
                    onClick={() => setSelectedId(order.id)}
                  >
                    {order.poNumber}
                  </button>
                  <small>
                    {order.orderDate} · row {order.sourceRow || "Portal"}
                  </small>
                </td>
                <td>
                  <strong>{order.fabricName}</strong>
                  <small>
                    {order.internalItemName || order.fabricType} · {order.width}
                    &quot; · {order.content}
                  </small>
                </td>
                <td>
                  {order.supplierName}
                  <small>{order.agentName || "No agent"}</small>
                </td>
                <td>
                  {order.fabricFor}
                  <small>{order.purposeParty}</small>
                </td>
                <td>
                  {order.quantityOrdered.toLocaleString("en-IN")} m
                  <small>
                    {order.receivedMetres.toLocaleString("en-IN")} received ·{" "}
                    {order.cancelledMetres.toLocaleString("en-IN")} cancelled
                  </small>
                </td>
                <td>
                  {money(order.fabricValue)}
                  <small>{money(order.pricePerMetre)} / m</small>
                </td>
                <td>
                  <Badge>{order.status}</Badge>
                </td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={`View ${order.poNumber}`}
                    onClick={() => setSelectedId(order.id)}
                  >
                    <FileText size={16} />
                  </button>
                </td>
              </tr>
            )),
          )
        ) : (
          <Empty title="No fabric orders found">
            Change the period or search, or create a new PO.
          </Empty>
        )}
        <Pager total={orders.length} page={page} setPage={setPage} />
      </section>
      {selected && (
        <FabricOrderDrawer
          order={selected}
          state={state}
          mutate={mutate}
          close={() => setSelectedId("")}
          busy={busy}
          setBusy={setBusy}
          message={message}
          setMessage={setMessage}
        />
      )}
    </>
  );
}

function FabricOrderDrawer({
  order,
  state,
  mutate,
  close,
  busy,
  setBusy,
  message,
  setMessage,
}: {
  order: FabricOrder;
  state: State;
  mutate: Mutate;
  close: () => void;
  busy: boolean;
  setBusy: (value: boolean) => void;
  message: string;
  setMessage: (value: string) => void;
}) {
  const [tab, setTab] = useState<"details" | "edit" | "receive">("details");
  const receipts = state.fabricReceipts.filter(
    (item) => item.fabricOrderId === order.id,
  );
  const movements = state.transports.filter(
    (item) => item.fabricOrderId === order.id,
  );
  const attachments = state.attachments.filter(
    (item) => item.entityId === order.id && !item.deletedAt,
  );
  async function status(next: FabricOrder["status"], voidOrder = false) {
    const reason = voidOrder ? window.prompt("Reason for voiding this PO") : "";
    if (voidOrder && !reason) return;
    const receivedMetres =
      next === "Partial"
        ? window.prompt(
            "Received metres for this partial order",
            String(order.receivedMetres || ""),
          )
        : undefined;
    if (next === "Partial" && receivedMetres === null) return;
    await mutate("fabricOrderStatus", {
      id: order.id,
      status: next,
      receivedMetres,
      void: voidOrder,
      reason,
    });
    if (voidOrder) close();
  }
  async function edit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("fabricOrderUpdate", {
      id: order.id,
      ...Object.fromEntries(form),
      partyIds: form.getAll("partyIds"),
    });
    setTab("details");
  }
  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutate("fabricReceipt", {
      fabricOrderId: order.id,
      ...Object.fromEntries(new FormData(event.currentTarget)),
    });
    setTab("details");
  }
  async function upload(file: File) {
    setBusy(true);
    setMessage("");
    try {
      const meta = {
        entityKind: "fabricOrder",
        entityId: order.id,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      };
      const presignResponse = await fetch("/api/attachments/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meta),
      });
      const presign = await presignResponse.json();
      if (!presignResponse.ok) throw new Error(presign.error);
      const uploadResponse = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadResponse.ok)
        throw new Error(
          "S3 rejected the upload. Check bucket CORS and credentials.",
        );
      const completeResponse = await fetch("/api/attachments/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...meta,
          attachmentId: presign.attachmentId,
          s3Key: presign.s3Key,
        }),
      });
      const complete = await completeResponse.json();
      if (!completeResponse.ok) throw new Error(complete.error);
      await mutate("recordNote", {
        kind: "fabricOrders",
        id: order.id,
        note: `Attached ${file.name}`,
      });
      setMessage("Attachment uploaded");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="drawer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <aside
        className="record-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Purchase order ${order.poNumber}`}
      >
        <header>
          <div>
            <span className="eyebrow">FABRIC PURCHASE ORDER</span>
            <h2>{order.poNumber}</h2>
            <p>
              {order.fabricName} · {order.supplierName}
            </p>
          </div>
          <button className="icon-button" aria-label="Close" onClick={close}>
            <X size={19} />
          </button>
        </header>
        <div className="drawer-tabs">
          <button
            className={tab === "details" ? "active" : ""}
            onClick={() => setTab("details")}
          >
            Details
          </button>
          {state.user.role === "admin" && (
            <>
              <button
                className={tab === "edit" ? "active" : ""}
                onClick={() => setTab("edit")}
              >
                <Pencil size={14} /> Edit
              </button>
              <button
                className={tab === "receive" ? "active" : ""}
                onClick={() => setTab("receive")}
              >
                Receive
              </button>
            </>
          )}
        </div>
        {tab === "details" && (
          <div className="drawer-content">
            <div className="detail-grid">
              {Object.entries({
                "Order date": order.orderDate,
                "Delivery date": order.deliveryDate || "Legacy – not supplied",
                Supplier: order.supplierName,
                Agent: order.agentName || "—",
                Fabric: order.fabricName,
                Type: order.fabricType,
                Width: order.width,
                Folding: order.folding,
                Weave: order.weave || "—",
                Content: order.content,
                Construction: order.construction || "—",
                "Thread count": order.threadCount || "—",
                Designs: order.designs,
                Colors: order.colors,
                Parties: order.purposeParty,
                "Fabric for": order.fabricFor,
                Ordered: `${order.quantityOrdered} m`,
                Received: `${order.receivedMetres} m`,
                Cancelled: `${order.cancelledMetres} m`,
                Price: `${money(order.pricePerMetre)} / m`,
                Value: money(order.fabricValue),
                Status: order.status,
                Remarks: order.remarks || "—",
                Source: order.sourceSheet
                  ? `${order.sourceSheet}, row ${order.sourceRow}`
                  : "Portal",
              }).map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <section>
              <h3>Receipts & logistics</h3>
              {receipts.length ? (
                receipts.map((item) => (
                  <article className="timeline-item" key={item.id}>
                    <strong>
                      {item.quantityMetres.toLocaleString("en-IN")} m ·{" "}
                      {item.receiptDate}
                    </strong>
                    <span>
                      {item.warehouse}
                      {item.lrNumber ? ` · LR ${item.lrNumber}` : ""}
                      {item.transportName ? ` · ${item.transportName}` : ""}
                    </span>
                  </article>
                ))
              ) : (
                <p className="muted">No receipts recorded.</p>
              )}
              {movements.map((item) => (
                <article className="timeline-item" key={item.id}>
                  <Link
                    className="text-link"
                    href={`/delivery-challan/${item.challanId}`}
                  >
                    {item.outwardDcNumber}
                  </Link>
                  <span>
                    {item.fabricQuantity} m · {item.transportName} →{" "}
                    {item.destinationJobworkerName}
                  </span>
                </article>
              ))}
            </section>
            <section>
              <div className="row-between">
                <h3>Attachments</h3>
                {state.user.role === "admin" && (
                  <label className="button secondary small">
                    <Upload size={14} /> {busy ? "Uploading…" : "Upload"}
                    <input
                      className="visually-hidden"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      disabled={busy}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) upload(file);
                      }}
                    />
                  </label>
                )}
              </div>
              {message && <p className="form-note">{message}</p>}
              {attachments.length ? (
                attachments.map((item) => (
                  <div className="attachment-row" key={item.id}>
                    <Paperclip size={15} />
                    <a
                      className="text-link"
                      href={`/api/attachments/${item.id}/download`}
                      target="_blank"
                    >
                      {item.fileName}
                    </a>
                    <span>{(item.sizeBytes / 1024).toFixed(0)} KB</span>
                    {state.user.role === "admin" && (
                      <button
                        className="text-link danger"
                        onClick={async () => {
                          await fetch(`/api/attachments/${item.id}`, {
                            method: "DELETE",
                          });
                          window.location.reload();
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="muted">JPEG, PNG, WebP, or PDF up to 10 MB.</p>
              )}
            </section>
            <section>
              <h3>Notes & audit</h3>
              {(order.notesLog || []).map((note, index) => (
                <article
                  className="timeline-item"
                  key={`${note.date}-${index}`}
                >
                  <strong>{note.author}</strong>
                  <span>
                    {new Date(note.date).toLocaleString("en-IN")} · {note.note}
                  </span>
                </article>
              ))}
              <button
                className="text-link"
                onClick={async () => {
                  const note = window.prompt("Add note");
                  if (note)
                    await mutate("recordNote", {
                      kind: "fabricOrders",
                      id: order.id,
                      note,
                    });
                }}
              >
                Add note
              </button>
            </section>
            {state.user.role === "admin" && (
              <div className="action-strip">
                <button
                  className="button secondary small"
                  onClick={() => status("Ordered")}
                >
                  Mark ordered
                </button>
                <button
                  className="button secondary small"
                  onClick={() => status("Partial")}
                >
                  Mark partial
                </button>
                <button
                  className="button secondary small"
                  onClick={() => status("Received")}
                >
                  Mark received
                </button>
                <button
                  className="button secondary small"
                  onClick={() => status("Cancelled")}
                >
                  Cancel
                </button>
                <button
                  className="button danger-button small"
                  onClick={() => status("Cancelled", true)}
                >
                  Void / archive
                </button>
              </div>
            )}
          </div>
        )}
        {tab === "edit" && (
          <form className="drawer-form" onSubmit={edit}>
            <label>
              Order date
              <input
                name="orderDate"
                type="date"
                required
                defaultValue={order.orderDate}
              />
            </label>
            <label>
              Delivery date
              <input
                name="deliveryDate"
                type="date"
                required
                defaultValue={order.deliveryDate}
              />
            </label>
            <label>
              Internal item
              <input
                name="internalItemName"
                defaultValue={order.internalItemName}
              />
            </label>
            <label>
              Fabric name
              <input
                name="fabricName"
                required
                defaultValue={order.fabricName}
              />
            </label>
            <label>
              Supplier
              <select name="supplierId" defaultValue={order.supplierId}>
                {state.organizations
                  .filter((item) =>
                    item.roles.some((role) =>
                      ["supplier", "vendor"].includes(role),
                    ),
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Fabric type
              <input
                name="fabricType"
                required
                defaultValue={order.fabricType}
              />
            </label>
            <label>
              Quantity metres
              <input
                name="quantityOrdered"
                type="number"
                step="0.001"
                required
                defaultValue={order.quantityOrdered}
              />
            </label>
            <label>
              Price per metre
              <input
                name="pricePerMetre"
                type="number"
                step="0.01"
                required
                defaultValue={order.pricePerMetre}
              />
            </label>
            <label>
              Designs
              <input name="designs" required defaultValue={order.designs} />
            </label>
            <label>
              Colors
              <input name="colors" required defaultValue={order.colors} />
            </label>
            <label className="multi-field">
              Parties
              <select
                name="partyIds"
                multiple
                defaultValue={order.partyIds || []}
              >
                {parties(state).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fabric for
              <input name="fabricFor" required defaultValue={order.fabricFor} />
            </label>
            <label className="span-all">
              Remarks
              <textarea name="remarks" defaultValue={order.remarks} />
            </label>
            <button className="button primary" type="submit">
              Save changes
            </button>
          </form>
        )}
        {tab === "receive" && (
          <form className="drawer-form" onSubmit={receive}>
            <p className="form-note span-all">
              Record fabric received into stock. Fill the dispatch section to
              create a linked transport movement and delivery challan at the
              same time.
            </p>
            <label>
              Receipt date
              <input
                name="receiptDate"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label>
              Quantity metres
              <input
                name="quantityMetres"
                type="number"
                min="0.001"
                max={
                  order.quantityOrdered -
                  order.receivedMetres -
                  order.cancelledMetres
                }
                step="0.001"
                required
              />
            </label>
            <label>
              Warehouse
              <input name="warehouse" required defaultValue="Singal Fabrics" />
            </label>
            <label>
              Lot number
              <input name="lotNumber" />
            </label>
            <label>
              LR number
              <input name="lrNumber" />
            </label>
            <label>
              LR date
              <input name="lrDate" type="date" />
            </label>
            <label>
              Transporter
              <select name="transporterId" defaultValue="">
                <option value="">No linked transport</option>
                {state.organizations
                  .filter((item) => item.roles.includes("transporter"))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Bales
              <input name="numberOfBales" type="number" min="1" />
            </label>
            <label>
              Source
              <input name="sourceLocation" defaultValue={order.supplierName} />
            </label>
            <label>
              Destination
              <input name="destinationLocation" defaultValue="Singal Fabrics" />
            </label>
            <label>
              Party
              <select name="partyId" defaultValue="">
                <option value="">Select when dispatching</option>
                {parties(state).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Jobworker
              <select name="jobworkerId" defaultValue="">
                <option value="">Select when dispatching</option>
                {state.organizations
                  .filter((item) => item.roles.includes("jobworker"))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Picked by
              <input name="pickedBy" />
            </label>
            <label>
              Dispatch date
              <input name="dispatchDate" type="date" />
            </label>
            <label className="span-all">
              Dispatch details
              <textarea name="dispatchDetails" />
            </label>
            <label className="span-all">
              Remarks
              <textarea name="remarks" />
            </label>
            <button className="button primary" type="submit">
              Record receipt
            </button>
          </form>
        )}
      </aside>
    </div>
  );
}

type TransportFilter =
  | "all"
  | "pending"
  | "warehouse"
  | "transit"
  | "dispatched"
  | "delivered"
  | "acknowledged"
  | "returned"
  | "void"
  | "unplanned"
  | "open";
function transportBucket(
  stage: string,
  status: string,
  linked: boolean,
): TransportFilter[] {
  const value = `${stage} ${status}`.toLowerCase();
  const buckets: TransportFilter[] = ["all"];
  if (!linked) buckets.push("unplanned");
  if (status === "Acknowledged") buckets.push("acknowledged");
  if (status === "Delivered") buckets.push("delivered", "open");
  if (status === "Returned") buckets.push("returned");
  if (status === "Void") buckets.push("void");
  if (value.includes("warehouse")) buckets.push("warehouse", "pending", "open");
  if (value.includes("transit") || status === "Picked Up")
    buckets.push("transit", "open");
  if (value.includes("dispatch") || status === "Issued")
    buckets.push("dispatched", "pending", "open");
  return buckets;
}

export function EnhancedTransport({
  state,
  query,
  filters = {},
}: {
  state: State;
  query: string;
  filters?: OperationFilters;
}) {
  const period = usePeriodSelection(filters);
  const [filter, setFilter] = useState<TransportFilter>(
    (filters.stage as TransportFilter) || "all",
  );
  const [transporter, setTransporter] = useState("");
  const [page, setPage] = useState(1);
  const challans = new Map(state.challans.map((item) => [item.id, item]));
  const allPeriod = state.transports.filter((item) =>
    inSelectedPeriod(item.dcIssueDate || item.lrDate, period),
  );
  const movements = allPeriod.filter((item) => {
    const status = item.challanId
      ? challans.get(item.challanId)?.status || item.stage
      : item.stage;
    return (
      transportBucket(item.stage, status, !!item.fabricOrderId).includes(
        filter,
      ) &&
      (!transporter || item.transporterId === transporter) &&
      JSON.stringify(item).toLowerCase().includes(query.toLowerCase())
    );
  });
  const visible = movements.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const cards: Array<[TransportFilter, string]> = [
    ["pending", "Pending with transporter"],
    ["warehouse", "At transporter warehouse"],
    ["transit", "In transit"],
    ["delivered", "Delivered"],
    ["acknowledged", "Acknowledged"],
    ["unplanned", "Unplanned"],
  ];
  return (
    <>
      <PeriodBar period={period} />
      <div className="stats transport-stats">
        {cards.map(([key, label]) => (
          <button
            key={key}
            className={`stat ${filter === key ? "selected" : ""}`}
            onClick={() => {
              setFilter(key);
              setPage(1);
            }}
          >
            <span className="stat-label">{label}</span>
            <strong>
              {
                allPeriod.filter((item) =>
                  transportBucket(
                    item.stage,
                    item.challanId
                      ? challans.get(item.challanId)?.status || item.stage
                      : item.stage,
                    !!item.fabricOrderId,
                  ).includes(key),
                ).length
              }
            </strong>
            <span>View matching movements</span>
          </button>
        ))}
      </div>
      <section className="panel operations-panel">
        <SectionTitle title="Transport and delivery challans">
          Track fabric held by each transporter, warehouse, route, factory, and
          acknowledgement state.
        </SectionTitle>
        <div className="filter-row">
          <select
            value={filter}
            onChange={(event) =>
              setFilter(event.target.value as TransportFilter)
            }
          >
            <option value="all">All stages</option>
            <option value="open">Open / awaiting acknowledgement</option>
            {cards.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
            <option value="dispatched">Dispatched to jobworker</option>
            <option value="returned">Returned</option>
            <option value="void">Void</option>
          </select>
          <select
            value={transporter}
            onChange={(event) => setTransporter(event.target.value)}
          >
            <option value="">All transporters / warehouses</option>
            {state.organizations
              .filter((item) => item.roles.includes("transporter"))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
          <button
            className="button secondary small"
            onClick={() => {
              setFilter("all");
              setTransporter("");
            }}
          >
            Clear filters
          </button>
        </div>
        {movements.length ? (
          table(
            [
              "DC / PO",
              "Fabric",
              "Supplier / party",
              "Transport / LR",
              "Destination",
              "Quantity",
              "Stage",
              "Document",
            ],
            visible.map((item) => {
              const challan = item.challanId
                ? challans.get(item.challanId)
                : undefined;
              return (
                <tr key={item.id}>
                  <td>
                    <Link
                      className="text-link strong-link"
                      href={
                        item.challanId
                          ? `/delivery-challan/${item.challanId}`
                          : "#"
                      }
                    >
                      {item.outwardDcNumber}
                    </Link>
                    <small>
                      {item.poNumber ? (
                        <Link
                          className="text-link"
                          href={`/fabric-orders?open=${item.fabricOrderId}`}
                        >
                          {item.poNumber}
                        </Link>
                      ) : (
                        "Unplanned fabric"
                      )}{" "}
                      · {item.dcIssueDate}
                    </small>
                  </td>
                  <td>
                    <strong>{item.fabricName}</strong>
                    <small>{item.numberOfBales} bales</small>
                  </td>
                  <td>
                    {item.supplierName}
                    <small>{item.partyName}</small>
                  </td>
                  <td>
                    {item.transportName}
                    <small>
                      LR {item.lrNumber || "—"} · {item.pickedBy}
                    </small>
                  </td>
                  <td>{item.destinationJobworkerName}</td>
                  <td>
                    {item.fabricQuantity.toLocaleString("en-IN")} m
                    <small>
                      {state.user.role === "admin" ? money(item.value) : ""}
                    </small>
                  </td>
                  <td>
                    <Badge>{challan?.status || item.stage}</Badge>
                  </td>
                  <td>
                    {item.challanId && (
                      <Link
                        className="icon-button"
                        aria-label={`Open ${item.outwardDcNumber}`}
                        href={`/delivery-challan/${item.challanId}`}
                      >
                        <Download size={16} />
                      </Link>
                    )}
                  </td>
                </tr>
              );
            }),
          )
        ) : (
          <Empty title="No movements match these filters" />
        )}
        <Pager total={movements.length} page={page} setPage={setPage} />
      </section>
    </>
  );
}

const partnerRoles: OrganizationRole[] = [
  "supplier",
  "vendor",
  "agent",
  "jobworker",
  "transporter",
  "distributor",
  "customer",
  "legal_entity",
];
export function EnhancedPartners({
  state,
  query,
  mutate,
  suppliersOnly = false,
}: {
  state: State;
  query: string;
  mutate: Mutate;
  suppliersOnly?: boolean;
}) {
  const [selected, setSelected] = useState<Organization | null>(null);
  const [adding, setAdding] = useState(false);
  const [page, setPage] = useState(1);
  const partners = state.organizations.filter(
    (item) =>
      !item.archived &&
      (!suppliersOnly ||
        item.roles.some((role) => role === "supplier" || role === "vendor")) &&
      JSON.stringify(item).toLowerCase().includes(query.toLowerCase()),
  );
  const visible = partners.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("organization", {
      id: selected?.id,
      name: form.get("name"),
      roles: form.getAll("roles"),
      email: form.get("email"),
      phone: form.get("phone"),
      address: form.get("address"),
      taxId: form.get("taxId"),
      notes: form.get("notes"),
    });
    setSelected(null);
    setAdding(false);
  }
  const editing = selected || adding;
  return (
    <>
      <div className="stats compact-stats">
        <div className="stat">
          <span className="stat-label">Suppliers / vendors</span>
          <strong>
            {
              state.organizations.filter((item) =>
                item.roles.some(
                  (role) => role === "supplier" || role === "vendor",
                ),
              ).length
            }
          </strong>
          <span>mills and sourcing partners</span>
        </div>
        <div className="stat">
          <span className="stat-label">Jobworkers</span>
          <strong>
            {
              state.organizations.filter((item) =>
                item.roles.includes("jobworker"),
              ).length
            }
          </strong>
          <span>production partners</span>
        </div>
        <div className="stat">
          <span className="stat-label">Transporters</span>
          <strong>
            {
              state.organizations.filter((item) =>
                item.roles.includes("transporter"),
              ).length
            }
          </strong>
          <span>delivery and warehouse partners</span>
        </div>
        <div className="stat">
          <span className="stat-label">Parties</span>
          <strong>
            {
              state.organizations.filter((item) =>
                item.roles.includes("distributor"),
              ).length
            }
          </strong>
          <span>distributors and customers</span>
        </div>
      </div>
      <section className="panel operations-panel">
        <SectionTitle
          title={suppliersOnly ? "Suppliers / Vendors" : "Partner directory"}
          action={
            state.user.role === "admin" ? (
              <button
                className="button primary small"
                onClick={() => setAdding(true)}
              >
                <Building2 size={15} /> Add partner
              </button>
            ) : undefined
          }
        >
          {suppliersOnly
            ? "Company and contact details, GSTIN, location, notes, and purchases in one directory."
            : "A clean reusable directory for suppliers, vendors, agents, jobworkers, transporters, distributors, customers, and brands."}
        </SectionTitle>
        {partners.length ? (
          table(
            [
              "Name",
              "Roles",
              "Contact",
              "Location / GSTIN",
              suppliersOnly ? "Purchases" : "Source",
              "",
            ],
            visible.map((item) => {
              const purchases = state.fabricOrders.filter(
                (order) => order.supplierId === item.id,
              );
              return (
                <tr key={item.id}>
                  <td>
                    <button
                      className="text-link strong-link"
                      onClick={() => setSelected(item)}
                    >
                      {item.name}
                    </button>
                    <small>{item.notes}</small>
                  </td>
                  <td>
                    {item.roles.map((role) => (
                      <Badge key={role}>
                        {role === "supplier" ? "supplier/vendor" : role}
                      </Badge>
                    ))}
                  </td>
                  <td>
                    {item.email || item.phone || "—"}
                    <small>
                      {[item.email, item.phone].filter(Boolean).join(" · ")}
                    </small>
                  </td>
                  <td>
                    {item.address || "—"}
                    <small>{item.taxId || "No GSTIN"}</small>
                  </td>
                  <td>
                    {suppliersOnly ? (
                      <>
                        {purchases.length} POs
                        <small>
                          {money(
                            purchases.reduce(
                              (sum, order) => sum + order.fabricValue,
                              0,
                            ),
                          )}
                        </small>
                      </>
                    ) : item.sourceSheet ? (
                      `${item.sourceSheet} · row ${item.sourceRow}`
                    ) : (
                      "Portal"
                    )}
                  </td>
                  <td>
                    {state.user.role === "admin" && (
                      <button
                        className="icon-button"
                        aria-label={`Edit ${item.name}`}
                        onClick={() => setSelected(item)}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            }),
          )
        ) : (
          <Empty title="No partners found" />
        )}
        <Pager total={partners.length} page={page} setPage={setPage} />
      </section>
      {editing && (
        <div className="drawer-backdrop" role="presentation">
          <aside
            className="record-drawer compact-drawer"
            role="dialog"
            aria-modal="true"
          >
            <header>
              <div>
                <span className="eyebrow">MASTER DATA</span>
                <h2>{selected ? `Edit ${selected.name}` : "Add partner"}</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => {
                  setSelected(null);
                  setAdding(false);
                }}
              >
                <X size={19} />
              </button>
            </header>
            <form className="drawer-form" onSubmit={save}>
              <label className="span-all">
                Company / contact name
                <input name="name" required defaultValue={selected?.name} />
              </label>
              <fieldset className="role-options span-all">
                <legend>Roles</legend>
                {partnerRoles.map((role) => (
                  <label key={role}>
                    <input
                      type="checkbox"
                      name="roles"
                      value={role}
                      defaultChecked={
                        selected?.roles.includes(role) ||
                        (adding && role === "supplier")
                      }
                    />{" "}
                    {role.replace("_", " ")}
                  </label>
                ))}
              </fieldset>
              <label>
                Email
                <input
                  type="email"
                  name="email"
                  defaultValue={selected?.email}
                />
              </label>
              <label>
                Phone
                <input name="phone" defaultValue={selected?.phone} />
              </label>
              <label>
                GSTIN
                <input name="taxId" defaultValue={selected?.taxId} />
              </label>
              <label className="span-all">
                Address
                <textarea name="address" defaultValue={selected?.address} />
              </label>
              <label className="span-all">
                Notes
                <textarea name="notes" defaultValue={selected?.notes} />
              </label>
              <button className="button primary" type="submit">
                Save partner
              </button>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}

export function EnhancedReports({
  state,
  filters = {},
}: {
  state: State;
  filters?: OperationFilters;
}) {
  const period = usePeriodSelection(filters);
  const orders = state.fabricOrders.filter((item) =>
    inSelectedPeriod(item.orderDate, period),
  );
  const transports = state.transports.filter((item) =>
    inSelectedPeriod(item.dcIssueDate || item.lrDate, period),
  );
  const inwards = state.inwards.filter((item) =>
    inSelectedPeriod(item.inwardDate, period),
  );
  const inwardWork = new Map(state.workOrders.map((item) => [item.id, item]));
  const supplierTotals = Object.entries(
    orders.reduce<Record<string, { metres: number; value: number }>>(
      (acc, order) => {
        const row = acc[order.supplierName] || { metres: 0, value: 0 };
        row.metres += order.quantityOrdered;
        row.value += order.fabricValue;
        acc[order.supplierName] = row;
        return acc;
      },
      {},
    ),
  )
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, 12);
  const damage = inwards.reduce(
    (sum, item) => sum + item.damagePiecesQuantity,
    0,
  );
  return (
    <>
      <PeriodBar period={period} />
      <div className="stats">
        <div className="stat">
          <span className="stat-label">Fabric ordered</span>
          <strong>
            {orders
              .reduce((sum, item) => sum + item.quantityOrdered, 0)
              .toLocaleString("en-IN")}{" "}
            m
          </strong>
          <span>
            {money(orders.reduce((sum, item) => sum + item.fabricValue, 0))}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Fabric dispatched</span>
          <strong>
            {transports
              .reduce((sum, item) => sum + item.fabricQuantity, 0)
              .toLocaleString("en-IN")}{" "}
            m
          </strong>
          <span>
            {transports.reduce((sum, item) => sum + item.numberOfBales, 0)}{" "}
            bales
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Garments inward</span>
          <strong>
            {inwards
              .reduce((sum, item) => sum + item.totalInward, 0)
              .toLocaleString("en-IN")}
          </strong>
          <span>{damage} damaged pieces</span>
        </div>
        <div className="stat">
          <span className="stat-label">Unplanned movements</span>
          <strong>
            {transports.filter((item) => !item.fabricOrderId).length}
          </strong>
          <span>without a linked PO</span>
        </div>
      </div>
      <div className="operations-dashboard">
        <section className="panel">
          <SectionTitle title="Purchasing by supplier">
            Quantity and order value for the selected period.
          </SectionTitle>
          {supplierTotals.length ? (
            table(
              ["Supplier / vendor", "Ordered metres", "Purchase value"],
              supplierTotals.map(([name, total]) => (
                <tr key={name}>
                  <td>
                    <strong>{name}</strong>
                  </td>
                  <td>{total.metres.toLocaleString("en-IN")} m</td>
                  <td>{money(total.value)}</td>
                </tr>
              )),
            )
          ) : (
            <Empty title="No purchasing in this period" />
          )}
        </section>
        <section className="panel">
          <SectionTitle title="Inward by jobworker">
            Actual inward, mix, and damage for the selected period.
          </SectionTitle>
          {inwards.length ? (
            table(
              ["Date", "Work order / jobworker", "Total", "Mix", "Damage"],
              inwards.slice(0, 20).map((inward) => {
                const work = inwardWork.get(inward.workOrderId);
                return (
                  <tr key={inward.id}>
                    <td>{inward.inwardDate}</td>
                    <td>
                      <strong>{work?.woNumber || "—"}</strong>
                      <small>{work?.jobworkerName}</small>
                    </td>
                    <td>{inward.totalInward}</td>
                    <td>{inward.mixPiecesQuantity}</td>
                    <td>{inward.damagePiecesQuantity}</td>
                  </tr>
                );
              }),
            )
          ) : (
            <Empty title="No inward in this period" />
          )}
        </section>
      </div>
    </>
  );
}
