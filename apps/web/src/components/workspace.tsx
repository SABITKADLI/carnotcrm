"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  Scissors,
  Spool,
  Factory,
  Package,
  Users,
  Truck,
  ReceiptText,
  ChartNoAxesCombined,
  History,
  Settings2,
  Search,
  Plus,
  ArrowUpRight,
  LogOut,
  Menu,
  X,
  Download,
  CircleCheck,
  RefreshCw,
} from "lucide-react";
import { type State } from "@/lib/types";
import { Editor, type EditRequest } from "./editor";
import { Views } from "./views";
import { CuttingRoom, downloadCSV } from "./cutting-room";
import { Progress } from "./ui";
const navigation = [
  {
    id: "overview",
    label: "Studio overview",
    icon: LayoutDashboard,
    group: "WORKSPACE",
  },
  { id: "orders", label: "Garment orders", icon: ShoppingBag },
  { id: "cutting", label: "Cutting room", icon: Scissors },
  { id: "production", label: "Tailor production", icon: Factory },
  {
    id: "fabrics",
    label: "Fabric library",
    icon: Spool,
    group: "MATERIALS & TRADE",
  },
  { id: "purchases", label: "Purchase orders", icon: Truck },
  { id: "products", label: "Finished goods", icon: Package },
  { id: "customers", label: "Customers", icon: Users },
  { id: "suppliers", label: "Suppliers", icon: Truck },
  {
    id: "invoices",
    label: "Billing & payments",
    icon: ReceiptText,
    group: "BUSINESS",
  },
  { id: "reports", label: "Reports", icon: ChartNoAxesCombined },
  { id: "activity", label: "Activity log", icon: History },
  { id: "settings", label: "Settings", icon: Settings2 },
];
const headings: Record<string, [string, string]> = {
  overview: [
    "A view of the whole studio.",
    "The orders, materials and people moving your business forward.",
  ],
  orders: [
    "Every order, considered.",
    "From a customer brief to the final quality check.",
  ],
  cutting: [
    "Make more of every metre.",
    "Plan components, review utilization and reserve your fabric.",
  ],
  production: [
    "Good work, in progress.",
    "A shared production floor for your studio and tailoring partners.",
  ],
  fabrics: [
    "The material comes first.",
    "Every fabric, dye lot and metre, accounted for.",
  ],
  purchases: [
    "Keep the studio supplied.",
    "Place purchase orders and receive fabric as it arrives.",
  ],
  products: [
    "Made. Checked. Ready.",
    "Finished pieces available for customers or your Shopify store.",
  ],
  customers: [
    "Relationships, well kept.",
    "The people and brands you make things for.",
  ],
  suppliers: [
    "Your sourcing circle.",
    "A dependable address book for materials and mills.",
  ],
  invoices: [
    "Close the loop.",
    "Bill and deliver stock, record payments and track balances.",
  ],
  reports: [
    "Know how the studio is doing.",
    "Sales, inventory and production performance from your records.",
  ],
  activity: [
    "A record of the work.",
    "Who changed what, and when. Every important step is recorded.",
  ],
  settings: [
    "Make the workspace yours.",
    "Company details, team access and connected sales channels.",
  ],
};
const actions: Record<string, [string, string]> = {
  overview: ["New order", "order"],
  orders: ["New order", "order"],
  fabrics: ["Add fabric", "fabric"],
  purchases: ["New purchase", "purchase"],
  production: ["Assign work", "assign"],
  products: ["Bill & deliver", "invoice"],
  customers: ["Add customer", "customer"],
  suppliers: ["Add supplier", "supplier"],
  invoices: ["New invoice", "invoice"],
};
export function Workspace({ view, initial }: { view: string; initial: State }) {
  const router = useRouter();
  const pendingOperations = useRef(new Map<string, string>());
  const [state, setState] = useState(initial);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [editor, setEditor] = useState<EditRequest | null>(null);
  const [mobile, setMobile] = useState(false);
  const [toast, setToast] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected] = useState(true);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }
      if (!response.ok) throw new Error("Refresh failed");
      setState(await response.json());
      setConnected(true);
    } catch {
      setConnected(false);
    } finally {
      setRefreshing(false);
    }
  }, [router]);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, [refresh]);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(id);
    }
  }, [toast]);
  const edit = (type: string, data?: object) =>
    setEditor({ type, data: data ? { ...data } : undefined });
  async function mutate(action: string, input: Record<string, unknown>) {
    const key = JSON.stringify({ action, input });
    const operationId =
      pendingOperations.current.get(key) || crypto.randomUUID();
    pendingOperations.current.set(key, operationId);
    const res = await fetch(
      action === "shopify" ? "/api/shopify" : "/api/action",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, input, operationId }),
      },
    );
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Unable to save changes");
    pendingOperations.current.delete(key);
    if (result.state) setState(result.state);
    else await refresh();
    if (action === "changePassword") {
      router.replace("/login");
      router.refresh();
      return;
    }
    setToast(
      action === "shopify"
        ? "Shopify listing updated"
        : "Changes saved to your workspace",
    );
  }
  async function logout() {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    router.replace("/login");
    router.refresh();
  }
  const tailor = state.user.role === "tailor";
  const nav = navigation.filter(
    (n) => !tailor || ["production", "settings"].includes(n.id),
  );
  const total = state.jobs.reduce((s, j) => s + j.quantity, 0),
    finished = state.jobs.reduce((s, j) => s + j.finished, 0);
  const primary = !tailor ? actions[view] : undefined;
  const exportData = () => {
    const data: object[] =
      view === "fabrics"
        ? state.fabrics
        : view === "purchases"
          ? state.purchases
          : view === "products"
            ? state.products
            : view === "invoices"
              ? state.invoices
              : view === "activity"
                ? state.activities
                : ["customers", "suppliers"].includes(view)
                  ? state.contacts.filter(
                      (c) =>
                        c.type ===
                        (view === "customers" ? "customer" : "supplier"),
                    )
                  : view === "production"
                    ? state.jobs
                    : state.orders;
    if (!data.length) {
      setToast("There are no records to export yet");
      return;
    }
    const columns = Object.keys(data[0]).filter(
      (k) => !["plan", "lines"].includes(k),
    );
    downloadCSV(`carnot-${view}.csv`, [
      columns,
      ...data.map((row) =>
        columns.map((k) => (row as Record<string, unknown>)[k]),
      ),
    ]);
  };
  return (
    <div className="workspace">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {mobile && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="brand">
          <Link
            href={tailor ? "/production" : "/overview"}
            className="wordmark"
          >
            carnot<span>®</span>
          </Link>
          <span className="brand-caption">FABRIC TO FINISHED</span>
          <button
            className="icon-button mobile-only"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          >
            <X size={21} />
          </button>
        </div>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <div key={n.id}>
              {n.group && <span className="nav-group">{n.group}</span>}
              <Link
                href={`/${n.id}`}
                className={`nav-item ${view === n.id ? "active" : ""}`}
                aria-current={view === n.id ? "page" : undefined}
              >
                <n.icon size={18} strokeWidth={1.5} />
                {n.label}
                {n.id === "orders" && (
                  <span className="nav-count">
                    {
                      state.orders.filter(
                        (o) => !["ready", "cancelled"].includes(o.status),
                      ).length
                    }
                  </span>
                )}
              </Link>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="studio-pulse">
            <span className="eyebrow">ON THE PRODUCTION FLOOR</span>
            <p>
              {finished} <span>/ {total} pieces finished</span>
            </p>
            <Progress value={total ? (finished / total) * 100 : 0} />
          </div>
          <div className="profile">
            <span className="avatar">
              {state.user.name
                .split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <strong>{state.user.name}</strong>
              <small>
                {tailor ? "Tailoring partner" : "Studio administrator"}
              </small>
            </div>
            <button
              className="icon-button"
              onClick={logout}
              aria-label="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-only"
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
            >
              <Menu size={21} />
            </button>
            <span>{state.settings.companyName}</span>
            <span>/</span>
            <strong>{navigation.find((n) => n.id === view)?.label}</strong>
          </div>
          <div className="topbar-right">
            {state.demo && <span className="demo-label">SAMPLE WORKSPACE</span>}
            <span className="studio-status">
              <i />
              {connected ? "Studio connected" : "Connection interrupted"}
            </span>
            <button
              className="icon-button"
              aria-label="Refresh data"
              onClick={refresh}
            >
              <RefreshCw size={16} className={refreshing ? "spin" : ""} />
            </button>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {tailor
                  ? "YOUR TAILOR PORTAL"
                  : view === "overview"
                    ? "YOUR STUDIO, AT A GLANCE"
                    : navigation
                        .find((n) => n.id === view)
                        ?.label.toUpperCase()}
              </span>
              <h1>{headings[view][0]}</h1>
              <p>{headings[view][1]}</p>
            </div>
            <div className="heading-actions">
              {!["settings", "cutting", "reports", "overview"].includes(
                view,
              ) && (
                <button className="button secondary" onClick={exportData}>
                  <Download size={16} />
                  Export
                </button>
              )}
              {primary && (
                <button
                  className="button primary"
                  onClick={() => edit(primary[1])}
                >
                  <Plus size={17} />
                  {primary[0]}
                </button>
              )}
            </div>
          </div>
          {!["overview", "cutting", "settings", "reports"].includes(view) && (
            <div className="toolbar">
              <div className="search">
                <Search size={17} />
                <input
                  aria-label="Search records"
                  placeholder={`Search ${navigation.find((n) => n.id === view)?.label.toLowerCase()}…`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    className="icon-button"
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
              {["orders", "invoices", "production", "purchases"].includes(
                view,
              ) && (
                <select
                  aria-label="Filter by status"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">All statuses</option>
                  {(view === "orders"
                    ? [
                        "draft",
                        "planned",
                        "production",
                        "quality",
                        "ready",
                        "cancelled",
                      ]
                    : view === "invoices"
                      ? ["unpaid", "partial", "paid", "overdue"]
                      : view === "purchases"
                        ? ["ordered", "partial", "received"]
                        : [
                            "assigned",
                            "cutting",
                            "stitching",
                            "finishing",
                            "submitted",
                            "accepted",
                          ]
                  ).map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          {view === "cutting" ? (
            <CuttingRoom state={state} mutate={mutate} />
          ) : (
            <Views
              view={view}
              state={state}
              query={query}
              filter={filter}
              edit={edit}
              mutate={mutate}
            />
          )}
          <footer className="workspace-footer">
            <span>Considered materials. Exceptional making.</span>
            <span>
              Carnot Studio <ArrowUpRight size={13} />
            </span>
          </footer>
        </main>
      </div>
      {editor && (
        <Editor
          key={`${editor.type}-${editor.data?.id || "new"}`}
          request={editor}
          state={state}
          mutate={mutate}
          close={() => setEditor(null)}
        />
      )}
      <div className={`toast ${toast ? "visible" : ""}`} role="status">
        {toast && (
          <>
            <CircleCheck size={18} />
            {toast}
          </>
        )}
      </div>
    </div>
  );
}
