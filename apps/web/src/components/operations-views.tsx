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
  Truck,
  Upload,
  X,
} from "lucide-react";
import {
  PRODUCTION_SIZES,
  type ProductionWorkOrder,
  type State,
} from "@/lib/types";
import {
  DEFAULT_PRODUCTION_STAGES,
  productionStageRules,
} from "@/lib/production-workflow";
import { Badge, Empty, SectionTitle } from "./ui";
import type { Mutate } from "./editor";
import {
  EnhancedDashboard,
  EnhancedFabricOrders,
  EnhancedPartners,
  EnhancedReports,
  EnhancedTransport,
  PeriodBar,
  inSelectedPeriod,
  usePeriodSelection,
  type OperationFilters,
} from "./enhanced-operations";

type Props = {
  view: string;
  state: State;
  query: string;
  mutate: Mutate;
  refresh: () => Promise<void>;
  filters?: OperationFilters;
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
const PAGE_SIZE = 50;
const paginate = <T,>(items: T[], requestedPage: number) => {
  const page = Math.min(
    requestedPage,
    Math.max(1, Math.ceil(items.length / PAGE_SIZE)),
  );
  return {
    page,
    items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
  };
};
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

function ProductionUpdateDrawer({
  workOrder,
  state,
  mutate,
  close,
}: {
  workOrder: ProductionWorkOrder;
  state: State;
  mutate: Mutate;
  close: () => void;
}) {
  const databaseStages = state.referenceValues
    .filter((item) => item.category === "production_status" && item.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => item.value);
  const stageOptions = Array.from(
    new Set([
      workOrder.status,
      ...(databaseStages.length
        ? databaseStages
        : [...DEFAULT_PRODUCTION_STAGES]),
    ]),
  );
  const [stage, setStage] = useState(workOrder.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rules = productionStageRules(stage);
  const today = new Date().toISOString().slice(0, 10);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const ratio = rules.requireRatio
        ? Object.fromEntries(
            PRODUCTION_SIZES.map((size) => [
              size,
              form.get(`ratio-${size}`) || 0,
            ]),
          )
        : undefined;
      const cutting = rules.showCuttingQuantities
        ? Object.fromEntries(
            PRODUCTION_SIZES.map((size) => [
              size,
              form.get(`cutting-${size}`) || 0,
            ]),
          )
        : undefined;
      await mutate("productionUpdate", {
        id: workOrder.id,
        status: stage,
        ...(rules.requireConsumption
          ? { approvedConsumption: form.get("approvedConsumption") }
          : {}),
        ratio,
        cutting,
        ...(rules.requireCuttingDate
          ? { cuttingDate: form.get("cuttingDate") }
          : {}),
        ...(rules.showFiDone ? { fiDone: form.get("fiDone") === "on" } : {}),
        ...(rules.requireGoodsReadyDate
          ? { actualGoodsReadyDate: form.get("actualGoodsReadyDate") }
          : {}),
        productionRemarks: form.get("productionRemarks"),
      });
      const setwiseQuantity = Number(form.get("setwiseQuantity") || 0),
        mixPiecesQuantity = Number(form.get("mixPiecesQuantity") || 0),
        damagePiecesQuantity = Number(form.get("damagePiecesQuantity") || 0);
      if (
        rules.allowInward &&
        setwiseQuantity + mixPiecesQuantity + damagePiecesQuantity > 0
      )
        await mutate("productionInward", {
          workOrderId: workOrder.id,
          inwardDate: form.get("inwardDate"),
          setwiseQuantity,
          mixPiecesQuantity,
          damagePiecesQuantity,
          remarks: form.get("inwardRemarks"),
        });
      close();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update production",
      );
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
        aria-label={`Update production work order ${workOrder.woNumber}`}
      >
        <header>
          <div>
            <span className="eyebrow">PRODUCTION WORKFLOW</span>
            <h2>WO {workOrder.woNumber}</h2>
            <p>
              {workOrder.itemName} · {workOrder.jobworkerName}
            </p>
          </div>
          <button className="icon-button" aria-label="Close" onClick={close}>
            <X size={19} />
          </button>
        </header>
        <form className="drawer-form" onSubmit={submit}>
          <label className="span-all">
            Production stage
            <select
              name="status"
              value={stage}
              onChange={(event) => setStage(event.target.value)}
              required
            >
              {stageOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <p className="form-note span-all">{rules.description}</p>
          {rules.requireConsumption && (
            <label>
              Approved consumption (metres per piece)
              <input
                name="approvedConsumption"
                type="number"
                min="0.001"
                max="100"
                step="0.001"
                required
                defaultValue={workOrder.approvedConsumption || ""}
              />
            </label>
          )}
          {rules.requireCuttingDate && (
            <label>
              Cutting date
              <input
                name="cuttingDate"
                type="date"
                required
                defaultValue={workOrder.cuttingDate || today}
              />
            </label>
          )}
          {rules.requireRatio && (
            <div className="span-all production-size-section">
              <div>
                <h3>Approved size ratio</h3>
                <span>Enter at least one size.</span>
              </div>
              <div className="production-size-grid">
                {PRODUCTION_SIZES.map((size) => (
                  <label key={size}>
                    {size}
                    <input
                      name={`ratio-${size}`}
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={workOrder.ratio[size] || ""}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
          {rules.showCuttingQuantities && (
            <div className="span-all production-size-section">
              <div>
                <h3>Cut quantities by size</h3>
                <span>Required from Cutting Completed onward.</span>
              </div>
              <div className="production-size-grid">
                {PRODUCTION_SIZES.map((size) => (
                  <label key={size}>
                    {size}
                    <input
                      name={`cutting-${size}`}
                      type="number"
                      min="0"
                      step="1"
                      defaultValue={workOrder.cutting[size] || ""}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
          {rules.showFiDone && (
            <label className="checkbox span-all">
              <input
                name="fiDone"
                type="checkbox"
                defaultChecked={workOrder.fiDone}
              />
              Final inspection completed
            </label>
          )}
          {rules.requireGoodsReadyDate && (
            <label>
              Actual goods ready date
              <input
                name="actualGoodsReadyDate"
                type="date"
                required
                defaultValue={workOrder.actualGoodsReadyDate || today}
              />
            </label>
          )}
          <label className="span-all">
            Production remarks
            <textarea
              name="productionRemarks"
              required={rules.requireRemarks}
              defaultValue={workOrder.productionRemarks}
              placeholder={
                rules.requireRemarks
                  ? "Required for this stage"
                  : "Blockers, checks, or next action"
              }
            />
          </label>
          {rules.allowInward && (
            <section className="span-all production-inward-section">
              <div>
                <h3>Garment inward</h3>
                <p>
                  Optional now. Enter any received quantities to clear the lot
                  and add accepted pieces to finished goods.
                </p>
              </div>
              <div className="production-inward-grid">
                <label>
                  Inward date
                  <input name="inwardDate" type="date" defaultValue={today} />
                </label>
                <label>
                  Setwise quantity
                  <input
                    name="setwiseQuantity"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue="0"
                  />
                </label>
                <label>
                  Mix pieces
                  <input
                    name="mixPiecesQuantity"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue="0"
                  />
                </label>
                <label>
                  Damage pieces
                  <input
                    name="damagePiecesQuantity"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue="0"
                  />
                </label>
                <label className="span-all">
                  Inward remarks
                  <textarea name="inwardRemarks" />
                </label>
              </div>
            </section>
          )}
          {error && (
            <p className="error span-all" role="alert">
              {error}
            </p>
          )}
          <div className="form-footer span-all">
            <button className="button secondary" type="button" onClick={close}>
              Cancel
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? "Saving…" : "Save production update"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

export function OperationsViews({
  view,
  state,
  query,
  mutate,
  refresh,
  filters = {},
}: Props) {
  const [page, setPage] = useState(1);
  const [productionOrderId, setProductionOrderId] = useState("");
  const period = usePeriodSelection(filters);
  const match = (...values: unknown[]) =>
    values.join(" ").toLowerCase().includes(query.toLowerCase());
  if (view === "overview")
    return <EnhancedDashboard state={state} filters={filters} />;
  if (view === "master-data")
    return <EnhancedPartners state={state} mutate={mutate} query={query} />;
  if (view === "customers")
    return (
      <EnhancedPartners
        state={state}
        mutate={mutate}
        query={query}
        customersOnly
      />
    );
  if (view === "suppliers")
    return (
      <EnhancedPartners
        state={state}
        mutate={mutate}
        query={query}
        suppliersOnly
      />
    );
  if (view === "reports")
    return <EnhancedReports state={state} filters={filters} />;
  if (view === "fabric-orders")
    return (
      <EnhancedFabricOrders
        state={state}
        query={query}
        mutate={mutate}
        refresh={refresh}
        filters={filters}
      />
    );
  if (view === "transport-dc")
    return (
      <>
        {state.user.role === "admin" && (
          <NewTransport state={state} mutate={mutate} />
        )}
        <EnhancedTransport state={state} query={query} filters={filters} />
      </>
    );
  if (view === "production") {
    const work = state.workOrders.filter(
      (item) =>
        !item.archived &&
        (!filters.open || item.id === filters.open) &&
        (!filters.age || item.ageingDays >= Number(filters.age)) &&
        inSelectedPeriod(item.issuedDate || item.fabricOutwardDate, period) &&
        match(
          item.woNumber,
          item.dcNumber,
          item.jobworkerName,
          item.itemName,
          item.brandName,
          item.status,
        ),
    );
    const visible = paginate(work, page);
    const selectedWorkOrder = state.workOrders.find(
      (item) => item.id === productionOrderId,
    );
    return (
      <>
        <PeriodBar period={period} />
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
              {visible.items.map((item) => (
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
                      onClick={() => setProductionOrderId(item.id)}
                    >
                      Update stage
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty title="No active work orders found" />
          )}
          <Pager total={work.length} page={visible.page} setPage={setPage} />
        </section>
        {selectedWorkOrder && (
          <ProductionUpdateDrawer
            workOrder={selectedWorkOrder}
            state={state}
            mutate={mutate}
            close={() => setProductionOrderId("")}
          />
        )}
      </>
    );
  }
  if (view === "cleared-lots") {
    const inwardByWo = new Map(
      state.inwards.map((item) => [item.workOrderId, item]),
    );
    const periodWorkOrderIds = new Set(
      state.inwards
        .filter((item) => inSelectedPeriod(item.inwardDate, period))
        .map((item) => item.workOrderId),
    );
    const cleared = state.workOrders.filter(
      (item) =>
        item.archived &&
        periodWorkOrderIds.has(item.id) &&
        match(item.woNumber, item.dcNumber, item.jobworkerName, item.itemName),
    );
    const visible = paginate(cleared, page);
    return (
      <>
        <PeriodBar period={period} />
        <section className="panel operations-panel">
          <SectionTitle title="Cleared lots and inward">
            Ordered, cut and inward quantities are reconciled with damage, mix
            and consumption variance.
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
              {visible.items.map((item) => {
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
                        tone={
                          total - item.totalCutQuantity < 0 ? "red" : "green"
                        }
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
                        ? ((item.bodyFabric + item.trimFabric) / total).toFixed(
                            3,
                          )
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
          <Pager total={cleared.length} page={visible.page} setPage={setPage} />
        </section>
      </>
    );
  }
  if (view === "workbook-sync")
    return <WorkbookSync state={state} refresh={refresh} mutate={mutate} />;
  return null;
}

export function OperationsDashboard({ state }: { state: State }) {
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

export function MasterData({
  state,
  mutate,
  query,
}: {
  state: State;
  mutate: Mutate;
  query: string;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const partners = state.organizations.filter((item) =>
    JSON.stringify(item).toLowerCase().includes(query.toLowerCase()),
  );
  const visible = paginate(partners, page);
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
          {visible.items.map((item) => (
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
        <Pager total={partners.length} page={visible.page} setPage={setPage} />
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

function NewTransport({ state, mutate }: { state: State; mutate: Mutate }) {
  const [open, setOpen] = useState(false);
  const [fabricOrderId, setFabricOrderId] = useState("");
  const [fabricName, setFabricName] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [fabricQuantity, setFabricQuantity] = useState("");
  const [pricePerMetre, setPricePerMetre] = useState("");
  const [transporterId, setTransporterId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const partners = (
    role: "supplier" | "distributor" | "jobworker" | "transporter",
  ) =>
    state.organizations.filter((organization) =>
      organization.roles.includes(role),
    );
  const selectedOrder = state.fabricOrders.find(
    (order) => order.id === fabricOrderId,
  );
  function selectOrder(id: string) {
    setFabricOrderId(id);
    const order = state.fabricOrders.find((item) => item.id === id);
    if (!order) {
      setFabricName("");
      setSupplierId("");
      setPartyId("");
      setFabricQuantity("");
      setPricePerMetre("");
      return;
    }
    setFabricName(order.fabricName);
    setSupplierId(order.supplierId);
    setPartyId(order.partyIds?.[0] || "");
    const dispatched = state.transports.filter((item) => item.fabricOrderId === order.id && !["Void", "Returned"].includes(item.stage)).reduce((sum, item) => sum + item.fabricQuantity, 0);
    const sold = state.movements.filter((item) => item.fabricOrderId === order.id && item.type === "Direct sale").reduce((sum, item) => sum - item.quantity / 1000, 0);
    const remaining = Math.max(0, order.receivedMetres - dispatched - sold);
    setFabricQuantity(String(Math.round(remaining * 1000) / 1000));
    setPricePerMetre(String(order.pricePerMetre));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutate(
      "transport",
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    event.currentTarget.reset();
    selectOrder("");
    setTransporterId("");
    setDriverId("");
    setDriverName("");
    setDriverPhone("");
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
          <select
            name="fabricOrderId"
            value={fabricOrderId}
            onChange={(event) => selectOrder(event.target.value)}
          >
            <option value="">Unplanned / no PO</option>
            {state.fabricOrders.map((order) => (
              <option value={order.id} key={order.id}>
                {order.poNumber} · {order.fabricName}
              </option>
            ))}
          </select>
          {selectedOrder ? (
            <p className="form-note span-all relation-summary">
              <strong>{selectedOrder.poNumber}</strong> links this delivery to{" "}
              {selectedOrder.supplierName},{" "}
              {selectedOrder.purposeParty || "its party"}, and{" "}
              {selectedOrder.fabricName}. The remaining quantity and PO rate
              have been filled automatically.
            </p>
          ) : null}
          <input
            name="fabricName"
            value={fabricName}
            onChange={(event) => setFabricName(event.target.value)}
            required
            placeholder="Fabric name (for unplanned)"
          />
          <select
            name="supplierId"
            required
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
          >
            <option value="" disabled>
              Supplier
            </option>
            {partners("supplier").map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            name="partyId"
            required
            value={partyId}
            onChange={(event) => setPartyId(event.target.value)}
          >
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
          <select
            name="transporterId"
            required
            value={transporterId}
            onChange={(event) => {
              setTransporterId(event.target.value);
              setDriverId("");
              setDriverName("");
              setDriverPhone("");
            }}
          >
            <option value="" disabled>
              Transporter
            </option>
            {partners("transporter").map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            name="pickedByPersonId"
            value={driverId}
            onChange={(event) => {
              const id = event.target.value;
              setDriverId(id);
              const person = state.people.find((item) => item.id === id);
              setDriverName(person?.name || "");
              setDriverPhone(person?.phone || "");
            }}
          >
            <option value="">+ Enter a new driver / pickup person</option>
            {state.people
              .filter(
                (person) =>
                  ["driver", "pickup", "delivery"].includes(person.role) &&
                  (!person.organizationId ||
                    person.organizationId === transporterId),
              )
              .map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
          </select>
          <input
            name="pickedBy"
            required
            value={driverName}
            onChange={(event) => {
              setDriverId("");
              setDriverName(event.target.value);
            }}
            placeholder="Picked by / driver"
          />
          <input
            name="driverPhone"
            value={driverPhone}
            onChange={(event) => setDriverPhone(event.target.value)}
            placeholder="Driver phone"
          />
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
            value={fabricQuantity}
            onChange={(event) => setFabricQuantity(event.target.value)}
            placeholder="Fabric quantity (m)"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            name="pricePerMetre"
            value={pricePerMetre}
            onChange={(event) => setPricePerMetre(event.target.value)}
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
        code: string;
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
    [error, setError] = useState(""),
    [repairValues, setRepairValues] = useState<Record<string, string>>({}),
    [ignoreIncomplete, setIgnoreIncomplete] = useState(false),
    [resetOpen, setResetOpen] = useState(false);
  const incomplete = preview?.issues.filter(
    (issue) => issue.code === "REQUIRED_FIELD",
  ) || [];
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
      setRepairValues({});
      setIgnoreIncomplete(false);
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
          body: JSON.stringify({ ignoreIncomplete }),
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
  async function repair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview) return;
    const repairs = incomplete.flatMap((issue) => {
      const fields = Object.fromEntries(
        issue.message
          .split(": ")[1]
          .split(", ")
          .map((field) => [
            field,
            repairValues[`${issue.sheet}:${issue.rowNumber}:${field}`]?.trim(),
          ])
          .filter((entry) => entry[1]),
      );
      return Object.keys(fields).length
        ? [{ sheet: issue.sheet, rowNumber: issue.rowNumber, fields }]
        : [];
    });
    if (!repairs.length) {
      setError("Enter at least one missing value to recheck the workbook.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/sync/workbook/${preview.runId}/repair`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repairs }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setPreview(result);
      setRepairValues({});
      setIgnoreIncomplete(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not recheck workbook");
    } finally {
      setBusy(false);
    }
  }
  async function resetOperations() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/sync/workbook/reset", {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setPreview(null);
      setFile(null);
      setResetOpen(false);
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not clear workbook operations",
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
              setRepairValues({});
              setIgnoreIncomplete(false);
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
            Fill missing values here, or explicitly skip incomplete rows. Skipped
            rows stay visible in the import issue queue with their original values.
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
              {preview.issues.filter((issue) => issue.code !== "REQUIRED_FIELD").slice(0, 12).map((issue, index) => (
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
          {incomplete.length ? (
            <form className="workbook-repairs" onSubmit={repair}>
              <h3>{incomplete.length} rows need your decision</h3>
              <p className="muted">
                Enter any known values and recheck. You may leave other rows for
                the issue queue.
              </p>
              <div className="workbook-repair-list">
                {incomplete.map((issue) => (
                  <fieldset key={`${issue.sheet}:${issue.rowNumber}`}>
                    <legend>{issue.sheet} · row {issue.rowNumber}</legend>
                    {issue.message.split(": ")[1].split(", ").map((field) => {
                      const key = `${issue.sheet}:${issue.rowNumber}:${field}`;
                      return (
                        <label key={key}>
                          {field}
                          <input
                            type={field.includes("Date") ? "date" : "text"}
                            value={repairValues[key] || ""}
                            onChange={(event) =>
                              setRepairValues((current) => ({
                                ...current,
                                [key]: event.target.value,
                              }))
                            }
                          />
                        </label>
                      );
                    })}
                  </fieldset>
                ))}
              </div>
              <button className="button secondary" disabled={busy} type="submit">
                Recheck entered values
              </button>
            </form>
          ) : null}
          {incomplete.length ? (
            <label className="workbook-skip-choice">
              <input
                type="checkbox"
                checked={ignoreIncomplete}
                onChange={(event) => setIgnoreIncomplete(event.target.checked)}
              />
              Import valid rows and skip the {incomplete.length} incomplete rows
            </label>
          ) : null}
          <button
            className="button primary"
            disabled={busy || (incomplete.length > 0 && !ignoreIncomplete)}
            onClick={commit}
          >
            <CheckCircle2 size={16} />
            {incomplete.length ? "Import valid rows and keep issues" : "Commit validated rows"}
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
              {new Date(latest.createdAt).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
              })}
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
        {state.user.role === "admin" && (
          <button
            className="button danger-button small sync-reset-button"
            type="button"
            onClick={() => setResetOpen(true)}
          >
            Clear workbook operations
          </button>
        )}
      </section>
      {resetOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="form-modal compact-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-workbook-title"
          >
            <header>
              <div>
                <span className="eyebrow">WORKBOOK RESET</span>
                <h2 id="reset-workbook-title">Clear operational data?</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close"
                onClick={() => setResetOpen(false)}
              >
                <X size={19} />
              </button>
            </header>
            <div className="modal-body">
              <p>
                A restorable backup is created first. Fabric masters, POs,
                receipts, transports, challans, production, inward records,
                brands, workbook issues, and sync history are then cleared.
                Users, settings, invoices, and manually created garment records
                stay in place.
              </p>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setResetOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="button danger-button"
                  type="button"
                  disabled={busy}
                  onClick={resetOperations}
                >
                  <AlertTriangle size={16} />
                  {busy ? "Creating backup…" : "Create backup and clear"}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
