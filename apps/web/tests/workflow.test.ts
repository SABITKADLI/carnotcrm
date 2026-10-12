import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { all, base, db, get, put } from "../src/lib/db";
import { createUser } from "../src/lib/auth";
import { execute, state } from "../src/lib/service";
import { retireLegacyWorkflow } from "../src/lib/legacy-retirement";
import type { FabricOrder, FabricSpec, Invoice, Organization, User } from "../src/lib/types";

process.env.CRM_DATABASE_PATH = ":memory:";
let admin: User;
const run = <T = unknown>(action: string, input: Record<string, unknown>, user = admin, key = randomUUID()) =>
  execute(user, action, input, key) as T;
const partner = (name: string, role: "supplier" | "distributor" | "jobworker" | "transporter") =>
  run<Organization>("organization", { name, roles: [role] });
const spec = (supplierId: string) => put("fabricSpecs", {
  ...base("fs"), version: 1, name: "Oxford", rangeName: "Core", width: "58",
  folding: "Open", weave: "Plain", threadCount: "40s", construction: "120x80",
  content: "Cotton", supplierId,
} satisfies FabricSpec);
const po = (fabricSpecId: string, partyId: string) => run<FabricOrder>("fabricOrder", {
  fabricSpecId, orderDate: "2026-09-01", deliveryDate: "2026-09-15",
  fabricType: "Shirting", pricePerMetre: 120, quantityOrdered: 100,
  designs: "1", colors: "2", partyIds: [partyId], fabricFor: "Garment",
});
const bill = (customerId: string, kind: "fabric" | "product", itemId: string, quantity: number) =>
  run<Invoice>("invoice", { customerId, lines: [{ kind, itemId, quantity, price: 200 }],
    discount: 0, taxRate: 0, dueDate: "2026-10-01", notes: "" });

beforeEach(() => {
  db().exec("DELETE FROM sessions; DELETE FROM users; DELETE FROM entities; DELETE FROM settings; DELETE FROM operations; DELETE FROM login_attempts;");
  admin = createUser("Admin", "admin@test.example", "long-test-password", "admin");
});

test("billing uses the same Customer/Party organization as a fabric PO", () => {
  const mill = partner("Mill", "supplier");
  const customer = partner("Customer Party", "distributor");
  const order = po(spec(mill.id).id, customer.id);
  run("fabricReceipt", { fabricOrderId: order.id, receiptDate: "2026-09-10",
    quantityMetres: 60, warehouse: "Main warehouse" });
  const invoice = bill(customer.id, "fabric", order.id, 20);
  assert.equal(invoice.customerId, customer.id);
  assert.equal(invoice.customerName, customer.name);
  assert.match(invoice.lines[0].description, new RegExp(order.poNumber.replace("/", "\\/")));
  assert.equal(invoice.lines[0].quantity, 20);
  assert.equal(all("movements").find((item) => item.reference === invoice.number)?.fabricOrderId, order.id);
  assert.throws(() => bill(customer.id, "fabric", order.id, 41), /insufficient received fabric/);
  assert.equal(all("invoices").length, 1);
});

test("a new challan reuses or creates a linked driver and limits delivery access", () => {
  const mill = partner("Driver Mill", "supplier"), customer = partner("Driver Party", "distributor");
  const maker = partner("Driver Maker", "jobworker"), carrier = partner("Driver Carrier", "transporter");
  const order = po(spec(mill.id).id, customer.id);
  run("fabricReceipt", { fabricOrderId: order.id, receiptDate: "2026-09-10", quantityMetres: 100, warehouse: "Main" });
  const input = { fabricOrderId: order.id, partyId: customer.id, jobworkerId: maker.id,
    transporterId: carrier.id, fabricQuantity: 25, numberOfBales: 1,
    pickedBy: "Hari Driver", driverPhone: "9999999999", dcIssueDate: "2026-09-11" };
  const challan = run<{ id: string; driverPersonId: string; driverName: string }>("transport", input);
  const driver = get("people", challan.driverPersonId);
  assert.equal(driver.organizationId, carrier.id);
  assert.equal(driver.phone, "9999999999");
  assert.equal(all("transports")[0].pickedByPersonId, driver.id);
  assert.equal(challan.driverName, driver.name);
  run("transport", { ...input, fabricQuantity: 10 });
  assert.equal(all("people").filter((person) => person.name === driver.name).length, 1);
  const delivery = run<User>("user", { name: driver.name, email: "driver@test.example",
    password: "long-test-password", role: "delivery", partnerId: driver.id });
  assert.equal(state(delivery).challans.length, 2);
  assert.equal(state(delivery).invoices.length, 0);
  assert.throws(() => run("transport", { ...input, fabricQuantity: 66 }), /dispatch exceeds received fabric/);
});

