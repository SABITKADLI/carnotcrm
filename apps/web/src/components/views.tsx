"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Scissors,
  Package,
  Clock3,
  CircleAlert,
  Check,
  Pencil,
  ExternalLink,
  SlidersHorizontal,
  ShoppingBag,
  ReceiptText,
  Save,
  KeyRound,
} from "lucide-react";
import { money, meters, shortDate, type State, type Order } from "@/lib/types";
import {
  Badge,
  Dialog,
  Empty,
  Field,
  Progress,
  SectionTitle,
  TextLink,
} from "./ui";
import type { Mutate } from "./editor";
import { CuttingMap, downloadCSV } from "./cutting-room";
import { stitchingSteps } from "@/lib/stitching";
type Props = {
  view: string;
  state: State;
  query: string;
  filter: string;
  edit: (type: string, data?: object) => void;
  mutate: Mutate;
};
const today = () => new Date().toISOString().slice(0, 10);
const overdue = (date: string) => date < today();
const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("");
function Table({
  headings,
  children,
}: {
  headings: string[];
  children: ReactNode;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {headings.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Stat({
  label,
  value,
  foot,
  icon,
}: {
  label: string;
  value: ReactNode;
  foot: ReactNode;
  icon: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat-label">
        {label}
        {icon}
      </div>
      <strong>{value}</strong>
      <span>{foot}</span>
    </div>
  );
}
export function Views(props: Props) {
  const { view, state: s, query, filter, edit } = props;
  const [detail, setDetail] = useState<Order | null>(null);
  const contact = (id: string) =>
    s.contacts.find((c) => c.id === id)?.name || "—";
  const fabric = (id: string) => s.fabrics.find((f) => f.id === id);
  const order = (id: string) => s.orders.find((o) => o.id === id);
  const currency = s.settings.currency;
  const match = (...values: unknown[]) =>
    values.join(" ").toLowerCase().includes(query.toLowerCase());
  const detailPanel = detail && (
    <OrderDetail
      order={s.orders.find((o) => o.id === detail.id) || detail}
      state={s}
      close={() => setDetail(null)}
      edit={(type, data) => {
        setDetail(null);
        edit(type, data);
      }}
    />
  );
  if (view === "overview")
    return (
      <>
        <Overview state={s} edit={edit} show={setDetail} />
        {detailPanel}
      </>
    );
  if (view === "reports") return <Reports state={s} />;
  if (view === "settings") return <SettingsView {...props} />;
  if (view === "orders") {
    const orders = s.orders.filter(
      (o) =>
        (filter === "all" || o.status === filter) &&
        match(o.name, o.number, contact(o.customerId), o.category),
    );
    return (
      <>
        <div className="flow-summary">
          {["draft", "planned", "production", "quality", "ready"].map(
            (status, i) => (
              <div key={status}>
                <span>
                  0{i + 1} / {status}
                </span>
                <strong>
                  {s.orders
                    .filter((o) => o.status === status)
                    .length.toString()
                    .padStart(2, "0")}
                </strong>
                {i < 4 && <ArrowRight size={16} />}
              </div>
            ),
          )}
        </div>
        <div className="panel no-pad">
          <Table
            headings={[
              "Order / style",
              "Customer",
              "Pieces",
              "Delivery",
              "Production",
              "Status",
              "",
            ]}
          >
            {orders.map((o) => {
              const jobs = s.jobs.filter((j) => j.orderId === o.id);
              const done = jobs.reduce((sum, j) => sum + j.finished, 0);
              return (
                <tr key={o.id}>
                  <td>
                    <button className="table-link" onClick={() => setDetail(o)}>
                      {o.name}
                    </button>
                    <small>
                      {o.number} · {o.category}
                    </small>
                  </td>
                  <td>{contact(o.customerId)}</td>
                  <td>
                    {o.quantity}
                    <small>{o.sizes}</small>
                  </td>
                  <td
                    className={
                      overdue(o.dueDate) &&
                      !["ready", "cancelled"].includes(o.status)
                        ? "danger-text"
                        : ""
                    }
                  >
                    {shortDate(o.dueDate)}
                    <small>{o.priority} priority</small>
                  </td>
                  <td className="progress-cell">
                    <Progress value={(done / o.quantity) * 100} />
                    <small>
                      {done} / {o.quantity} finished
                    </small>
                  </td>
                  <td>
                    <Badge>{o.status}</Badge>
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`Open ${o.number}`}
                      onClick={() => setDetail(o)}
                    >
                      <ArrowUpRight size={18} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </Table>
          {!orders.length && (
            <Empty title="No orders found">
              Try a different search or create a new garment order.
            </Empty>
          )}
        </div>
        {detailPanel}
      </>
    );
  }
  if (view === "fabrics") {
    const fabrics = s.fabrics.filter((f) =>
      match(f.name, f.sku, f.color, f.lot, f.location, f.composition),
    );
    return (
      <>
        <div className="inline-summary">
          <span>
            <b>{s.fabrics.length}</b> fabric lots
          </span>
          <span>
            <b>
              {meters(
                s.fabrics.reduce((sum, f) => sum + f.stock - f.reserved, 0),
              )}
            </b>{" "}
            available
          </span>
          <span>
            <b>
              {s.fabrics.filter((f) => f.stock - f.reserved < f.reorder).length}
            </b>{" "}
            below reorder level
          </span>
        </div>
        <div className="panel no-pad">
          <Table
            headings={[
              "Material",
              "Specification",
              "Dye lot / location",
              "On hand",
              "Reserved",
              "Available",
              "Cost / selling",
              "",
            ]}
          >
            {fabrics.map((f, i) => (
              <tr key={f.id}>
                <td>
                  <div className="material-name">
                    <span
                      className={`swatch swatch-${i % 5}`}
                      aria-hidden="true"
                    />
                    <div>
                      <strong>{f.name}</strong>
                      <small>
                        {f.sku} · {f.color}
                      </small>
                    </div>
                  </div>
                </td>
                <td>
                  {f.width} mm · {f.gsm} GSM<small>{f.composition}</small>
                </td>
                <td>
                  {f.lot || "—"}
                  <small>{f.location}</small>
                </td>
                <td>{meters(f.stock)}</td>
                <td>{meters(f.reserved)}</td>
                <td>
                  <strong>{meters(f.stock - f.reserved)}</strong>
                  {f.stock - f.reserved < f.reorder && (
                    <small className="danger-text">
                      Below {meters(f.reorder)}
                    </small>
                  )}
                </td>
                <td>
                  {money(f.cost, currency)}
                  <small>{money(f.price, currency)} / m selling</small>
                </td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={`Adjust ${f.name} stock`}
                    onClick={() => edit("adjustStock", f)}
                  >
                    <SlidersHorizontal size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </Table>
          {!fabrics.length && <Empty title="No fabrics found" />}
        </div>
        <div className="panel ledger">
          <SectionTitle title="Recent stock movements">
            A traceable record of receipts, production issues and sales.
          </SectionTitle>
          <Table
            headings={[
              "When",
              "Material / product",
              "Movement",
              "Quantity",
              "Reference",
              "By",
            ]}
          >
            {s.movements.slice(0, 12).map((m) => (
              <tr key={m.id}>
                <td>{shortDate(m.createdAt)}</td>
                <td>
                  {m.fabricId
                    ? fabric(m.fabricId)?.name
                    : s.products.find((p) => p.id === m.productId)?.name}
                </td>
                <td>
                  {m.type}
                  <small>{m.note}</small>
                </td>
                <td className={m.quantity > 0 ? "positive-text" : ""}>
                  {m.quantity > 0 ? "+" : ""}
                  {m.fabricId ? meters(m.quantity) : `${m.quantity} pcs`}
                </td>
                <td>{m.reference}</td>
                <td>{m.actor}</td>
              </tr>
            ))}
          </Table>
        </div>
      </>
    );
  }
  if (view === "purchases") {
    const purchases = s.purchases.filter(
      (p) =>
        (filter === "all" || p.status === filter) &&
        match(p.number, contact(p.supplierId), fabric(p.fabricId)?.name),
    );
    return (
      <div className="panel no-pad">
        <Table
          headings={[
            "Purchase order",
            "Supplier",
            "Material",
            "Ordered / received",
            "Value",
            "Expected",
            "Status",
            "",
          ]}
        >
          {purchases.map((p) => (
            <tr key={p.id}>
              <td>
                <strong>{p.number}</strong>
                <small>{p.notes}</small>
              </td>
              <td>{contact(p.supplierId)}</td>
              <td>{fabric(p.fabricId)?.name}</td>
              <td>
                {meters(p.quantity)}
                <small>{meters(p.received)} received</small>
                <Progress value={(p.received / p.quantity) * 100} />
              </td>
              <td>
                {money(Math.round((p.quantity / 1000) * p.unitCost), currency)}
              </td>
              <td>{shortDate(p.dueDate)}</td>
              <td>
                <Badge>{p.status}</Badge>
              </td>
              <td>
                {p.status !== "received" && (
                  <button
                    className="button small secondary"
                    onClick={() => edit("receive", p)}
                  >
                    Receive
                    <ArrowRight size={14} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </Table>
        {!purchases.length && <Empty title="No purchase orders found" />}
      </div>
    );
  }
  if (["customers", "suppliers"].includes(view)) {
    const type = view === "customers" ? "customer" : "supplier";
    const contacts = s.contacts.filter(
      (c) =>
        c.type === type && match(c.name, c.email, c.phone, c.address, c.notes),
    );
    return (
      <div className="panel no-pad">
        <Table
          headings={[
            "Company / contact",
            "Contact details",
            "Location",
            type === "customer" ? "Orders / billed" : "Purchases",
            "Notes",
            "",
          ]}
        >
          {contacts.map((c) => (
            <tr key={c.id}>
              <td>
                <div className="material-name">
                  <span className="contact-avatar">{initials(c.name)}</span>
                  <div>
                    <strong>{c.name}</strong>
                    <small>{c.taxId || "No tax ID recorded"}</small>
                  </div>
                </div>
              </td>
              <td>
                {c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : "—"}
                <small>{c.phone}</small>
              </td>
              <td>{c.address || "—"}</td>
              <td>
                {type === "customer" ? (
                  <>
                    {s.orders.filter((o) => o.customerId === c.id).length}{" "}
                    garment orders
                    <small>
                      {money(
                        s.invoices
                          .filter((i) => i.customerId === c.id)
                          .reduce((sum, i) => sum + i.total, 0),
                        currency,
                      )}{" "}
                      billed
                    </small>
                  </>
                ) : (
                  <>
                    {s.purchases.filter((p) => p.supplierId === c.id).length}{" "}
                    purchase orders
                  </>
                )}
              </td>
              <td className="notes-cell">{c.notes || "—"}</td>
              <td>
                <button
                  className="icon-button"
                  onClick={() => edit(type, c)}
                  aria-label={`Edit ${c.name}`}
                >
                  <Pencil size={16} />
                </button>
              </td>
            </tr>
          ))}
        </Table>
        {!contacts.length && <Empty title={`No ${view} found`} />}
      </div>
    );
  }
  if (view === "production") {
    const jobs = s.jobs.filter(
      (j) =>
        (filter === "all" || j.status === filter) &&
        match(
          order(j.orderId)?.name,
          order(j.orderId)?.number,
          s.users.find((u) => u.id === j.tailorId)?.name,
          j.notes,
        ),
    );
    return (
      <>
        {s.user.role === "admin" &&
          s.orders.some((o) => o.status === "quality") && (
            <div className="quality-queue">
              <span>
                <CircleAlert size={18} />
                Waiting for your quality review
              </span>
              {s.orders
                .filter((o) => o.status === "quality")
                .map((o) => (
                  <button key={o.id} onClick={() => edit("quality", o)}>
                    {o.number} · {o.quantity} pieces <ArrowUpRight size={16} />
                  </button>
                ))}
            </div>
          )}
        <div className="jobs-grid">
          {jobs.map((j) => {
            const o = order(j.orderId)!;
            const tailor = s.users.find((u) => u.id === j.tailorId);
            return (
              <article className="job" key={j.id}>
                <div className="row-between">
                  <span className="eyebrow">{o.number}</span>
                  <Badge>{j.status}</Badge>
                </div>
                <h2>{o.name}</h2>
                <p>
                  {j.quantity} pieces · {o.category}
                </p>
                <div className="job-person">
                  <span className="contact-avatar">
                    {initials(tailor?.name || "Tailor")}
                  </span>
                  <div>
                    <strong>{tailor?.name}</strong>
                    <small>Due {shortDate(j.dueDate)}</small>
                  </div>
                </div>
                <div className="job-stages">
                  <div>
                    <span>Cut</span>
                    <strong>
                      {j.cut}
                      <small>/{j.quantity}</small>
                    </strong>
                    <Progress value={(j.cut / j.quantity) * 100} />
                  </div>
                  <div>
                    <span>Stitched</span>
                    <strong>
                      {j.sewn}
                      <small>/{j.quantity}</small>
                    </strong>
                    <Progress value={(j.sewn / j.quantity) * 100} />
                  </div>
                  <div>
                    <span>Finished</span>
                    <strong>
                      {j.finished}
                      <small>/{j.quantity}</small>
                    </strong>
                    <Progress value={(j.finished / j.quantity) * 100} />
                  </div>
                </div>
                <details>
                  <summary>Measurements & work instructions</summary>
                  <div className="instructions">
                    <strong>Size breakdown</strong>
                    <p>{o.sizes}</p>
                    <strong>Stitching & finishing</strong>
                    <p>{o.notes || "No additional instructions."}</p>
                    <strong>Suggested stitching sequence</strong>
                    <ol className="stitching-steps">
                      {stitchingSteps(o.category).map((step, index) => (
                        <li key={index}>{step}</li>
                      ))}
                    </ol>
                    {o.plan && (
                      <>
                        <strong>Approved cutting estimate</strong>
                        <p>
                          {meters(o.plan.length)} total fabric ·{" "}
                          {o.plan.utilization}% utilization · {o.plan.width} mm
                          width
                        </p>
                        <Table headings={["Piece", "Width", "Length", "Each"]}>
                          {o.plan.pieces.map((p) => (
                            <tr key={p.name}>
                              <td>{p.name}</td>
                              <td>{p.width} mm</td>
                              <td>{p.length} mm</td>
                              <td>{p.count}</td>
                            </tr>
                          ))}
                        </Table>
                      </>
                    )}
                  </div>
                </details>
                {j.notes && <p className="job-note">{j.notes}</p>}
                <div className="job-footer">
                  <span>
                    {j.status === "submitted"
                      ? "Awaiting admin quality review"
                      : j.status === "accepted"
                        ? "Quality review complete"
                        : "Cumulative progress"}
                  </span>
                  {!["accepted", "submitted"].includes(j.status) && (
                    <button
                      className="button small primary"
                      onClick={() => edit("progress", j)}
                    >
                      Update
                      <ArrowRight size={15} />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {!jobs.length && (
          <Empty title="No assignments found">
            {s.user.role === "tailor"
              ? "New work will appear here when the studio assigns it to you."
              : "Approve a cutting plan, then assign an order to a tailor."}
          </Empty>
        )}
      </>
    );
  }
  if (view === "products") {
    const products = s.products.filter((p) => match(p.name, p.sku, p.category));
    return (
      <>
        <div className="channel-banner">
          <div>
            <ShoppingBag size={22} />
            <div>
              <strong>Your Shopify connection</strong>
              <p>
                {s.shopify.configured
                  ? s.shopify.domain
                  : "Connect your store to send finished garments to Shopify."}
              </p>
            </div>
          </div>
          <Badge tone={s.shopify.configured ? "green" : "neutral"}>
            {s.shopify.configured ? "Connected" : "Not connected"}
          </Badge>
          <Link className="text-link" href="/settings">
            Manage connection
            <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="panel no-pad">
          <Table
            headings={[
              "Finished garment",
              "Sizes",
              "Available",
              "Shopify allocation",
              "Unit cost / price",
              "Channel status",
              "",
            ]}
          >
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                  <small>
                    {p.sku} · {p.category}
                  </small>
                </td>
                <td>{p.sizes}</td>
                <td>
                  <strong>{p.stock - p.channelStock} pcs</strong>
                  <small>{p.stock} total on hand</small>
                </td>
                <td>{p.channelStock} pcs</td>
                <td>
                  {money(p.cost, currency)}
                  <small>{money(p.price, currency)} selling</small>
                </td>
                <td>
                  <Badge>{p.shopifyStatus || "Not listed"}</Badge>
                  {p.shopifyError && (
                    <small className="danger-text">{p.shopifyError}</small>
                  )}
                </td>
                <td>
                  <div className="action-stack">
                    <button
                      className="button small secondary"
                      disabled={
                        !s.shopify.configured ||
                        p.shopifyStatus === "published" ||
                        p.shopifyStatus === "syncing"
                      }
                      onClick={() => edit("shopify", p)}
                    >
                      {p.shopifyStatus === "published"
                        ? "Published"
                        : "Send to Shopify"}
                      <ExternalLink size={14} />
                    </button>
                    {p.shopifyUrl && (
                      <a
                        className="text-link"
                        href={p.shopifyUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open listing
                        <ArrowUpRight size={13} />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          {!products.length && (
            <Empty title="Your next collection starts here">
              Finish production and approve quality to add sellable garments.
            </Empty>
          )}
        </div>
        <p className="footnote">
          Shopify allocations stay reserved for that channel. Paid-order
          webhooks reconcile sales when configured; cancellations, returns and
          refunds require manual reconciliation.
        </p>
      </>
    );
  }
  if (view === "invoices") {
    const invoices = s.invoices.filter(
      (i) =>
        (filter === "all" ||
          (filter === "overdue"
            ? overdue(i.dueDate) && i.status !== "paid"
            : i.status === filter)) &&
        match(i.number, i.customerName),
    );
    return (
      <>
        <div className="inline-summary">
          <span>
            <b>
              {money(
                s.invoices.reduce((sum, i) => sum + i.total, 0),
                currency,
              )}
            </b>{" "}
            billed
          </span>
          <span>
            <b>
              {money(
                s.payments.reduce((sum, p) => sum + p.amount, 0),
                currency,
              )}
            </b>{" "}
            collected
          </span>
          <span>
            <b>
              {money(
                s.invoices.reduce((sum, i) => sum + i.total - i.paid, 0),
                currency,
              )}
            </b>{" "}
            outstanding
          </span>
        </div>
        <div className="panel no-pad">
          <Table
            headings={[
              "Invoice",
              "Customer",
              "Issued / due",
              "Total",
              "Outstanding",
              "Status",
              "",
            ]}
          >
            {invoices.map((i) => (
              <tr key={i.id}>
                <td>
                  <Link
                    className="table-link"
                    href={`/invoice/${i.id}`}
                    target="_blank"
                  >
                    {i.number}
                  </Link>
                  <small>{i.lines.length} line items</small>
                </td>
                <td>{i.customerName}</td>
                <td>
                  {shortDate(i.createdAt)}
                  <small
                    className={
                      overdue(i.dueDate) && i.status !== "paid"
                        ? "danger-text"
                        : ""
                    }
                  >
                    Due {shortDate(i.dueDate)}
                  </small>
                </td>
                <td>{money(i.total, i.currency)}</td>
                <td>
                  <strong>{money(i.total - i.paid, i.currency)}</strong>
                </td>
                <td>
                  <Badge>
                    {i.status !== "paid" && overdue(i.dueDate)
                      ? "overdue"
                      : i.status}
                  </Badge>
                </td>
                <td>
                  <div className="action-stack">
                    {i.status !== "paid" && (
                      <button
                        className="button small secondary"
                        onClick={() => edit("payment", i)}
                      >
                        Record payment
                      </button>
                    )}
                    <Link
                      href={`/invoice/${i.id}`}
                      className="text-link"
                      target="_blank"
                    >
                      View / print
                      <ArrowUpRight size={14} />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          {!invoices.length && <Empty title="No invoices found" />}
        </div>
        {s.payments.length > 0 && (
          <div className="panel ledger">
            <SectionTitle title="Payment ledger" />
            <Table
              headings={["Date", "Invoice", "Amount", "Method", "Reference"]}
            >
              {s.payments.slice(0, 20).map((p) => (
                <tr key={p.id}>
                  <td>{shortDate(p.date)}</td>
                  <td>
                    {s.invoices.find((i) => i.id === p.invoiceId)?.number}
                  </td>
                  <td>{money(p.amount, currency)}</td>
                  <td>{p.method}</td>
                  <td>{p.reference}</td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </>
    );
  }
  if (view === "activity") {
    const activities = s.activities.filter((a) =>
      match(a.actor, a.action, a.subject, a.detail),
    );
    return (
      <div className="panel no-pad">
        <Table
          headings={["When", "Team member", "Action", "Record", "Details"]}
        >
          {activities.map((a) => (
            <tr key={a.id}>
              <td>
                {shortDate(a.createdAt)}
                <small>
                  {new Date(a.createdAt).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Kolkata",
                  })}
                </small>
              </td>
              <td>{a.actor}</td>
              <td>{a.action}</td>
              <td>{a.subject}</td>
              <td>{a.detail || "—"}</td>
            </tr>
          ))}
        </Table>
        {!activities.length && <Empty title="No activity found" />}
        <p className="footnote">Showing the latest 200 recorded events.</p>
      </div>
    );
  }
  return null;
}

function Overview({
  state: s,
  edit,
  show,
}: {
  state: State;
  edit: Props["edit"];
  show: (order: Order) => void;
}) {
  const active = s.orders.filter(
    (o) => !["ready", "cancelled"].includes(o.status),
  );
  const low = s.fabrics.filter((f) => f.stock - f.reserved < f.reorder);
  const quality = s.orders.filter((o) => o.status === "quality");
  const outstanding = s.invoices.reduce((sum, i) => sum + i.total - i.paid, 0);
  const currency = s.settings.currency;
  const upcoming = [...active]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);
  const pipeline = ["draft", "planned", "production", "quality", "ready"].map(
    (status) => ({
      status,
      n: s.orders
        .filter((o) => o.status === status)
        .reduce((sum, o) => sum + o.quantity, 0),
    }),
  );
  const pipelineTotal = pipeline.reduce((sum, p) => sum + p.n, 0);
  return (
    <>
      <div className="stats">
        <Stat
          label="Active garment orders"
          value={active.length.toString().padStart(2, "0")}
          foot={`${active.reduce((sum, o) => sum + o.quantity, 0)} pieces in the making`}
          icon={<ShoppingBag size={17} />}
        />
        <Stat
          label="Available fabric"
          value={meters(
            s.fabrics.reduce((sum, f) => sum + f.stock - f.reserved, 0),
          )}
          foot={`${s.fabrics.length} materials in your library`}
          icon={<Scissors size={17} />}
        />
        <Stat
          label="Ready to sell"
          value={`${s.products.reduce((sum, p) => sum + p.stock - p.channelStock, 0)} pcs`}
          foot={`${s.products.length} quality-approved styles`}
          icon={<Package size={17} />}
        />
        <Stat
          label="Outstanding balance"
          value={money(outstanding, currency)}
          foot={`${s.invoices.filter((i) => i.status !== "paid").length} open invoices`}
          icon={<ReceiptText size={17} />}
        />
      </div>
      <div className="overview-grid">
        <section className="panel production-overview">
          <SectionTitle
            title="On the studio floor"
            action={<TextLink href="/production">View production</TextLink>}
          >
            A clear path from brief to finished garment.
          </SectionTitle>
          <div
            className="pipeline-chart"
            aria-label="Garment quantity by production stage"
          >
            {pipeline.map((p, i) => (
              <div
                key={p.status}
                className={`pipeline-segment segment-${i}`}
                style={{ flex: Math.max(p.n, pipelineTotal / 25 || 1) }}
                title={`${p.status}: ${p.n} pieces`}
              >
                {p.n > 0 ? p.n : ""}
              </div>
            ))}
          </div>
          <div className="pipeline-legend">
            {pipeline.map((p, i) => (
              <div key={p.status}>
                <span>
                  <i className={`segment-${i}`} />
                  {p.status}
                </span>
                <strong>
                  {p.n}
                  <small> pieces</small>
                </strong>
              </div>
            ))}
          </div>
          <div className="table-divider" />
          <SectionTitle
            title="Next to leave the studio"
            action={<TextLink href="/orders">All orders</TextLink>}
          />
          <div className="due-list">
            {upcoming.map((o) => {
              const done = s.jobs
                .filter((j) => j.orderId === o.id)
                .reduce((sum, j) => sum + j.finished, 0);
              return (
                <button key={o.id} onClick={() => show(o)}>
                  <div className="due-date">
                    <strong>
                      {new Date(o.dueDate + "T12:00:00").getDate()}
                    </strong>
                    <span>
                      {new Date(o.dueDate + "T12:00:00").toLocaleDateString(
                        "en",
                        { month: "short" },
                      )}
                    </span>
                  </div>
                  <div className="due-order">
                    <strong>{o.name}</strong>
                    <span>
                      {o.number} ·{" "}
                      {s.contacts.find((c) => c.id === o.customerId)?.name}
                    </span>
                  </div>
                  <div className="due-progress">
                    <Progress value={(done / o.quantity) * 100} />
                    <small>
                      {done} / {o.quantity} pcs
                    </small>
                  </div>
                  <Badge>{o.status}</Badge>
                  <ArrowUpRight size={16} />
                </button>
              );
            })}
            {!upcoming.length && (
              <Empty title="A clear production schedule">
                New garment orders will appear here.
              </Empty>
            )}
          </div>
        </section>
        <aside className="attention">
          <SectionTitle title="Needs a little attention" />
          <div className="attention-item">
            <div className="attention-icon">
              <Scissors size={21} />
            </div>
            <span className="eyebrow">MATERIALS</span>
            <h3>
              {low.length
                ? `${low.length} fabric${low.length > 1 ? "s" : ""} running low`
                : "Materials in good shape"}
            </h3>
            <p>
              {low.length
                ? low
                    .map((f) => `${f.name}: ${meters(f.stock - f.reserved)}`)
                    .join(" · ")
                : "All fabric lots are above their reorder thresholds."}
            </p>
            <button className="text-link" onClick={() => edit("purchase")}>
              Plan a purchase
              <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="attention-item">
            <div className="attention-icon">
              <Check size={21} />
            </div>
            <span className="eyebrow">QUALITY DESK</span>
            <h3>
              {quality.length
                ? `${quality.length} order${quality.length > 1 ? "s" : ""} ready for review`
                : "Quality desk is clear"}
            </h3>
            <p>
              {quality.length
                ? `${quality.reduce((sum, o) => sum + o.quantity, 0)} finished pieces waiting for your final check.`
                : "Completed tailor assignments arrive here for approval."}
            </p>
            {quality[0] && (
              <button
                className="text-link"
                onClick={() => edit("quality", quality[0])}
              >
                Review {quality[0].number}
                <ArrowUpRight size={15} />
              </button>
            )}
          </div>
          <div className="attention-note">
            <span className="eyebrow">FROM FABRIC TO FINISHED</span>
            <p>
              Every metre has potential.
              <br />
              Every detail makes a difference.
            </p>
            <span className="thread-line" />
          </div>
        </aside>
      </div>
      <section className="panel">
        <SectionTitle
          title="The latest from your studio"
          action={<TextLink href="/activity">Activity log</TextLink>}
        />
        <div className="activity-preview">
          {s.activities.slice(0, 4).map((a) => (
            <div key={a.id}>
              <span className="activity-dot" />
              <div>
                <strong>{a.action}</strong>
                <p>
                  {a.subject} · {a.actor}
                </p>
              </div>
              <time>{shortDate(a.createdAt)}</time>
            </div>
          ))}
        </div>
        {!s.activities.length && <Empty title="Ready for your first move" />}
      </section>
    </>
  );
}

function OrderDetail({
  order: o,
  state: s,
  close,
  edit,
}: {
  order: Order;
  state: State;
  close: () => void;
  edit: Props["edit"];
}) {
  const fabric = s.fabrics.find((f) => f.id === o.fabricId);
  const allocated = s.jobs
    .filter((j) => j.orderId === o.id)
    .reduce((sum, j) => sum + j.quantity, 0);
  return (
    <Dialog title={o.name} onClose={close} wide>
      <div className="row-between">
        <span className="eyebrow">{o.number}</span>
        <Badge>{o.status}</Badge>
      </div>
      <div className="detail-grid">
        <div>
          <span>Customer</span>
          <strong>{s.contacts.find((c) => c.id === o.customerId)?.name}</strong>
        </div>
        <div>
          <span>Delivery</span>
          <strong>{shortDate(o.dueDate)}</strong>
        </div>
        <div>
          <span>Fabric</span>
          <strong>
            {fabric?.name} · {fabric?.color}
          </strong>
        </div>
        <div>
          <span>Quantity</span>
          <strong>
            {o.quantity} pieces · {o.priority} priority
          </strong>
        </div>
        <div>
          <span>Sizes</span>
          <strong>{o.sizes}</strong>
        </div>
        <div>
          <span>Selling / tailoring price</span>
          <strong>
            {money(o.unitPrice, s.settings.currency)} /{" "}
            {money(o.laborCost, s.settings.currency)}
          </strong>
        </div>
      </div>
      <h3>Stitching & finishing requirements</h3>
      <p className="preserve-text">
        {o.notes || "No additional requirements recorded."}
      </p>
      <h3>Suggested stitching sequence</h3>
      <ol className="stitching-steps">
        {stitchingSteps(o.category).map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      {o.plan && (
        <>
          <SectionTitle title="Approved cutting estimate">
            {meters(o.plan.length)} required · {o.plan.utilization}% utilization
            · {o.issued ? "Issued to production" : "Fabric reserved"}
          </SectionTitle>
          <CuttingMap plan={o.plan} />
        </>
      )}
      {o.status === "ready" && (
        <div className="notice">
          <Check size={18} />
          {o.accepted} pieces accepted into finished stock. {o.rejected} pieces
          rejected.
        </div>
      )}
      <div className="form-footer">
        {["draft", "planned"].includes(o.status) && (
          <>
            <button
              className="button secondary"
              onClick={() => edit("cancelOrder", o)}
            >
              Cancel order
            </button>
            <Link className="button secondary" href="/cutting">
              <Scissors size={16} />
              Open cutting room
            </Link>
          </>
        )}
        {["planned", "production"].includes(o.status) &&
          allocated < o.quantity && (
            <button
              className="button primary"
              onClick={() =>
                edit("assign", {
                  orderId: o.id,
                  quantity: o.quantity - allocated,
                  dueDate: o.dueDate,
                })
              }
            >
              Assign {o.quantity - allocated} remaining pieces
              <ArrowRight size={16} />
            </button>
          )}
        {o.status === "quality" && (
          <button className="button primary" onClick={() => edit("quality", o)}>
            Review quality
            <Check size={17} />
          </button>
        )}
        {o.status === "ready" && (
          <button className="button primary" onClick={() => edit("invoice")}>
            Bill & deliver
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </Dialog>
  );
}

function Reports({ state: s }: { state: State }) {
  const currency = s.settings.currency;
  const revenue = s.invoices.reduce(
    (sum, i) => sum + i.subtotal - i.discount,
    0,
  );
  const inventoryValue =
    s.fabrics.reduce(
      (sum, f) => sum + Math.round((f.stock / 1000) * f.cost),
      0,
    ) + s.products.reduce((sum, p) => sum + p.stock * p.cost, 0);
  const accepted = s.orders.reduce((sum, o) => sum + o.accepted, 0),
    rejected = s.orders.reduce((sum, o) => sum + o.rejected, 0);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 5 + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return {
      label: d.toLocaleDateString("en", { month: "short" }),
      value: s.invoices
        .filter((inv) => inv.createdAt.startsWith(key))
        .reduce((sum, inv) => sum + inv.subtotal - inv.discount, 0),
    };
  });
  const max = Math.max(1, ...months.map((m) => m.value));
  const aging = [0, 1, 31, 61].map((start, i) => {
    const end = [0, 30, 60, Infinity][i];
    return {
      label: [
        "Not yet due",
        "1–30 days overdue",
        "31–60 days overdue",
        "61+ days overdue",
      ][i],
      amount: s.invoices
        .filter((inv) => {
          const days = Math.floor(
            (new Date(today()).getTime() - new Date(inv.dueDate).getTime()) /
              86400000,
          );
          return i === 0 ? days <= 0 : days >= start && days <= end;
        })
        .reduce((sum, inv) => sum + inv.total - inv.paid, 0),
    };
  });
  return (
    <>
      <div className="stats">
        <Stat
          label="Net invoiced sales"
          value={money(revenue, currency)}
          foot="After discount, before tax · all time"
          icon={<ReceiptText size={17} />}
        />
        <Stat
          label="Inventory at cost"
          value={money(inventoryValue, currency)}
          foot="Fabric on hand + finished garments"
          icon={<Package size={17} />}
        />
        <Stat
          label="Quality acceptance"
          value={
            accepted + rejected
              ? `${((accepted / (accepted + rejected)) * 100).toFixed(1)}%`
              : "—"
          }
          foot={`${accepted} accepted · ${rejected} rejected`}
          icon={<Check size={17} />}
        />
        <Stat
          label="Open receivables"
          value={money(
            s.invoices.reduce((sum, i) => sum + i.total - i.paid, 0),
            currency,
          )}
          foot="Issued invoices less recorded payments"
          icon={<Clock3 size={17} />}
        />
      </div>
      <div className="reports-grid">
        <section className="panel">
          <SectionTitle title="Sales, month by month">
            Net invoice value · last six months
          </SectionTitle>
          <div className="bar-chart">
            {months.map((m) => (
              <div key={m.label}>
                <span>{money(m.value, currency)}</span>
                <div className="bar-track">
                  <i style={{ height: `${(m.value / max) * 100}%` }} />
                </div>
                <strong>{m.label}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <SectionTitle title="Receivables aging" />
          {aging.map((a) => (
            <div className="report-row" key={a.label}>
              <span>{a.label}</span>
              <strong>{money(a.amount, currency)}</strong>
            </div>
          ))}
          <Link className="text-link" href="/invoices">
            Follow up on invoices
            <ArrowUpRight size={16} />
          </Link>
        </section>
      </div>
      <section className="panel">
        <SectionTitle
          title="Production & material performance"
          action={
            <button
              className="button secondary"
              onClick={() =>
                downloadCSV("carnot-production-report.csv", [
                  [
                    "Order",
                    "Style",
                    "Quantity",
                    "Issued metres",
                    "Utilization %",
                    "Accepted",
                    "Rejected",
                  ],
                  ...s.orders.map((o) => [
                    o.number,
                    o.name,
                    o.quantity,
                    o.issued / 1000,
                    o.plan?.utilization || 0,
                    o.accepted,
                    o.rejected,
                  ]),
                ])
              }
            >
              Export report
            </button>
          }
        />
        <Table
          headings={[
            "Order",
            "Pieces",
            "Fabric issued",
            "Marker utilization",
            "Quality",
            "Status",
          ]}
        >
          {s.orders.map((o) => (
            <tr key={o.id}>
              <td>
                <strong>{o.name}</strong>
                <small>{o.number}</small>
              </td>
              <td>{o.quantity}</td>
              <td>{meters(o.issued)}</td>
              <td>{o.plan ? `${o.plan.utilization}%` : "No plan"}</td>
              <td>
                {o.status === "ready"
                  ? `${o.accepted} accepted / ${o.rejected} rejected`
                  : "Pending"}
              </td>
              <td>
                <Badge>{o.status}</Badge>
              </td>
            </tr>
          ))}
        </Table>
      </section>
    </>
  );
}

function SettingsView({ state: s, edit, mutate }: Props) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function save(input: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await mutate("settings", input);
      setMessage("Company settings saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }
  async function toggle(id: string, active: boolean) {
    try {
      await mutate("userStatus", { id, active });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update account");
    }
  }
  return (
    <>
      {s.user.role === "admin" && (
        <>
          <section className="panel settings-panel">
            <SectionTitle title="Company & billing details">
              These details appear on newly issued invoices. Existing invoices
              keep their original details.
            </SectionTitle>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(Object.fromEntries(new FormData(e.currentTarget)));
              }}
            >
              <div className="form-grid">
                <Field label="Company name">
                  <input
                    name="companyName"
                    required
                    defaultValue={s.settings.companyName}
                  />
                </Field>
                <Field label="Email">
                  <input
                    name="email"
                    type="email"
                    defaultValue={s.settings.email}
                  />
                </Field>
                <Field label="Phone">
                  <input name="phone" defaultValue={s.settings.phone} />
                </Field>
                <Field label="Tax registration number">
                  <input name="taxId" defaultValue={s.settings.taxId} />
                </Field>
                <Field
                  label="Currency"
                  hint="Set before adding stock or invoices."
                >
                  <select name="currency" defaultValue={s.settings.currency}>
                    {[
                      "INR",
                      "USD",
                      "EUR",
                      "GBP",
                      "AED",
                      "AUD",
                      "CAD",
                      "SGD",
                    ].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Default tax rate (%)"
                  hint="Use your applicable rate; no tax treatment is inferred."
                >
                  <input
                    name="taxRate"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    defaultValue={s.settings.taxRate}
                  />
                </Field>
                <Field label="Invoice prefix">
                  <input
                    name="invoicePrefix"
                    required
                    pattern="[A-Z0-9-]{1,10}"
                    defaultValue={s.settings.invoicePrefix}
                  />
                </Field>
                <Field label="Registered address">
                  <textarea
                    name="address"
                    rows={3}
                    defaultValue={s.settings.address}
                  />
                </Field>
                <Field label="Payment / bank details">
                  <textarea
                    name="paymentDetails"
                    rows={3}
                    defaultValue={s.settings.paymentDetails}
                  />
                </Field>
              </div>
              <div className="form-footer">
                <button className="button primary" disabled={busy}>
                  <Save size={16} />
                  {busy ? "Saving…" : "Save company details"}
                </button>
              </div>
              {message && (
                <p className="success" role="status">
                  {message}
                </p>
              )}
            </form>
          </section>
          <section className="panel">
            <SectionTitle
              title="Your studio team"
              action={
                <button
                  className="button secondary"
                  onClick={() => edit("user")}
                >
                  <Plus size={16} />
                  Add team member
                </button>
              }
            >
              Administrators manage the business. Tailors see only their
              assigned work.
            </SectionTitle>
            <Table headings={["Team member", "Access", "Status", ""]}>
              {s.users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name}</strong>
                    <small>{u.email}</small>
                  </td>
                  <td>{u.role}</td>
                  <td>
                    <Badge tone={u.active ? "green" : "neutral"}>
                      {u.active ? "Active" : "Disabled"}
                    </Badge>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="text-link"
                        onClick={() => edit("resetPassword", u)}
                      >
                        Reset password
                      </button>
                      {u.id !== s.user.id && (
                        <button
                          className="text-link"
                          onClick={() => toggle(u.id, !u.active)}
                        >
                          {u.active ? "Disable" : "Enable"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          </section>
          <section className="panel">
            <SectionTitle title="Shopify sales channel" />
            <div className="connection">
              <div className="shopify-mark">
                <ShoppingBag size={27} />
              </div>
              <div>
                <h3>{s.shopify.domain || "Connect your Shopify store"}</h3>
                <p>
                  Send approved garments as draft listings or publish with a
                  dedicated stock allocation.
                </p>
              </div>
              <Badge tone={s.shopify.configured ? "green" : "neutral"}>
                {s.shopify.configured ? "Connected" : "Not connected"}
              </Badge>
            </div>
            <div className="connection-checks">
              <span>
                <i className={s.shopify.configured ? "yes" : ""} />
                Store & access token
              </span>
              <span>
                <i className={s.shopify.publication ? "yes" : ""} />
                Sales channel
              </span>
              <span>
                <i className={s.shopify.inventory ? "yes" : ""} />
                Stock location
              </span>
            </div>
            <p className="footnote">
              The workspace owner configures the store, private access token,
              location and publication on the server. Credentials are never
              exposed to team members. See the repository setup guide for
              connection instructions.
            </p>
            <p className="footnote">
              Stock is allocated by batch SKU. Split orders by size before
              production if you need separate size variants in Shopify.
            </p>
          </section>
        </>
      )}
      <section className="panel">
        <SectionTitle title="Your account" />
        <div className="row-between">
          <div>
            <strong>{s.user.name}</strong>
            <p>{s.user.email}</p>
          </div>
          <button
            className="button secondary"
            onClick={() => edit("changePassword")}
          >
            <KeyRound size={16} />
            Change password
          </button>
        </div>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
