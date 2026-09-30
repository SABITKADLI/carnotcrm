"use client";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  PackageCheck,
  Printer,
  Truck,
  Upload,
} from "lucide-react";
import type { State } from "@/lib/types";
import { Badge, Empty, SectionTitle } from "./ui";
import type { Mutate } from "./editor";

type Props = {
  view: string;
  state: State;
  query: string;
  mutate: Mutate;
  refresh: () => Promise<void>;
};
const rupees = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
const metric = (label: string, value: ReactNode, note: string) => (
  <div className="stat">
    <span className="stat-label">{label}</span>
    <strong>{value}</strong>
    <span>{note}</span>
  </div>
);
const Table = ({
  headings,
  children,
}: {
  headings: string[];
  children: ReactNode;
}) => (
  <div className="table-scroll">
    <table>
      <thead>
        <tr>
          {headings.map((heading) => (
            <th key={heading}>{heading}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

export function OperationsViews({
  view,
  state,
  query,
  mutate,
  refresh,
}: Props) {
  const match = (...values: unknown[]) =>
    values.join(" ").toLowerCase().includes(query.toLowerCase());
  if (view === "overview") return <OperationsDashboard state={state} />;
  if (view === "master-data")
    return <MasterData state={state} mutate={mutate} query={query} />;
  if (view === "fabric-orders") {
    const orders = state.fabricOrders.filter((order) =>
      match(
        order.poNumber,
        order.fabricName,
        order.supplierName,
        order.purposeParty,
        order.status,
      ),
    );
    return (
      <>
        {state.user.role === "admin" && (
          <NewFabricOrder state={state} mutate={mutate} />
        )}
        <section className="panel operations-panel">
          <SectionTitle title="Fabric purchase orders">
            Every workbook column is stored with its source row and an
            audit-safe calculated value.
          </SectionTitle>
          {orders.length ? (
            <Table
              headings={[
                "PO / date",
                "Fabric",
                "Supplier",
                "Specifications",
                "Purpose",
                "Ordered / received",
                "Value",
                "Status",
                "",
              ]}
            >
              {orders.slice(0, 300).map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.poNumber}</strong>
                    <small>{order.orderDate}</small>
                  </td>
                  <td>
                    <strong>{order.fabricName}</strong>
                    <small>{order.internalItemName || order.fabricType}</small>
                  </td>
                  <td>
                    {order.supplierName}
                    <small>{order.agentName}</small>
                  </td>
                  <td>
                    {order.width}&quot; · {order.folding} fold
                    <small>
                      {order.weave} · {order.content}
                    </small>
                  </td>
                  <td>
                    {order.fabricFor}
                    <small>{order.purposeParty}</small>
                  </td>
                  <td>
                    {order.quantityOrdered.toLocaleString("en-IN")} m
                    <small>
                      {order.receivedMetres.toLocaleString("en-IN")} m received
                    </small>
                  </td>
                  <td>
                    {rupees(order.fabricValue)}
                    <small>{rupees(order.pricePerMetre)} / m</small>
                  </td>
                  <td>
                    <Badge>{order.status}</Badge>
                  </td>
                  <td>
                    {state.user.role === "admin" &&
                      order.receivedMetres < order.quantityOrdered && (
                        <button
                          className="text-link"
                          onClick={async () => {
                            const value = window.prompt(
                              `Metres received against ${order.poNumber}`,
                            );
                            if (!value) return;
                            await mutate("fabricReceipt", {
                              fabricOrderId: order.id,
                              quantityMetres: value,
                              receiptDate: new Date()
                                .toISOString()
                                .slice(0, 10),
                              warehouse: "Singal Fabrics",
                            });
                          }}
                        >
                          Receive
                        </button>
                      )}
                    {state.user.role === "supplier" && (
                      <button
                        className="text-link"
                        onClick={async () => {
                          const estimate = window.prompt(
                            "Updated delivery estimate (YYYY-MM-DD)",
                            order.supplierDeliveryEstimate ||
                              order.deliveryDate,
                          );
                          if (estimate === null) return;
                          const dispatch =
                            window.prompt(
                              "Dispatch / LR details",
                              order.dispatchDetails || "",
                            ) || "";
                          const notes =
                            window.prompt(
                              "Supplier note",
                              order.supplierNotes || "",
                            ) || "";
                          await mutate("supplierUpdate", {
                            id: order.id,
                            acknowledged: true,
                            deliveryEstimate: estimate,
                            dispatchDetails: dispatch,
                            notes,
                          });
                        }}
                      >
                        {order.supplierAcknowledgedAt
                          ? "Update dispatch"
                          : "Acknowledge"}
                      </button>
                    )}
                    {["agent", "distributor"].includes(state.user.role) && (
                      <button
                        className="text-link"
                        onClick={async () => {
                          const note = window.prompt("Add a note to this PO");
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
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty title="No fabric orders found">
              Upload the company workbook or change your search.
            </Empty>
          )}
        </section>
      </>
    );
  }
  if (view === "transport-dc") {
    const challanById = new Map(
      state.challans.map((challan) => [challan.id, challan]),
    );
    const movements = state.transports.filter((item) =>
      match(
        item.outwardDcNumber,
        item.fabricName,
        item.supplierName,
        item.destinationJobworkerName,
        item.transportName,
      ),
    );
    return (
      <>
        {state.user.role === "admin" && (
          <NewTransport state={state} mutate={mutate} />
        )}
        <div className="stats compact-stats">
          {metric(
            "Delivery challans",
            state.challans.length,
            "issued and tracked",
          )}
          {metric(
            "Fabric dispatched",
            `${state.transports.reduce((sum, item) => sum + item.fabricQuantity, 0).toLocaleString("en-IN")} m`,
            "to jobworkers",
          )}
          {metric(
            "Bundles",
            state.transports.reduce((sum, item) => sum + item.numberOfBales, 0),
            "across movements",
          )}
          {metric(
            "Unplanned",
            state.transports.filter((item) => !item.fabricOrderId).length,
            "without a linked PO",
          )}
        </div>
        <section className="panel operations-panel">
          <SectionTitle title="Transport and delivery challans">
            Each line keeps its LR, bundle, pickup, factory, stage and source
            workbook details.
          </SectionTitle>
          {movements.length ? (
            <Table
              headings={[
                "DC / PO",
                "Fabric",
                "Supplier / party",
                "Transport",
                "Destination",
                "Quantity",
                "Stage",
                "Print",
              ]}
            >
              {movements.slice(0, 400).map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.outwardDcNumber}</strong>
                    <small>
                      {item.poNumber || "Unplanned fabric"} · {item.dcIssueDate}
                    </small>
                  </td>
                  <td>
                    <strong>{item.fabricName}</strong>
                    <small>LR {item.lrNumber || "—"}</small>
                  </td>
                  <td>
                    {item.supplierName}
                    <small>{item.partyName}</small>
                  </td>
                  <td>
                    {item.transportName}
                    <small>
                      {item.numberOfBales} bundles · {item.pickedBy}
                    </small>
                  </td>
                  <td>{item.destinationJobworkerName}</td>
                  <td>
                    {item.fabricQuantity.toLocaleString("en-IN")} m
                    <small>
                      {state.user.role === "admin" ? rupees(item.value) : ""}
                    </small>
                  </td>
                  <td>
                    <Badge>
                      {item.challanId
                        ? challanById.get(item.challanId)?.status || item.stage
                        : item.stage}
                    </Badge>
                    {item.challanId &&
                      !["Acknowledged", "Void", "Returned"].includes(
                        challanById.get(item.challanId)?.status || "",
                      ) && (
                        <button
                          className="text-link"
                          onClick={async () => {
                            const status = window.prompt(
                              "Next status: Picked Up, Delivered, or Acknowledged",
                              challanById.get(item.challanId!)?.status ||
                                "Issued",
                            );
                            if (!status) return;
                            await mutate("challanStatus", {
                              id: item.challanId,
                              status,
                            });
                          }}
                        >
                          Update
                        </button>
                      )}
                  </td>
                  <td>
                    {item.challanId && (
                      <Link
                        className="icon-button"
                        aria-label={`Print ${item.outwardDcNumber}`}
                        href={`/delivery-challan/${item.challanId}`}
                      >
                        <Printer size={16} />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty title="No transport records found" />
          )}
        </section>
      </>
    );
  }
  if (view === "production") {
    const work = state.workOrders.filter(
      (item) =>
        !item.archived &&
        match(
          item.woNumber,
          item.dcNumber,
          item.jobworkerName,
          item.itemName,
          item.brandName,
          item.status,
        ),
    );
    return (
      <>
        {state.user.role === "admin" && (
          <NewWorkOrder state={state} mutate={mutate} />
        )}
        <section className="panel operations-panel">
          <SectionTitle title="Active work orders">
            Cutting ratios, approved consumption and production updates stay on
            one linked work order.
          </SectionTitle>
          {work.length ? (
            <Table
              headings={[
                "WO / DC",
                "Jobworker",
                "Brand / item",
                "Fabric issued",
                "Consumption",
                "Cut / expected",
                "Ageing",
                "Stage",
                "Update",
              ]}
            >
              {work.slice(0, 300).map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.woNumber}</strong>
                    <small>
                      {item.dcNumber} · {item.issuedDate}
                    </small>
                  </td>
                  <td>{item.jobworkerName}</td>
                  <td>
                    <strong>{item.brandName}</strong>
                    <small>{item.itemName}</small>
                  </td>
                  <td>
                    {(item.bodyFabric + item.trimFabric).toLocaleString(
                      "en-IN",
                    )}{" "}
                    m<small>{item.fabricName}</small>
                  </td>
                  <td>{item.approvedConsumption || "Awaiting approval"}</td>
                  <td>
                    {item.totalCutQuantity.toLocaleString("en-IN")}
                    <small>
                      {Math.round(item.expectedQuantity).toLocaleString(
                        "en-IN",
                      )}{" "}
                      expected
                    </small>
                  </td>
                  <td>
                    <Badge
                      tone={
                        item.ageingDays >= 60
                          ? "red"
                          : item.ageingDays >= 30
                            ? "amber"
                            : "neutral"
                      }
                    >
                      {item.ageingDays} days
                    </Badge>
                  </td>
                  <td>
                    <Badge>{item.status}</Badge>
                  </td>
                  <td>
                    <button
                      className="text-link"
                      onClick={async () => {
                        const status = window.prompt(
                          "Production stage",
                          item.status,
                        );
                        if (!status) return;
                        const consumption =
                          item.approvedConsumption ||
                          Number(
                            window.prompt(
                              "Approved consumption (metres per piece)",
                              "1.6",
                            ),
                          );
                        const parseSizes = (value: string | null) =>
                          Object.fromEntries(
                            (value || "")
                              .split(",")
                              .map((part) => part.trim().split(":"))
                              .filter(
                                ([size, quantity]) =>
                                  size &&
                                  quantity &&
                                  Number.isFinite(Number(quantity)),
                              )
                              .map(([size, quantity]) => [
                                size.toUpperCase(),
                                Number(quantity),
                              ]),
                          );
                        const ratio = parseSizes(
                          window.prompt(
                            "Size ratio (example: S:1, M:2, L:2, XL:1)",
                            Object.entries(item.ratio)
                              .map(([size, value]) => `${size}:${value}`)
                              .join(", "),
                          ),
                        );
                        const cutting = parseSizes(
                          window.prompt(
                            "Cut quantities by size (optional)",
                            Object.entries(item.cutting)
                              .map(([size, value]) => `${size}:${value}`)
                              .join(", "),
                          ),
                        );
                        await mutate("productionUpdate", {
                          id: item.id,
                          status,
                          approvedConsumption: consumption,
                          ratio,
                          cutting,
                          cuttingDate:
                            item.cuttingDate ||
                            (status.toLowerCase().includes("cut")
                              ? new Date().toISOString().slice(0, 10)
                              : ""),
                          productionRemarks: item.productionRemarks,
                        });
                      }}
                    >
                      Update
                    </button>
                    {(["Ready", "Goods Ready", "Finished"].includes(
                      item.status,
                    ) ||
                      item.actualGoodsReadyDate) && (
                      <button
                        className="text-link"
                        onClick={async () => {
                          const setwise = window.prompt(
                            "Setwise inward quantity",
                            "0",
                          );
                          if (setwise === null) return;
                          const mix = window.prompt("Mix pieces quantity", "0");
                          if (mix === null) return;
                          const damage = window.prompt(
                            "Damage pieces quantity",
                            "0",
                          );
                          if (damage === null) return;
                          await mutate("productionInward", {
                            workOrderId: item.id,
                            inwardDate: new Date().toISOString().slice(0, 10),
                            setwiseQuantity: setwise,
                            mixPiecesQuantity: mix,
                            damagePiecesQuantity: damage,
                          });
                        }}
                      >
                        Receive inward
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty title="No active work orders found" />
          )}
        </section>
      </>
    );
  }
  if (view === "cleared-lots") {
    const inwardByWo = new Map(
      state.inwards.map((item) => [item.workOrderId, item]),
    );
    const cleared = state.workOrders.filter(
      (item) =>
        item.archived &&
        match(item.woNumber, item.dcNumber, item.jobworkerName, item.itemName),
    );
    return (
      <section className="panel operations-panel">
        <SectionTitle title="Cleared lots and inward">
          Ordered, cut and inward quantities are reconciled with damage, mix and
          consumption variance.
        </SectionTitle>
        {cleared.length ? (
          <Table
            headings={[
              "WO / DC",
              "Jobworker",
              "Item",
              "Expected",
              "Cut",
              "Inward",
              "Short / excess",
              "Damage / mix",
              "Final consumption",
              "Days",
            ]}
          >
            {cleared.slice(0, 300).map((item) => {
              const inward = inwardByWo.get(item.id);
              const total = inward?.totalInward || 0;
              return (
                <tr key={item.id}>
                  <td>
                    <strong>{item.woNumber}</strong>
                    <small>{item.dcNumber}</small>
                  </td>
                  <td>{item.jobworkerName}</td>
                  <td>{item.itemName}</td>
                  <td>{Math.round(item.expectedQuantity)}</td>
                  <td>{item.totalCutQuantity}</td>
                  <td>
                    {total || <Badge tone="amber">Awaiting quantity</Badge>}
                  </td>
                  <td>
                    <Badge
                      tone={total - item.totalCutQuantity < 0 ? "red" : "green"}
                    >
                      {total - item.totalCutQuantity}
                    </Badge>
                  </td>
                  <td>
                    {inward?.damagePiecesQuantity || 0} /{" "}
                    {inward?.mixPiecesQuantity || 0}
                  </td>
                  <td>
                    {total
                      ? ((item.bodyFabric + item.trimFabric) / total).toFixed(3)
                      : "—"}
                  </td>
                  <td>{item.ageingDays}</td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty title="No cleared lots found" />
        )}
      </section>
    );
  }
  if (view === "workbook-sync")
    return <WorkbookSync state={state} refresh={refresh} mutate={mutate} />;
  return null;
}

function OperationsDashboard({ state }: { state: State }) {
  const active = state.workOrders.filter((item) => !item.archived),
    cleared = state.workOrders.filter((item) => item.archived);
  const totalInward = state.inwards.reduce(
      (sum, item) => sum + item.totalInward,
      0,
    ),
    damage = state.inwards.reduce(
      (sum, item) => sum + item.damagePiecesQuantity,
      0,
    );
  const attention = active
    .filter((item) => item.ageingDays >= 45)
    .sort((a, b) => b.ageingDays - a.ageingDays)
    .slice(0, 8);
  return (
    <>
      <div className="stats">
        {metric(
          "Fabric ordered",
          `${state.fabricOrders.reduce((sum, item) => sum + item.quantityOrdered, 0).toLocaleString("en-IN")} m`,
          rupees(
            state.fabricOrders.reduce((sum, item) => sum + item.fabricValue, 0),
          ),
        )}
        {metric(
          "At jobworkers",
          `${active.reduce((sum, item) => sum + item.bodyFabric + item.trimFabric, 0).toLocaleString("en-IN")} m`,
          `${active.length} active work orders`,
        )}
        {metric(
          "Garments inward",
          totalInward.toLocaleString("en-IN"),
          `${damage.toLocaleString("en-IN")} damage pieces`,
        )}
        {metric(
          "Lots cleared",
          cleared.length,
          `${state.importIssues.filter((item) => !item.resolved).length} import issues`,
        )}
      </div>
      <div className="operations-dashboard">
        <section className="panel">
          <SectionTitle title="Production ageing">
            Work orders crossing the 45-day attention threshold.
          </SectionTitle>
          {attention.length ? (
            <Table
              headings={["Work order", "Jobworker", "Item", "Stage", "Age"]}
            >
              {attention.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.woNumber}</strong>
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
              ))}
            </Table>
          ) : (
            <Empty title="No ageing work orders" />
          )}
        </section>
        <aside className="panel dashboard-attention">
          <SectionTitle title="Flow health" />
          <div className="health-row">
            <PackageCheck size={18} />
            <span>
              <strong>
                {
                  state.fabricOrders.filter(
                    (item) => item.status === "Received",
                  ).length
                }
              </strong>{" "}
              purchase orders received
            </span>
          </div>
          <div className="health-row">
            <Truck size={18} />
            <span>
              <strong>
                {
                  state.challans.filter(
                    (item) => item.status !== "Acknowledged",
                  ).length
                }
              </strong>{" "}
              challans in transit or awaiting acknowledgement
            </span>
          </div>
          <div className="health-row">
            <AlertTriangle size={18} />
            <span>
              <strong>
                {
                  state.workOrders.filter(
                    (item) => item.ageingDays >= 60 && !item.archived,
                  ).length
                }
              </strong>{" "}
              work orders over 60 days
            </span>
          </div>
          <Link href="/cleared-lots" className="text-link">
            Review discrepancies <ArrowRight size={14} />
          </Link>
        </aside>
      </div>
    </>
  );
}

function MasterData({
  state,
  mutate,
  query,
}: {
  state: State;
  mutate: Mutate;
  query: string;
}) {
  const [open, setOpen] = useState(false);
  const partners = state.organizations.filter((item) =>
    JSON.stringify(item).toLowerCase().includes(query.toLowerCase()),
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("organization", {
      name: form.get("name"),
      roles: [form.get("role")],
      email: form.get("email"),
      phone: form.get("phone"),
      address: form.get("address"),
      taxId: form.get("taxId"),
    });
    event.currentTarget.reset();
    setOpen(false);
  }
  return (
    <>
      <div className="stats compact-stats">
        {metric("Fabrics", state.fabricSpecs.length, "master specifications")}
        {metric(
          "Suppliers",
          state.organizations.filter((item) => item.roles.includes("supplier"))
            .length,
          "mills and vendors",
        )}
        {metric(
          "Jobworkers",
          state.organizations.filter((item) => item.roles.includes("jobworker"))
            .length,
          "production partners",
        )}
        {metric("Brands", state.brands.length, "production labels")}
      </div>
      <section className="panel operations-panel">
        <SectionTitle
          title="Partner directory"
          action={
            state.user.role === "admin" ? (
              <button
                className="button primary small"
                onClick={() => setOpen(!open)}
              >
                <Building2 size={15} /> Add partner
              </button>
            ) : undefined
          }
        >
          Suppliers, agents, jobworkers, transporters, delivery staff and
          distributors are reusable records.
        </SectionTitle>
        {open && (
          <form className="inline-create" onSubmit={submit}>
            <input name="name" required placeholder="Partner name" />
            <select name="role" required>
              <option value="supplier">Supplier</option>
              <option value="agent">Agent</option>
              <option value="jobworker">Jobworker</option>
              <option value="transporter">Transporter</option>
              <option value="distributor">Distributor / party</option>
            </select>
            <input name="email" type="email" placeholder="Email (optional)" />
            <input name="phone" placeholder="Phone (optional)" />
            <input name="taxId" placeholder="GSTIN (optional)" />
            <input name="address" placeholder="Address (optional)" />
            <button className="button primary" type="submit">
              Save partner
            </button>
          </form>
        )}
        <Table headings={["Name", "Roles", "Contact", "GSTIN", "Source"]}>
          {partners.slice(0, 400).map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.name}</strong>
              </td>
              <td>
                {item.roles.map((role) => (
                  <Badge key={role}>{role}</Badge>
                ))}
              </td>
              <td>
                {item.email || item.phone || "—"}
                <small>{item.address}</small>
              </td>
              <td>{item.taxId || "—"}</td>
              <td>
                {item.sourceSheet
                  ? `${item.sourceSheet} · row ${item.sourceRow}`
                  : "Portal"}
              </td>
            </tr>
          ))}
        </Table>
      </section>
    </>
  );
}

function NewWorkOrder({ state, mutate }: { state: State; mutate: Mutate }) {
  const [open, setOpen] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutate(
      "workOrder",
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    event.currentTarget.reset();
    setOpen(false);
  }
  return (
    <section className="panel quick-create">
      <div className="row-between">
        <div>
          <span className="eyebrow">FACTORY ISSUE</span>
          <h3>Create a production work order</h3>
        </div>
        <button
          className="button secondary small"
          onClick={() => setOpen(!open)}
        >
          {open ? "Close" : "New work order"}
        </button>
      </div>
      {open && (
        <form className="inline-create" onSubmit={submit}>
          <select name="challanId" required defaultValue="">
            <option value="" disabled>
              Delivery challan
            </option>
            {state.challans
              .filter((item) => !["Void", "Returned"].includes(item.status))
              .map((item) => (
                <option value={item.id} key={item.id}>
                  {item.number} · {item.consignee.name}
                </option>
              ))}
          </select>
          <select name="brandId" required defaultValue="">
            <option value="" disabled>
              Brand
            </option>
            {state.brands.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <input name="itemName" required placeholder="Garment / item name" />
          <input
            type="number"
            min="0.01"
            step="0.01"
            name="bodyFabric"
            required
            placeholder="Body fabric (m)"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            name="trimFabric"
            defaultValue="0"
            placeholder="Trim fabric (m)"
          />
          <input type="date" name="issuedDate" required />
          <input
            type="number"
            min="0.001"
            step="0.001"
            name="approvedConsumption"
            placeholder="Approved consumption"
          />
          <input name="remarks" placeholder="Remarks" />
          <button className="button primary" type="submit">
            Create work order
          </button>
        </form>
      )}
    </section>
  );
}

function NewFabricOrder({ state, mutate }: { state: State; mutate: Mutate }) {
  const [open, setOpen] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutate(
      "fabricOrder",
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    event.currentTarget.reset();
    setOpen(false);
  }
  return (
    <section className="panel quick-create">
      <div className="row-between">
        <div>
          <span className="eyebrow">PURCHASING</span>
          <h3>Create a fabric PO</h3>
        </div>
        <button
          className="button secondary small"
          onClick={() => setOpen(!open)}
        >
          {open ? "Close" : "New fabric order"}
        </button>
      </div>
      {open && (
        <form className="inline-create" onSubmit={submit}>
          <select name="fabricSpecId" required defaultValue="">
            <option value="" disabled>
              Select fabric
            </option>
            {state.fabricSpecs.map((spec) => (
              <option value={spec.id} key={spec.id}>
                {spec.name}
              </option>
            ))}
          </select>
          <input type="date" name="orderDate" required />
          <input type="date" name="deliveryDate" required />
          <input name="fabricType" required placeholder="Fabric type" />
          <input
            type="number"
            min="0.01"
            step="0.01"
            name="pricePerMetre"
            required
            placeholder="Price per metre"
          />
          <input
            type="number"
            min="0.01"
            step="0.01"
            name="quantityOrdered"
            required
            placeholder="Quantity (m)"
          />
          <input name="designs" required placeholder="Designs" />
          <input name="colors" required placeholder="Colors" />
          <input name="purposeParty" required placeholder="Purpose / party" />
          <input name="fabricFor" required placeholder="Fabric for" />
          <input name="remarks" placeholder="Remarks (optional)" />
          <button className="button primary" type="submit">
            Create PO
          </button>
        </form>
      )}
    </section>
  );
}

function NewTransport({ state, mutate }: { state: State; mutate: Mutate }) {
  const [open, setOpen] = useState(false);
  const partners = (
    role: "supplier" | "distributor" | "jobworker" | "transporter",
  ) =>
    state.organizations.filter((organization) =>
      organization.roles.includes(role),
    );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutate(
      "transport",
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    event.currentTarget.reset();
    setOpen(false);
  }
  return (
    <section className="panel quick-create">
      <div className="row-between">
        <div>
          <span className="eyebrow">LOGISTICS</span>
          <h3>Issue a delivery challan</h3>
        </div>
        <button
          className="button secondary small"
          onClick={() => setOpen(!open)}
        >
          {open ? "Close" : "New transport & DC"}
        </button>
      </div>
      {open && (
        <form className="inline-create" onSubmit={submit}>
          <select name="fabricOrderId" defaultValue="">
            <option value="">Unplanned / no PO</option>
            {state.fabricOrders.map((order) => (
              <option value={order.id} key={order.id}>
                {order.poNumber} · {order.fabricName}
              </option>
            ))}
          </select>
          <input name="fabricName" placeholder="Fabric name (for unplanned)" />
          <select name="supplierId" required defaultValue="">
            <option value="" disabled>
              Supplier
            </option>
            {partners("supplier").map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select name="partyId" required defaultValue="">
            <option value="" disabled>
              Party / purpose
            </option>
            {partners("distributor").map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select name="jobworkerId" required defaultValue="">
            <option value="" disabled>
              Destination jobworker
            </option>
            {partners("jobworker").map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select name="transporterId" required defaultValue="">
            <option value="" disabled>
              Transporter
            </option>
            {partners("transporter").map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <input name="pickedBy" required placeholder="Picked by / driver" />
          <input name="driverPhone" placeholder="Driver phone" />
          <input name="lrNumber" placeholder="LR number" />
          <input type="date" name="lrDate" />
          <input
            type="number"
            min="1"
            name="numberOfBales"
            required
            placeholder="Bales / bundles"
          />
          <input
            type="number"
            min="0.01"
            step="0.01"
            name="fabricQuantity"
            required
            placeholder="Fabric quantity (m)"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            name="pricePerMetre"
            placeholder="Price / m (unplanned)"
          />
          <input type="date" name="dcIssueDate" required />
          <input name="priority" placeholder="Priority" />
          <input name="remarks" placeholder="Remarks" />
          <button className="button primary" type="submit">
            Issue and create challan
          </button>
        </form>
      )}
    </section>
  );
}

function WorkbookSync({
  state,
  refresh,
  mutate,
}: {
  state: State;
  refresh: () => Promise<void>;
  mutate: Mutate;
}) {
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<{
      runId: string;
      mode: string;
      summary: Record<string, number>;
      issues: {
        sheet: string;
        rowNumber: number;
        severity: string;
        message: string;
      }[];
      conflicts: {
        id: string;
        kind: string;
        sheet: string;
        rowNumber: number;
        field: string;
      }[];
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const latest = useMemo(
    () =>
      state.syncRuns
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
    [state.syncRuns],
  );
  const latestBackup = state.operationalBackups
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  async function upload() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/sync/workbook/preview", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setPreview(result);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not preview workbook",
      );
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/sync/workbook/${preview.runId}/commit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setPreview(null);
      setFile(null);
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not commit workbook",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sync-layout">
      <section className="panel sync-card">
        <FileSpreadsheet size={34} strokeWidth={1.2} />
        <SectionTitle title="Manual workbook sync">
          Upload the six-sheet tracker to preview every addition, edit and
          validation issue before data changes.
        </SectionTitle>
        <label className="upload-box">
          <Upload size={22} />
          <span>{file?.name || "Choose SF Fabric Tracker.xlsx"}</span>
          <input
            type="file"
            accept=".xlsx"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setPreview(null);
            }}
          />
        </label>
        <div className="row-between">
          <button
            className="button primary"
            disabled={!file || busy}
            onClick={upload}
          >
            {busy ? "Reading workbook…" : "Preview changes"}
          </button>
          <Link className="button secondary" href="/api/sync/workbook/export">
            <Download size={16} /> Download current workbook
          </Link>
        </div>
        {error && <p className="error">{error}</p>}
      </section>
      {preview && (
        <section className="panel sync-preview">
          <SectionTitle
            title={`${preview.mode === "replace" ? "Initial replacement" : "Two-way sync"} preview`}
          >
            Valid rows can be committed; malformed rows remain visible in the
            exception queue.
          </SectionTitle>
          <div className="sync-counts">
            {Object.entries(preview.summary).map(([label, value]) => (
              <div key={label}>
                <strong>{value}</strong>
                <span>{label.replace(/([A-Z])/g, " $1")}</span>
              </div>
            ))}
          </div>
          {preview.conflicts?.length > 0 && (
            <div className="issue-list">
              {preview.conflicts.map((conflict) => (
                <p key={conflict.id}>
                  <Badge tone="amber">Conflict</Badge>
                  <strong>
                    {conflict.sheet} row {conflict.rowNumber}
                  </strong>
                  <span>
                    {conflict.field === "$archive"
                      ? "Excel removed this row"
                      : "Excel and portal both changed"}{" "}
                    ·{" "}
                    <button
                      className="text-link"
                      onClick={() =>
                        mutate("syncConflict", {
                          id: conflict.id,
                          resolution: "portal",
                        })
                      }
                    >
                      Keep portal
                    </button>{" "}
                    <button
                      className="text-link"
                      onClick={() =>
                        mutate("syncConflict", {
                          id: conflict.id,
                          resolution:
                            conflict.field === "$archive"
                              ? "archive"
                              : "workbook",
                        })
                      }
                    >
                      {conflict.field === "$archive" ? "Archive" : "Use Excel"}
                    </button>
                  </span>
                </p>
              ))}
            </div>
          )}
          {preview.issues.length > 0 && (
            <div className="issue-list">
              {preview.issues.slice(0, 12).map((issue, index) => (
                <p key={`${issue.sheet}-${issue.rowNumber}-${index}`}>
                  <Badge tone={issue.severity === "error" ? "red" : "amber"}>
                    {issue.severity}
                  </Badge>
                  <strong>
                    {issue.sheet} row {issue.rowNumber}
                  </strong>
                  {issue.message}
                </p>
              ))}
            </div>
          )}
          <button className="button primary" disabled={busy} onClick={commit}>
            <CheckCircle2 size={16} /> Commit valid rows
          </button>
        </section>
      )}
      <section className="panel">
        <SectionTitle title="Sync history" />
        {latest ? (
          <p>
            <strong>{latest.fileName}</strong>
            <br />
            <span className="muted">
              {latest.status} ·{" "}
              {new Date(latest.createdAt).toLocaleString("en-IN")}
            </span>
          </p>
        ) : (
          <p className="muted">No workbook has been imported yet.</p>
        )}
        {latestBackup && (
          <Link className="text-link" href={`/api/backups/${latestBackup.id}`}>
            <Download size={14} /> Download pre-import backup
          </Link>
        )}
      </section>
    </div>
  );
}
