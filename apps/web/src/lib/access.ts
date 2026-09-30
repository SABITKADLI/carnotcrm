import type { Role } from "./types";

export const VISIBLE_APP_VIEWS = [
  "overview",
  "master-data",
  "fabric-orders",
  "transport-dc",
  "production",
  "cleared-lots",
  "workbook-sync",
  "cutting",
  "products",
  "customers",
  "suppliers",
  "invoices",
  "reports",
  "activity",
  "settings",
] as const;

export const VALID_APP_VIEWS = [
  ...VISIBLE_APP_VIEWS,
  // Preserved compatibility routes. They are deliberately absent from the menu.
  "orders",
  "garment-production",
  "fabrics",
  "purchases",
] as const;

export type AppView = (typeof VALID_APP_VIEWS)[number];
export type VisibleAppView = (typeof VISIBLE_APP_VIEWS)[number];

export const LOGIN_ROLES = [
  "admin",
  "supplier",
  "agent",
  "transporter",
  "delivery",
  "jobworker",
  "distributor",
  "tailor",
] as const satisfies readonly Role[];

export const PARTNER_VIEW_ACCESS: Record<Exclude<Role, "admin">, readonly VisibleAppView[]> = {
  supplier: ["fabric-orders", "transport-dc", "settings"],
  agent: ["fabric-orders", "settings"],
  transporter: ["transport-dc", "settings"],
  delivery: ["transport-dc", "settings"],
  jobworker: ["transport-dc", "production", "cleared-lots", "settings"],
  tailor: ["transport-dc", "production", "cleared-lots", "settings"],
  distributor: ["fabric-orders", "transport-dc", "settings"],
};

export function viewsForRole(role: Role): readonly VisibleAppView[] {
  return role === "admin" ? VISIBLE_APP_VIEWS : PARTNER_VIEW_ACCESS[role];
}

export function canAccessView(role: Role, view: string) {
  return role === "admin" || viewsForRole(role).includes(view as VisibleAppView);
}

export function homeForRole(role: Role) {
  const home: Record<Role, VisibleAppView> = {
    admin: "overview",
    supplier: "fabric-orders",
    agent: "fabric-orders",
    transporter: "transport-dc",
    delivery: "transport-dc",
    jobworker: "production",
    tailor: "production",
    distributor: "fabric-orders",
  };
  return home[role];
}
