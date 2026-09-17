"use client";
import { useState } from "react";
import { Plus, Trash2, Scissors, Download, Check, Loader2 } from "lucide-react";
import { createPlan } from "@/lib/cutting";
import {
  meters,
  type State,
  type Order,
  type Piece,
  type Plan,
} from "@/lib/types";
import { Empty, Field, Badge } from "./ui";
import type { Mutate } from "./editor";
export function downloadCSV(name: string, rows: unknown[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((value) => {
          let s = String(value ?? "");
          if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
          return `"${s.replaceAll('"', '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export function CuttingMap({ plan }: { plan: Plan }) {
  const length = Math.min(plan.length, 7000);
  const colors = [
    "#af715c",
    "#d5b68e",
    "#a4aea1",
    "#919fa9",
    "#c5bbb1",
    "#b5a3aa",
  ];
  const names = [...new Set(plan.placements.map((p) => p.name))];
  return (
    <div className="marker">
      <div className="row-between">
        <span className="eyebrow">RECTANGULAR MARKER PREVIEW</span>
        <span>
          {meters(length)} shown / {meters(plan.length)} total
        </span>
      </div>
      <svg
        role="img"
        aria-label={`Cutting estimate, ${plan.utilization}% utilization`}
        viewBox={`0 0 ${length} ${plan.width}`}
      >
        <rect width={length} height={plan.width} fill="#e5dfd5" />
        {plan.placements
          .filter((p) => p.y < length)
          .map((p, i) => (
            <g key={i}>
              <rect
                x={p.y}
                y={p.x}
                width={p.length}
                height={p.width}
                rx={6}
                fill={colors[names.indexOf(p.name) % colors.length]}
                stroke="#f8f5ef"
                strokeWidth={6}
              />
              {p.length > 250 && p.width > 180 && (
                <text x={p.y + 25} y={p.x + 70} fontSize={52} fill="#252e2d">
                  {p.name}
                </text>
              )}
            </g>
          ))}
      </svg>
      <div className="marker-legend">
        {names.map((name, i) => (
          <span key={name}>
            <i style={{ background: colors[i % colors.length] }} />
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
const defaults: Piece[] = [
  { name: "Front", width: 520, length: 780, count: 2, rotate: false },
  { name: "Back", width: 560, length: 800, count: 1, rotate: false },
  { name: "Sleeve", width: 340, length: 620, count: 2, rotate: false },
  { name: "Collar / cuff", width: 200, length: 400, count: 2, rotate: true },
];
export function CuttingRoom({
  state,
  mutate,
}: {
  state: State;
  mutate: Mutate;
}) {
  const orders = state.orders.filter((o) => o.status !== "cancelled");
  const [selected, setSelected] = useState(
    orders.find((o) => ["draft", "planned"].includes(o.status))?.id ||
      orders[0]?.id ||
      "",
  );
  const order = orders.find((o) => o.id === selected);
  if (!orders.length)
    return (
      <Empty title="Your cutting room is ready">
        Create a garment order and select its fabric to begin planning.
      </Empty>
    );
  return (
    <>
      <div className="cutting-select">
        <Field label="Production order">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.number} · {o.name} · {o.quantity} pieces
              </option>
            ))}
          </select>
        </Field>
        {order && <Badge>{order.status}</Badge>}
      </div>
      {order && (
        <Planner key={order.id} order={order} state={state} mutate={mutate} />
      )}
    </>
  );
}
function Planner({
  order,
  state,
  mutate,
}: {
  order: Order;
  state: State;
  mutate: Mutate;
}) {
  const fabric = state.fabrics.find((f) => f.id === order.fabricId)!;
  const [pieces, setPieces] = useState<Piece[]>(order.plan?.pieces || defaults);
  const [allowance, setAllowance] = useState(order.plan?.allowance ?? 10);
  const [shrinkage, setShrinkage] = useState(order.plan?.shrinkage ?? 0);
  const [gap, setGap] = useState(order.plan?.gap ?? 3);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const locked = !["draft", "planned"].includes(order.status);
  let plan: Plan | undefined,
    planError = "";
  try {
    plan = locked
      ? order.plan
      : createPlan(
          fabric.width,
          order.quantity,
          pieces,
          allowance,
          shrinkage,
          gap,
        );
  } catch (e) {
    planError = e instanceof Error ? e.message : "Invalid plan";
  }
  const update = (i: number, values: Partial<Piece>) => {
    setPieces(pieces.map((p, j) => (j === i ? { ...p, ...values } : p)));
    setMessage("");
  };
  async function approve() {
    setBusy(true);
    setError("");
    try {
      await mutate("plan", { id: order.id, pieces, allowance, shrinkage, gap });
      setMessage("Plan approved. Fabric is reserved for this order.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to reserve fabric");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="notice">
        <Scissors size={19} />
        <div>
          <strong>A planning estimate, made for review.</strong>
          <p>
            Enter your approved pattern dimensions, including seam allowances.
            Sample shirt pieces are a starting point. This rectangular layout
            does not model curved patterns, checks, defects or industrial
            nesting.
          </p>
        </div>
      </div>
      <div className="cutting-meta">
        <div>
          <span>Fabric / dye lot</span>
          <strong>
            {fabric.name} · {fabric.color}
          </strong>
          <small>{fabric.lot}</small>
        </div>
        <div>
          <span>Roll width</span>
          <strong>{fabric.width} mm</strong>
        </div>
        <div>
          <span>Available to this order</span>
          <strong>
            {meters(
              fabric.stock -
                fabric.reserved +
                (locked ? 0 : order.plan?.length || 0),
            )}
          </strong>
        </div>
        <div>
          <span>Production quantity</span>
          <strong>{order.quantity} pieces</strong>
        </div>
      </div>
      <div className="panel">
        <div className="section-title">
          <div>
            <h2>Pattern components</h2>
            <p>Dimensions in millimetres · quantities per garment</p>
          </div>
          {!locked && (
            <button
              className="button secondary"
              onClick={() =>
                setPieces([
                  ...pieces,
                  {
                    name: "New component",
                    width: 200,
                    length: 300,
                    count: 1,
                    rotate: false,
                  },
                ])
              }
            >
              <Plus size={16} />
              Add piece
            </button>
          )}
        </div>
        <div className="table-scroll">
          <table className="pattern-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Width (mm)</th>
                <th>Length (mm)</th>
                <th>Per garment</th>
                <th>90° rotation</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pieces.map((p, i) => (
                <tr key={i}>
                  <td>
                    <input
                      aria-label={`Component ${i + 1} name`}
                      disabled={locked}
                      value={p.name}
                      onChange={(e) => update(i, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`${p.name} width`}
                      disabled={locked}
                      type="number"
                      min={1}
                      value={p.width}
                      onChange={(e) =>
                        update(i, { width: Number(e.target.value) })
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`${p.name} length`}
                      disabled={locked}
                      type="number"
                      min={1}
                      value={p.length}
                      onChange={(e) =>
                        update(i, { length: Number(e.target.value) })
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`${p.name} count`}
                      disabled={locked}
                      type="number"
                      min={1}
                      value={p.count}
                      onChange={(e) =>
                        update(i, { count: Number(e.target.value) })
                      }
                    />
                  </td>
                  <td>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        disabled={locked}
                        checked={p.rotate}
                        onChange={(e) =>
                          update(i, { rotate: e.target.checked })
                        }
                      />
                      Allowed
                    </label>
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${p.name}`}
                      disabled={locked || pieces.length === 1}
                      onClick={() =>
                        setPieces(pieces.filter((_, j) => j !== i))
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="planner-controls">
          <Field label="Selvedge each side (mm)">
            <input
              disabled={locked}
              type="number"
              min={0}
              max={100}
              value={allowance}
              onChange={(e) => setAllowance(Number(e.target.value))}
            />
          </Field>
          <Field label="Expected shrinkage (%)">
            <input
              disabled={locked}
              type="number"
              min={0}
              max={20}
              step="0.1"
              value={shrinkage}
              onChange={(e) => setShrinkage(Number(e.target.value))}
            />
          </Field>
          <Field label="Cutting gap (mm)">
            <input
              disabled={locked}
              type="number"
              min={0}
              max={50}
              value={gap}
              onChange={(e) => setGap(Number(e.target.value))}
            />
          </Field>
        </div>
      </div>
      {planError && (
        <p className="error" role="alert">
          {planError}
        </p>
      )}
      {plan && (
        <>
          <div className="plan-results">
            <div>
              <span>Fabric required</span>
              <strong>{meters(plan.length)}</strong>
            </div>
            <div>
              <span>Marker utilization</span>
              <strong>{plan.utilization}%</strong>
            </div>
            <div>
              <span>Unused marker area</span>
              <strong>{(plan.waste / 1e6).toFixed(2)} m²</strong>
            </div>
            <div>
              <span>Total components</span>
              <strong>{plan.placements.length.toLocaleString()}</strong>
            </div>
          </div>
          <CuttingMap plan={plan} />
          <div className="form-footer">
            <button
              className="button secondary"
              onClick={() =>
                downloadCSV(`${order.number}-cutting-plan.csv`, [
                  [
                    "Component",
                    "Across roll (mm)",
                    "Along roll (mm)",
                    "Width (mm)",
                    "Length (mm)",
                    "Rotated",
                  ],
                  ...plan.placements.map((p) => [
                    p.name,
                    p.x,
                    p.y,
                    p.width,
                    p.length,
                    p.rotated,
                  ]),
                ])
              }
            >
              <Download size={16} />
              Export full marker
            </button>
            {!locked && (
              <button
                className="button primary"
                disabled={busy || !!planError}
                onClick={approve}
              >
                {busy ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <Check size={16} />
                )}
                Approve & reserve fabric
              </button>
            )}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
    </>
  );
}
