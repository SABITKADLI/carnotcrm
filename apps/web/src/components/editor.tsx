"use client";
import { useState } from "react";
import { Plus, Trash2, Loader2, ArrowRight } from "lucide-react";
import { Dialog, Field } from "./ui";
import { money, meters, type State } from "@/lib/types";
export interface EditRequest {
  type: string;
  data?: Record<string, unknown>;
}
export type Mutate = (
  action: string,
  input: Record<string, unknown>,
) => Promise<void>;
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
  const [lines, setLines] = useState([
    { kind: "product", itemId: "", quantity: 1, price: 0 },
  ]);
  const customers = state.contacts
    .filter((c) => c.type === "customer")
    .map((c) => ({ value: c.id, label: c.name }));
  const suppliers = state.contacts
    .filter((c) => c.type === "supplier")
    .map((c) => ({ value: c.id, label: c.name }));
  const fabrics = state.fabrics.map((f) => ({
    value: f.id,
    label: `${f.name} · ${f.color} · ${meters(f.stock - f.reserved)} available`,
  }));
  const tailors = state.users
    .filter((u) => u.role === "tailor" && u.active)
    .map((u) => ({ value: u.id, label: u.name }));
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
  let title = "New record",
    action = type,
    description = "",
    fields: FieldDef[] = [],
    submit = "Save record";
  if (["customer", "supplier"].includes(type)) {
    title = `${d.id ? "Edit" : "New"} ${type}`;
    action = "contact";
    fields = [
      txt("name", "Company / contact name"),
      { ...txt("email", "Email", "", false), type: "email" },
      txt("phone", "Phone", "", false),
      txt("taxId", "Tax registration number", "", false),
      { key: "address", label: "Address", type: "textarea", required: false },
      {
        key: "notes",
        label: "Relationship notes",
        type: "textarea",
        required: false,
      },
    ];
  } else if (type === "fabric") {
    title = "Add fabric to the library";
    fields = [
      txt("name", "Fabric name"),
      txt("sku", "Unique SKU"),
      txt("composition", "Composition", "", false),
      txt("color", "Color"),
      n("width", "Roll width (mm)", 1500, 100, "1"),
      n("gsm", "Weight (GSM)", 180, 1, "1"),
      txt("lot", "Dye lot / batch", "", false),
      txt("location", "Storage location", "", false),
      n("stock", "Opening stock (metres)", 0, 0, "0.001"),
      n("reorder", "Low-stock threshold (metres)", 100, 0, "0.001"),
      n("cost", `Cost per metre (${state.settings.currency})`),
      n("price", `Selling price per metre (${state.settings.currency})`),
    ];
  } else if (type === "adjustStock") {
    title = "Adjust fabric stock";
    description = `${d.name} · ${meters(Number(d.stock))} on hand`;
    fields = [
      n(
        "quantity",
        "Change in metres (negative to remove)",
        0,
        -1000000,
        "0.001",
      ),
      { key: "reason", label: "Reason for adjustment", type: "textarea" },
    ];
  } else if (type === "purchase") {
    title = "Create purchase order";
    fields = [
      select("supplierId", "Supplier", suppliers),
      select("fabricId", "Fabric / dye lot", fabrics),
      n("quantity", "Quantity (metres)", 100, 0.001, "0.001"),
      n("unitCost", `Agreed cost per metre (${state.settings.currency})`),
      {
        key: "dueDate",
        label: "Expected delivery",
        type: "date",
        value: after(7),
      },
      {
        key: "notes",
        label: "Supplier instructions",
        type: "textarea",
        required: false,
      },
    ];
  } else if (type === "receive") {
    title = `Receive ${d.number}`;
    description = "Only the received quantity is added to available stock.";
    submit = "Confirm receipt";
    fields = [
      n(
        "quantity",
        "Received quantity (metres)",
        (Number(d.quantity) - Number(d.received)) / 1000,
        0.001,
        "0.001",
      ),
    ];
  } else if (type === "order") {
    title = "Start a garment order";
    submit = "Create order";
    fields = [
      txt("name", "Style / collection name"),
      select("customerId", "Customer", customers),
      select("fabricId", "Fabric / dye lot", fabrics),
      choice("category", "Garment category", [
        "Shirts",
        "Trousers",
        "Womenswear",
        "Dresses",
        "Uniforms",
        "Other",
      ]),
      n("quantity", "Total pieces", 50, 1, "1"),
      txt("sizes", "Size breakdown", "S: 10, M: 20, L: 15, XL: 5"),
      { key: "dueDate", label: "Delivery due", type: "date", value: after(14) },
      choice("priority", "Priority", ["Normal", "High", "Urgent"]),
      n("unitPrice", `Selling price per piece (${state.settings.currency})`),
      n("laborCost", `Tailoring cost per piece (${state.settings.currency})`),
      {
        key: "notes",
        label: "Measurements, stitching & finishing instructions",
        type: "textarea",
        required: false,
      },
    ];
  } else if (type === "assign") {
    title = "Assign production";
    description =
      "The first assignment issues the full reserved fabric length to production.";
    const orders = state.orders
      .filter((o) => ["planned", "production"].includes(o.status))
      .map((o) => ({ value: o.id, label: `${o.number} · ${o.name}` }));
    fields = [
      select("orderId", "Order", orders, String(d.orderId || "")),
      select("tailorId", "Tailor", tailors),
      n("quantity", "Assigned pieces", Number(d.quantity || 1), 1, "1"),
      {
        key: "dueDate",
        label: "Tailor deadline",
        type: "date",
        value: String(d.dueDate || after(7)),
      },
      {
        key: "notes",
        label: "Assignment instructions",
        type: "textarea",
        required: false,
      },
    ];
  } else if (type === "progress") {
    title = "Update production progress";
    description = `Enter cumulative counts, up to ${d.quantity} assigned pieces. Counts cannot decrease.`;
    submit = "Update progress";
    fields = [
      n("cut", "Pieces cut", Number(d.cut), Number(d.cut), "1"),
      n("sewn", "Pieces stitched", Number(d.sewn), Number(d.sewn), "1"),
      n(
        "finished",
        "Pieces finished & checked",
        Number(d.finished),
        Number(d.finished),
        "1",
      ),
      {
        key: "notes",
        label: "Progress notes / blockers",
        type: "textarea",
        required: false,
      },
    ];
  } else if (type === "quality") {
    title = `Quality review · ${d.number}`;
    description = `${d.quantity} pieces submitted. Accepted pieces become sellable stock; the remainder is recorded as rejected.`;
    submit = "Complete quality review";
    fields = [
      n("accepted", "Accepted pieces", Number(d.quantity), 0, "1"),
      {
        key: "notes",
        label: "Inspection notes and reasons for rejection",
        type: "textarea",
      },
    ];
  } else if (type === "cancelOrder") {
    title = `Cancel ${d.number}`;
    description =
      "Reserved fabric will be released. Issued production cannot be cancelled here.";
    submit = "Cancel order";
    fields = [{ key: "reason", label: "Reason", type: "textarea" }];
  } else if (type === "invoice") {
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
      choice("role", "Access level", ["tailor", "admin"]),
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
                >
                  <option value="" disabled>
                    Select {f.label.toLowerCase()}
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
                  : state.fabrics.map((f) => ({
                      id: f.id,
                      name: `${f.name} · ${meters(f.stock - f.reserved)}`,
                      price: f.price,
                    }));
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
