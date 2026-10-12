import { gzipSync } from "node:zlib";
import { all, base, clearKind, put, transaction } from "./db";
import type { Organization, OrganizationRole } from "./types";

const normalized = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** One-time, backed-up retirement of the disconnected garment-order and stock lists. */
export async function retireLegacyWorkflow() {
  return transaction(() => {
    const legacy = {
      contacts: all("contacts"),
      fabrics: all("fabrics"),
      purchases: all("purchases"),
      orders: all("orders"),
      jobs: all("jobs"),
    };
    const counts = Object.fromEntries(Object.entries(legacy).map(([kind, rows]) => [kind, rows.length]));
    if (!Object.values(counts).some(Boolean)) return { retired: false, counts };
    const backup = put("operationalBackups", {
      ...base("backup"),
      label: "Retired legacy garment workflow",
      createdBy: "system-migration",
      counts,
      payload: gzipSync(JSON.stringify(legacy)).toString("base64"),
    });
    const organizations = all("organizations");
    const contactToOrganization = new Map<string, string>();
    for (const contact of legacy.contacts) {
      const role: OrganizationRole = contact.type === "customer" ? "customer" : "supplier";
      const existing = organizations.find((item) => !item.archived && (
        (contact.taxId && item.taxId && normalized(item.taxId) === normalized(contact.taxId)) ||
        normalized(item.name) === normalized(contact.name)
      ));
      const organization: Organization = existing
        ? put("organizations", {
            ...existing,
            roles: existing.roles.includes(role) ? existing.roles : [...existing.roles, role],
            email: existing.email || contact.email,
            phone: existing.phone || contact.phone,
            address: existing.address || contact.address,
            taxId: existing.taxId || contact.taxId,
            version: existing.version + 1,
          })
        : put("organizations", {
            ...base("org"),
            version: 1,
            name: contact.name,
            roles: [role],
            email: contact.email,
            phone: contact.phone,
            address: contact.address,
            taxId: contact.taxId,
            notes: contact.notes,
          });
      if (!existing) organizations.push(organization);
      contactToOrganization.set(contact.id, organization.id);
    }
    for (const invoice of all("invoices")) {
      const organizationId = contactToOrganization.get(invoice.customerId);
      if (organizationId) put("invoices", { ...invoice, customerId: organizationId });
    }
    const oldOrderIds = new Set(legacy.orders.map((order) => order.id));
    for (const product of all("products"))
      if (oldOrderIds.has(product.orderId)) put("products", { ...product, orderId: "" });
    clearKind("contacts");
    clearKind("fabrics");
    clearKind("purchases");
    clearKind("orders");
    clearKind("jobs");
    return { retired: true, backupId: backup.id, counts };
  });
}
