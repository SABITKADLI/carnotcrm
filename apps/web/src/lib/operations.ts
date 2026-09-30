import { state } from "./service";
import type { State, User } from "./types";

export type OperationalList =
  | "fabricOrders"
  | "transports"
  | "challans"
  | "workOrders"
  | "clearedLots"
  | "partners";
export async function paginated(
  user: User,
  list: OperationalList,
  url: string,
) {
  const data = await state(user);
  const query = new URL(url).searchParams;
  const page = Math.max(1, Number(query.get("page") || 1));
  const pageSize = Math.min(
    100,
    Math.max(10, Number(query.get("pageSize") || 25)),
  );
  const search = (query.get("q") || "").toLowerCase();
  const source: unknown[] =
    list === "clearedLots"
      ? data.workOrders.filter((item) => item.archived)
      : list === "partners"
        ? data.organizations
        : list === "workOrders"
          ? data.workOrders.filter((item) => !item.archived)
          : (data[list as keyof State] as unknown[]);
  const filtered = search
    ? source.filter((record) =>
        JSON.stringify(record).toLowerCase().includes(search),
      )
    : source;
  return {
    items: filtered.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total: filtered.length,
    pages: Math.ceil(filtered.length / pageSize),
  };
}

const sumBy = <T>(values: T[], value: (item: T) => number) =>
  values.reduce((sum, item) => sum + value(item), 0);
const group = <T>(
  values: T[],
  key: (item: T) => string,
  value: (item: T) => number = () => 1,
) =>
  Object.entries(
    values.reduce<Record<string, number>>((result, item) => {
      const name = key(item) || "Unspecified";
      result[name] = (result[name] || 0) + value(item);
      return result;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .map(([label, amount]) => ({ label, value: amount }));
export async function dashboard(user: User, fy: string) {
  const data = await state(user);
  const startYear = Number(fy.split("-")[0]) || new Date().getFullYear();
  const start = `${startYear}-04-01`,
    end = `${startYear + 1}-03-31`;
  const inside = (date: string) => !date || (date >= start && date <= end);
  const orders = data.fabricOrders.filter((order) => inside(order.orderDate));
  const transports = data.transports.filter((movement) =>
    inside(movement.dcIssueDate),
  );
  const active = data.workOrders.filter((order) => !order.archived);
  const cleared = data.workOrders.filter(
    (order) => order.archived && inside(order.actualGoodsReadyDate),
  );
  const inwardByWo = new Map(
    data.inwards.map((item) => [item.workOrderId, item]),
  );
  const discrepancies = cleared.map((workOrder) => {
    const inward = inwardByWo.get(workOrder.id);
    const received = inward?.totalInward || 0;
    const shortageExcess = received - workOrder.totalCutQuantity;
    const consumptionVariance =
      received && workOrder.approvedConsumption
        ? workOrder.bodyFabric / received - workOrder.approvedConsumption
        : 0;
    return {
      workOrderId: workOrder.id,
      woNumber: workOrder.woNumber,
      expected: workOrder.expectedQuantity,
      cut: workOrder.totalCutQuantity,
      inward: received,
      shortageExcess,
      damage: inward?.damagePiecesQuantity || 0,
      mix: inward?.mixPiecesQuantity || 0,
      consumptionVariance,
      lossValue:
        Math.max(0, -shortageExcess) *
        workOrder.pricePerMetre *
        (workOrder.approvedConsumption || 0),
      issue: received ? "" : "Awaiting inward quantity",
    };
  });
  return {
    fy,
    period: { start, end },
    fabric: {
      quantity: sumBy(orders, (o) => o.quantityOrdered),
      value: sumBy(orders, (o) => o.fabricValue),
      overdue: orders.filter(
        (o) =>
          o.deliveryDate &&
          o.deliveryDate < new Date().toISOString().slice(0, 10) &&
          !["Received", "Cancelled"].includes(o.status),
      ).length,
      byPurpose: group(
        orders,
        (o) => o.fabricFor,
        (o) => o.quantityOrdered,
      ),
      byType: group(
        orders,
        (o) => o.fabricType,
        (o) => o.quantityOrdered,
      ),
      byStatus: group(orders, (o) => o.status),
      byMonth: group(
        orders,
        (o) => o.orderDate.slice(0, 7),
        (o) => o.quantityOrdered,
      ),
    },
    transport: {
      rows: transports.length,
      unplannedQuantity: sumBy(
        transports.filter((m) => !m.fabricOrderId),
        (m) => m.fabricQuantity,
      ),
      unplannedValue: sumBy(
        transports.filter((m) => !m.fabricOrderId),
        (m) => m.value,
      ),
      bundles: sumBy(transports, (m) => m.numberOfBales),
      quantity: sumBy(transports, (m) => m.fabricQuantity),
      value: sumBy(transports, (m) => m.value),
      byMonth: group(
        transports,
        (m) => m.dcIssueDate.slice(0, 7),
        (m) => m.fabricQuantity,
      ),
    },
    production: {
      activeWorkOrders: active.length,
      fabricAtJobworkers: sumBy(active, (o) => o.bodyFabric + o.trimFabric),
      value: sumBy(active, (o) => o.value),
      byJobworker: group(active, (o) => o.jobworkerName),
      byStage: group(active, (o) => o.status),
      byBrand: group(active, (o) => o.brandName),
      ageing30: active.filter((o) => o.ageingDays >= 30).length,
      ageing45: active.filter((o) => o.ageingDays >= 45).length,
      ageing60: active.filter((o) => o.ageingDays >= 60).length,
    },
    inward: {
      total: sumBy(data.inwards, (i) => i.totalInward),
      damage: sumBy(data.inwards, (i) => i.damagePiecesQuantity),
      mix: sumBy(data.inwards, (i) => i.mixPiecesQuantity),
      byMonth: group(
        data.inwards,
        (i) => i.inwardDate.slice(0, 7),
        (i) => i.totalInward,
      ),
    },
    clearance: {
      lots: cleared.length,
      averageDays: cleared.length
        ? Math.round(sumBy(cleared, (o) => o.ageingDays) / cleared.length)
        : 0,
      byJobworker: group(cleared, (o) => o.jobworkerName),
      fastestDays: cleared.length
        ? Math.min(...cleared.map((o) => o.ageingDays))
        : 0,
      slowestDays: cleared.length
        ? Math.max(...cleared.map((o) => o.ageingDays))
        : 0,
    },
    discrepancies,
    unresolved: {
      imports: data.importIssues.filter((i) => !i.resolved).length,
      conflicts: data.syncConflicts.filter((i) => !i.resolution).length,
    },
  };
}