test("PO to receipt to challan to production to inward to finished sale", () => {
  const mill = partner("Workflow Mill", "supplier"), customer = partner("Workflow Party", "distributor");
  const maker = partner("Workflow Maker", "jobworker"), carrier = partner("Workflow Carrier", "transporter");
  const order = po(spec(mill.id).id, customer.id);
  const brand = put("brands", { ...base("brand"), version: 1, name: "Carnot" });
  for (const [index, value] of ["Cutting Completed", "Goods Ready"].entries())
    put("referenceValues", { ...base("ref"), version: 1, category: "production_status",
      value, active: true, sortOrder: index });
  run("fabricReceipt", { fabricOrderId: order.id, receiptDate: "2026-09-10",
    quantityMetres: 100, warehouse: "Main", transporterId: carrier.id,
    partyId: customer.id, jobworkerId: maker.id, pickedBy: "Workflow Driver",
    dispatchDate: "2026-09-11", numberOfBales: 2 });
  const challan = all("challans")[0];
  assert.ok(challan.driverPersonId);
  for (const status of ["Picked Up", "Delivered", "Acknowledged"])
    run("challanStatus", { id: challan.id, status });
  const work = run<{ id: string }>("workOrder", { challanId: challan.id,
    brandId: brand.id, itemName: "Oxford shirt", bodyFabric: 100,
    trimFabric: 0, issuedDate: "2026-09-11" });
  const update = { id: work.id, approvedConsumption: 2, ratio: { M: 1 },
    cutting: { M: 50 }, cuttingDate: "2026-09-12" };
  run("productionUpdate", { ...update, status: "Cutting Completed" });
  run("productionUpdate", { ...update, status: "Goods Ready",
    actualGoodsReadyDate: "2026-09-20", fiDone: true });
  run("productionInward", { workOrderId: work.id, inwardDate: "2026-09-21",
    setwiseQuantity: 48, mixPiecesQuantity: 0, damagePiecesQuantity: 2 });
  assert.equal(get("workOrders", work.id).status, "Cleared");
  assert.equal(all("inwards")[0].totalInward, 50);
  const product = all("products").find((item) => item.orderId === work.id)!;
  assert.equal(product.stock, 48);
  const invoice = bill(customer.id, "product", product.id, 10);
  assert.equal(invoice.customerId, customer.id);
  assert.equal(get("products", product.id).stock, 38);
});

test("legacy garment actions and routes are retired", () => {
  for (const action of ["order", "plan", "assign", "progress", "quality", "purchase", "fabric", "contact"])
    assert.throws(() => run(action, {}), /older workflow has been retired/);
  assert.deepEqual(state(admin).orders, []);
  assert.deepEqual(state(admin).jobs, []);
});

test("legacy data is backed up, customers are linked, and old records are removed", async () => {
  const oldCustomer = put("contacts", { ...base("ct"), name: "Old Party", type: "customer",
    email: "", phone: "", address: "", taxId: "", notes: "" });
  put("orders", { ...base("ord"), number: "CO-1", name: "Old shirt", customerId: oldCustomer.id,
    fabricId: "", category: "Shirts", quantity: 1, sizes: "M", dueDate: "2026-10-01",
    priority: "Normal", notes: "", unitPrice: 0, laborCost: 0, status: "draft",
    issued: 0, accepted: 0, rejected: 0 });
  const result = await retireLegacyWorkflow();
  assert.equal(result.retired, true);
  assert.equal(all("contacts").length, 0);
  assert.equal(all("orders").length, 0);
  assert.equal(all("operationalBackups").length, 1);
  assert.ok(all("organizations").some((item) => item.name === "Old Party" && item.roles.includes("customer")));
  assert.equal((await retireLegacyWorkflow()).retired, false);
});
