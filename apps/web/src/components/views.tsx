"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Plus,
  ExternalLink,
  ShoppingBag,
  Save,
  KeyRound,
  CircleHelp,
} from "lucide-react";
import { money, shortDate, type State } from "@/lib/types";
import {
  Badge,
  Empty,
  Field,
  SectionTitle,
} from "./ui";
import type { Mutate } from "./editor";
import { SystemHelp } from "./system-help";
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
export function Views(props: Props) {
  const { view, state: s, query, filter, edit } = props;
  const currency = s.settings.currency;
  const match = (...values: unknown[]) => values.join(" ").toLowerCase().includes(query.toLowerCase());
  if (view === "settings") return <SettingsView {...props} />;
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

function SettingsView({ state: s, edit, mutate }: Props) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
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
      <section className="panel help-launcher">
        <div>
          <span className="eyebrow">HELP & SYSTEM MAP</span>
          <h2>See how the whole company moves through Carnot</h2>
          <p>
            Follow fabric from supplier to jobworker to finished stock, learn
            what every user can see, and check which pieces are still being
            connected.
          </p>
        </div>
        <button className="button primary" onClick={() => setHelpOpen(true)}>
          <CircleHelp size={17} />
          Open simple guide
        </button>
      </section>
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
                <Field label="Portal name">
                  <input
                    name="portalName"
                    defaultValue={s.settings.portalName || "Carnot CRM"}
                  />
                </Field>
                <Field label="Brand identity">
                  <input
                    name="brandName"
                    defaultValue={s.settings.brandName || "Carnot"}
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
                <Field label="Logistics / challan issuer">
                  <input
                    name="logisticsName"
                    required
                    defaultValue={s.settings.logisticsName || "Singal Fabrics"}
                  />
                </Field>
                <Field label="Logistics GSTIN">
                  <input
                    name="logisticsTaxId"
                    defaultValue={s.settings.logisticsTaxId}
                  />
                </Field>
                <Field label="Logistics email">
                  <input
                    name="logisticsEmail"
                    type="email"
                    defaultValue={s.settings.logisticsEmail}
                  />
                </Field>
                <Field label="Logistics phone">
                  <input
                    name="logisticsPhone"
                    defaultValue={s.settings.logisticsPhone}
                  />
                </Field>
                <Field label="Logistics address">
                  <textarea
                    name="logisticsAddress"
                    rows={3}
                    defaultValue={s.settings.logisticsAddress}
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
              Administrators manage the business. Partner accounts are linked to
              an imported organization or delivery person and see only their
              records.
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
      {helpOpen && (
        <SystemHelp role={s.user.role} onClose={() => setHelpOpen(false)} />
      )}
    </>
  );
}
