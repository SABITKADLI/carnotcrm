"use client";
import { useState } from "react";
import { Plus, Trash2, Loader2, ArrowRight } from "lucide-react";
import { Dialog, Field } from "./ui";
import { money, type State } from "@/lib/types";
export interface EditRequest {
  type: string;
  data?: Record<string, unknown>;
}
export type Mutate = (
  action: string,
  input: Record<string, unknown>,
) => Promise<unknown>;
type FieldDef = {
  key: string;
  label: string;
  type?: string;
  value?: string | number;
  required?: boolean;
  options?: { value: string; label: string }[];
  hint?: string;
  min?: number;
  max?: number;
  step?: string;
};
const today = () => new Date().toISOString().slice(0, 10);
const after = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
export function Editor({
  request,
  state,
  mutate,
  close,
}: {
  request: EditRequest;
  state: State;
  mutate: Mutate;
  close: () => void;
}) {
  const d = request.data || {};
  const type = request.type;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newUserRole, setNewUserRole] = useState("jobworker");
  const [lines, setLines] = useState([
    { kind: "product", itemId: "", quantity: 1, price: 0 },
  ]);
  const customers = state.organizations
    .filter(
      (organization) =>
        !organization.archived &&
        organization.roles.some((role) =>
          ["customer", "distributor"].includes(role),
        ),
    )
    .map((organization) => ({
      value: organization.id,
      label: organization.name,
    }));
  const linkedPartnerOptions =
    newUserRole === "delivery"
      ? state.people
          .filter((person) =>
            ["driver", "pickup", "delivery"].includes(person.role),
          )
          .map((person) => ({
            value: person.id,
            label: `${person.name} · person · ${person.role}`,
          }))
      : newUserRole === "admin"
        ? []
        : state.organizations
            .filter((organization) => {
              const accepted: Record<string, string[]> = {
                supplier: ["supplier", "vendor"],
                agent: ["agent"],
                transporter: ["transporter"],
                jobworker: ["jobworker"],
                distributor: ["distributor"],
              };
              return organization.roles.some((role) =>
                (accepted[newUserRole] || []).includes(role),
              );
            })
            .map((organization) => ({
              value: organization.id,
              label: `${organization.name} · organization · ${organization.roles.join(", ")}`,
            }));
  const select = (
    key: string,
    label: string,
    options: { value: string; label: string }[],
    value?: string,
  ): FieldDef => ({ key, label, options, value });
  const n = (
    key: string,
    label: string,
    value = 0,
    min = 0,
    step = "0.01",
  ): FieldDef => ({ key, label, type: "number", value, min, step });
  const txt = (
    key: string,
    label: string,
    value = "",
    required = true,
  ): FieldDef => ({ key, label, value, required });
  const choice = (
    key: string,
    label: string,
    options: string[],
    value?: string,
  ) =>
    select(
      key,
      label,
      options.map((v) => ({ value: v, label: v })),
      value,
    );
  const action = type;
  let title = "New record",
    description = "",
    fields: FieldDef[] = [],
    submit = "Save record";
  if (type === "invoice") {
    title = "Bill & deliver";
    description =
      "Issuing this invoice also removes the selected stock. Prices and customer details are preserved on the invoice.";
    submit = "Issue invoice & deliver stock";
    fields = [
      select("customerId", "Bill to", customers),
      { key: "dueDate", label: "Payment due", type: "date", value: after(14) },
      n("discount", `Discount (${state.settings.currency})`),
      n("taxRate", "Tax rate (%)", state.settings.taxRate),
      {
        key: "notes",
        label: "Invoice notes",
        type: "textarea",
        required: false,
      },
    ];
  } else if (type === "payment") {
    title = `Record payment · ${d.number}`;
    description = `${money(Number(d.total) - Number(d.paid), String(d.currency))} outstanding`;
    submit = "Record payment";
    fields = [
      n(
        "amount",
        `Amount (${d.currency})`,
        (Number(d.total) - Number(d.paid)) / 100,
        0.01,
      ),
      choice("method", "Payment method", [
        "Bank transfer",
        "UPI",
        "Cash",
        "Card",
        "Cheque",
      ]),
      txt("reference", "Transaction / receipt reference"),
      { key: "date", label: "Payment date", type: "date", value: today() },
    ];
  } else if (type === "user") {
    title = "Invite a team member";
    description =
      "Create an account, then share these credentials directly with the person. No email is sent.";
    fields = [
      txt("name", "Full name"),
      { key: "email", label: "Email", type: "email" },
      choice("role", "Access level", [
        "jobworker",
        "supplier",
        "agent",
        "transporter",
        "delivery",
        "distributor",
        "admin",
      ]),
      {
        ...select("partnerId", "Linked partner record", linkedPartnerOptions),
        required: false,
        hint: "Required for partner accounts. Delivery access should link to a person; other partner roles link to an organization. Administrators leave this blank.",
      },
      {
        key: "password",
        label: "Temporary password",
        type: "password",
        hint: "At least 12 characters. The user can change it in Settings.",
      },
    ];
  } else if (["changePassword", "resetPassword"].includes(type)) {
    title =
      type === "changePassword"
        ? "Change your password"
        : `Reset password · ${d.name}`;
    description = "All sessions for this account will be signed out.";
    fields = [
      {
        key: "password",
        label: "New password",
        type: "password",
        hint: "Use 12–128 characters.",
      },
    ];
  } else if (type === "shopify") {
    title = "Send to Shopify";
    description =
      "Create a draft listing, or allocate finished stock and publish it to your configured sales channel. Shopify allocations are excluded from direct sales.";
    submit = "Send to Shopify";
    fields = [
      choice("mode", "Action", ["Draft listing", "Publish with stock"]),
      n(
        "quantity",
        "Pieces to allocate (when publishing)",
        Math.max(0, Number(d.stock) - Number(d.channelStock)),
        0,
        "1",
      ),
    ];
  }
  async function submitForm(form: HTMLFormElement) {
    setBusy(true);
    setError("");
    const input: Record<string, unknown> = Object.fromEntries(
      new FormData(form),
    );
    if (d.id) input.id = d.id;
    if (["customer", "supplier"].includes(type)) input.type = type;
    if (type === "invoice") input.lines = lines;
    if (type === "payment") input.invoiceId = d.id;
    try {
      await mutate(action, input);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
      setBusy(false);
    }
  }
  return (
    <Dialog title={title} onClose={close} wide={type === "invoice"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitForm(e.currentTarget);
        }}
      >
        <p className="form-description">{description}</p>
        <div className="form-grid">
          {fields.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              {f.options ? (
                <select
                  name={f.key}
                  defaultValue={String(
                    (["customer", "supplier", "progress"].includes(type)
                      ? d[f.key]
                      : undefined) ??
                      f.value ??
                      "",
                  )}
                  required={f.required !== false}
                  onChange={
                    type === "user" && f.key === "role"
                      ? (event) => setNewUserRole(event.target.value)
                      : undefined
                  }
                >
                  <option value="" disabled={f.required !== false}>
                    {type === "user" &&
                    f.key === "partnerId" &&
                    newUserRole === "admin"
                      ? "No partner link needed"
                      : `Select ${f.label.toLowerCase()}`}
                  </option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  name={f.key}
                  defaultValue={String(
                    (["customer", "supplier", "progress"].includes(type)
                      ? d[f.key]
                      : undefined) ??
                      f.value ??
                      "",
                  )}
                  required={f.required !== false}
                  rows={4}
                  maxLength={6000}
                />
              ) : (
                <input
                  name={f.key}
                  type={f.type || "text"}
                  defaultValue={String(
                    (["customer", "supplier", "progress"].includes(type)
                      ? d[f.key]
                      : undefined) ??
                      f.value ??
                      "",
                  )}
                  required={f.required !== false}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  maxLength={f.type === "password" ? 128 : 1000}
                  minLength={f.type === "password" ? 12 : undefined}
                  autoComplete={
                    f.type === "password" ? "new-password" : undefined
                  }
                />
              )}
            </Field>
          ))}
        </div>
        {type === "invoice" && (
          <section className="invoice-editor">
            <h3>Invoice items</h3>
            {lines.map((line, i) => {
              const items =
                line.kind === "product"
                  ? state.products.map((p) => ({
                      id: p.id,
                      name: `${p.name} · ${p.stock - p.channelStock} pcs`,
                      price: p.price,
                    }))
                  : state.fabricOrders
                      .filter((order) => !order.archived && order.receivedMetres > 0)
                      .flatMap((order) => {
                        const dispatched = state.transports
                          .filter((item) => item.fabricOrderId === order.id && !["Void", "Returned"].includes(item.stage))
                          .reduce((sum, item) => sum + item.fabricQuantity, 0);
                        const sold = state.movements
                          .filter((item) => item.fabricOrderId === order.id && item.type === "Direct sale")
                          .reduce((sum, item) => sum - item.quantity / 1000, 0);
                        const available = Math.max(0, order.receivedMetres - dispatched - sold);
                        if (available < 0.001) return [];
                        return [{
                          id: order.id,
                          name: `${order.fabricName} · ${order.poNumber} · ${available.toLocaleString("en-IN")} m available`,
                          price: Math.round(order.pricePerMetre * 100),
                        }];
                      });
              return (
                <div className="invoice-line" key={i}>
                  <Field label="Item type">
                    <select
                      value={line.kind}
                      onChange={(e) =>
                        setLines(
                          lines.map((l, j) =>
                            j === i
                              ? {
                                  ...l,
                                  kind: e.target.value,
                                  itemId: "",
                                  price: 0,
                                }
                              : l,
                          ),
                        )
                      }
                    >
                      <option value="product">Finished garment</option>
                      <option value="fabric">Raw fabric</option>
                    </select>
                  </Field>
                  <Field label="Item">
                    <select
                      required
                      value={line.itemId}
                      onChange={(e) => {
                        const item = items.find((p) => p.id === e.target.value);
                        setLines(
                          lines.map((l, j) =>
                            j === i
                              ? {
                                  ...l,
                                  itemId: e.target.value,
                                  price: (item?.price || 0) / 100,
                                }
                              : l,
                          ),
                        );
                      }}
                    >
                      <option value="">Select item</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={line.kind === "fabric" ? "Metres" : "Pieces"}>
                    <input
                      type="number"
                      min={line.kind === "fabric" ? 0.001 : 1}
                      step={line.kind === "fabric" ? 0.001 : 1}
                      required
                      value={line.quantity}
                      onChange={(e) =>
                        setLines(
                          lines.map((l, j) =>
                            j === i
                              ? { ...l, quantity: Number(e.target.value) }
                              : l,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label="Unit price">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      value={line.price}
                      onChange={(e) =>
                        setLines(
                          lines.map((l, j) =>
                            j === i
                              ? { ...l, price: Number(e.target.value) }
                              : l,
                          ),
                        )
                      }
                    />
                  </Field>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={lines.length === 1}
                    aria-label="Remove invoice item"
                    onClick={() => setLines(lines.filter((_, j) => j !== i))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
            <div className="row-between">
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  setLines([
                    ...lines,
                    { kind: "product", itemId: "", quantity: 1, price: 0 },
                  ])
                }
              >
                <Plus size={16} />
                Add item
              </button>
              <strong>
                Subtotal{" "}
                {money(
                  Math.round(
                    lines.reduce((sum, l) => sum + l.quantity * l.price, 0) *
                      100,
                  ),
                  state.settings.currency,
                )}
              </strong>
            </div>
          </section>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-footer">
          <button
            type="button"
            className="button secondary"
            onClick={close}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? (
              <Loader2 size={17} className="spin" />
            ) : (
              <ArrowRight size={17} />
            )}{" "}
            {busy ? "Saving…" : submit}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
