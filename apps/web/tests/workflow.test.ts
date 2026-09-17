import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { all, db, get, put, settings } from "../src/lib/db";
import { createUser, login, sessionUser, startSession } from "../src/lib/auth";
import { execute, state } from "../src/lib/service";
import { createPlan } from "../src/lib/cutting";
import { processPaidWebhook, sendToShopify } from "../src/lib/shopify";
import type {
  Contact,
  Fabric,
  Invoice,
  Job,
  Order,
  Product,
  Purchase,
  User,
} from "../src/lib/types";

process.env.CRM_DATABASE_PATH = ":memory:";
let admin: User,
  tailor: User,
  other: User,
  client: Contact,
  supplier: Contact,
  fabric: Fabric;
const dueDate = "2027-01-01";
function run<T = unknown>(
  action: string,
  input: Record<string, unknown>,
  user = admin,
  key = randomUUID(),
) {
  return execute(user, action, input, key) as T;
}
function order(quantity = 10) {
  return run<Order>("order", {
    name: "Linen shirt",
    customerId: client.id,
    fabricId: fabric.id,
    category: "Shirts",
    quantity,
    sizes: "M",
    dueDate,
    priority: "Normal",
    notes: "French seams",
    unitPrice: 500,
    laborCost: 50,
  });
}
function plan(o: Order) {
  run("plan", {
    id: o.id,
    pieces: [
      { name: "Panel", width: 1000, length: 1000, count: 1, rotate: false },
    ],
    allowance: 0,
    shrinkage: 0,
    gap: 0,
  });
  return get("orders", o.id);
}
function assign(o: Order, quantity = o.quantity, person = tailor) {
  return run<Job>("assign", {
    orderId: o.id,
    tailorId: person.id,
    quantity,
    dueDate,
    notes: "",
  });
}
function complete(o: Order, accepted = o.quantity) {
  const j = assign(plan(o));
  run(
    "progress",
    {
      id: j.id,
      cut: j.quantity,
      sewn: j.quantity,
      finished: j.quantity,
      notes: "Done",
    },
    tailor,
  );
  run("quality", { id: o.id, accepted, notes: "Checked" });
  return all("products").find((p) => p.orderId === o.id)!;
}
function bill(
  item: Fabric | Product,
  kind: "fabric" | "product",
  quantity: number,
  overrides = {},
) {
  return run<Invoice>("invoice", {
    customerId: client.id,
    lines: [{ kind, itemId: item.id, quantity, price: 500 }],
    discount: 0,
    taxRate: 10,
    dueDate,
    notes: "",
    ...overrides,
  });
}
beforeEach(() => {
  db().exec(
    "DELETE FROM sessions; DELETE FROM users; DELETE FROM entities; DELETE FROM settings; DELETE FROM operations; DELETE FROM login_attempts;",
  );
  admin = createUser(
    "Admin",
    "admin@test.example",
    "long-test-password",
    "admin",
  );
  tailor = createUser(
    "Tailor",
    "tailor@test.example",
    "long-test-password",
    "tailor",
  );
  other = createUser(
    "Other",
    "other@test.example",
    "long-test-password",
    "tailor",
  );
  client = run<Contact>("contact", {
    type: "customer",
    name: "Client",
    email: "client@example.com",
  });
  supplier = run<Contact>("contact", { type: "supplier", name: "Mill" });
  fabric = run<Fabric>("fabric", {
    name: "Linen",
    sku: "LIN-01",
    composition: "Linen",
    color: "Oat",
    width: 1000,
    gsm: 180,
    stock: 100,
    reorder: 10,
    cost: 100,
    price: 200,
  });
});

test("partial purchasing receipt changes stock exactly once on retry", () => {
  const po = run<Purchase>("purchase", {
    supplierId: supplier.id,
    fabricId: fabric.id,
    quantity: 50,
    unitCost: 200,
    dueDate,
  });
  const input = { id: po.id, quantity: 20 },
    key = randomUUID();
  run("receive", input, admin, key);
  run("receive", input, admin, key);
  assert.equal(get("fabrics", fabric.id).stock, 120000);
  assert.equal(get("purchases", po.id).received, 20000);
  assert.equal(get("purchases", po.id).status, "partial");
  assert.throws(() => run("receive", { id: po.id, quantity: 31 }), /exceeds/);
  assert.equal(get("fabrics", fabric.id).stock, 120000);
});
test("reserved fabric cannot be sold and cancellation releases it", () => {
  const o = plan(order(95));
  assert.equal(get("fabrics", fabric.id).reserved, 95000);
  assert.throws(() => bill(fabric, "fabric", 6), /insufficient/);
  assert.equal(all("invoices").length, 0);
  run("cancelOrder", { id: o.id, reason: "Customer cancelled" });
  assert.equal(get("fabrics", fabric.id).reserved, 0);
  assert.equal(get("orders", o.id).status, "cancelled");
});
test("competing reservations cannot overbook the remaining material", () => {
  plan(order(60));
  const next = order(50);
  assert.throws(() => plan(next), /Insufficient fabric/);
  assert.equal(get("fabrics", fabric.id).reserved, 60000);
  assert.equal(get("orders", next.id).status, "draft");
});
test("cutting enforces grain direction, physical dimensions and shrinkage", () => {
  assert.throws(
    () =>
      createPlan(
        1000,
        1,
        [{ name: "Wide", width: 1100, length: 500, count: 1, rotate: false }],
        0,
      ),
    /does not fit/,
  );
  const rotated = createPlan(
    1000,
    1,
    [{ name: "Wide", width: 1100, length: 500, count: 1, rotate: true }],
    0,
  );
  assert.equal(rotated.placements[0].rotated, true);
  const shrink = createPlan(
    2000,
    1,
    [{ name: "Panel", width: 1000, length: 1000, count: 1, rotate: false }],
    0,
    20,
    0,
  );
  assert.equal(shrink.placements[0].width, 1250);
  assert.equal(shrink.length, 1250);
  assert.throws(
    () =>
      createPlan(1500, 5000, [
        { name: "Panel", width: 100, length: 100, count: 100, rotate: true },
      ]),
    /20,000/,
  );
});
test("marker rectangles stay within roll bounds and never overlap", () => {
  const p = createPlan(1500, 8, [
    { name: "A", width: 520, length: 780, count: 2, rotate: false },
    { name: "B", width: 250, length: 480, count: 2, rotate: true },
  ]);
  for (const a of p.placements) {
    assert.ok(a.x >= p.allowance && a.x + a.width <= p.width - p.allowance);
    assert.ok(a.y + a.length <= p.length);
  }
  for (let i = 0; i < p.placements.length; i++)
    for (let j = i + 1; j < p.placements.length; j++) {
      const a = p.placements[i],
        b = p.placements[j];
      assert.ok(
        a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.length <= b.y ||
          b.y + b.length <= a.y,
      );
    }
});
test("split assignments issue fabric once and forbid over-allocation", () => {
  const o = plan(order());
  assign(o, 6);
  assign(o, 4, other);
  assert.equal(get("fabrics", fabric.id).stock, 90000);
  assert.equal(get("fabrics", fabric.id).reserved, 0);
  assert.equal(
    all("movements").filter((m) => m.type === "Production issue").length,
    1,
  );
  assert.throws(() => assign(o, 1), /exceed/);
  assert.throws(
    () => run("cancelOrder", { id: o.id, reason: "Late cancellation" }),
    /cannot be cancelled/,
  );
});
test("tailor can only read and update own jobs and cannot perform admin operations", () => {
  const o = plan(order()),
    own = assign(o, 5),
    foreign = assign(o, 5, other);
  const visible = state(tailor);
  assert.equal(visible.jobs.length, 1);
  assert.equal(visible.jobs[0].id, own.id);
  assert.equal(visible.fabrics.length, 0);
  assert.equal(visible.orders[0].unitPrice, 0);
  assert.equal(visible.orders[0].issuedCost, 0);
  assert.throws(
    () =>
      run("progress", { id: foreign.id, cut: 1, sewn: 0, finished: 0 }, tailor),
    /own assignments/,
  );
  assert.throws(() => run("invoice", {}, tailor), /Administrator/);
});
test("production counts are cumulative, bounded and ordered", () => {
  const j = assign(plan(order()));
  run("progress", { id: j.id, cut: 5, sewn: 4, finished: 2 }, tailor);
  assert.throws(() =>
    run("progress", { id: j.id, cut: 4, sewn: 4, finished: 2 }, tailor),
  );
  assert.throws(() =>
    run("progress", { id: j.id, cut: 10, sewn: 7, finished: 8 }, tailor),
  );
  assert.throws(() =>
    run("progress", { id: j.id, cut: 11, sewn: 7, finished: 7 }, tailor),
  );
  assert.equal(get("jobs", j.id).finished, 2);
});
test("QC adds only accepted stock once and preserves material issue cost", () => {
  const o = plan(order()),
    j = assign(o);
  assert.throws(
    () => run("quality", { id: o.id, accepted: 8, notes: "Check" }),
    /submitted/,
  );
  const po = run<Purchase>("purchase", {
    supplierId: supplier.id,
    fabricId: fabric.id,
    quantity: 100,
    unitCost: 300,
    dueDate,
  });
  run("receive", { id: po.id, quantity: 100 });
  run("progress", { id: j.id, cut: 10, sewn: 10, finished: 10 }, tailor);
  const key = randomUUID(),
    input = { id: o.id, accepted: 8, notes: "Two fabric defects" };
  run("quality", input, admin, key);
  run("quality", input, admin, key);
  const p = all("products")[0];
  assert.equal(p.stock, 8);
  assert.equal(p.cost, 18750);
  assert.equal(get("orders", o.id).rejected, 2);
  assert.throws(() => run("quality", input), /submitted/);
  assert.equal(all("products").length, 1);
});
test("invalid invoices roll back stock and invoice retry is idempotent", () => {
  assert.throws(
    () => bill(fabric, "fabric", 10, { discount: 999999 }),
    /Discount/,
  );
  assert.equal(get("fabrics", fabric.id).stock, 100000);
  const input = {
    customerId: client.id,
    lines: [{ kind: "fabric", itemId: fabric.id, quantity: 2.5, price: 200 }],
    discount: 0,
    taxRate: 10,
    dueDate,
  };
  const key = randomUUID();
  const inv = run<Invoice>("invoice", input, admin, key);
  run("invoice", input, admin, key);
  assert.equal(all("invoices").length, 1);
  assert.equal(get("fabrics", fabric.id).stock, 97500);
  assert.equal(inv.total, 55000);
  put("fabrics", { ...get("fabrics", fabric.id), price: 99999 });
  assert.equal(get("invoices", inv.id).lines[0].price, 20000);
});
test("partial payment, full payment and overpayment safeguards", () => {
  const inv = bill(fabric, "fabric", 1);
  const input = {
      invoiceId: inv.id,
      amount: 200,
      method: "UPI",
      reference: "PAY-1",
      date: "2026-09-17",
    },
    key = randomUUID();
  run("payment", input, admin, key);
  run("payment", input, admin, key);
  assert.equal(get("invoices", inv.id).paid, 20000);
  assert.throws(() => run("payment", { ...input, amount: 351 }), /outstanding/);
  run("payment", { ...input, amount: 350, reference: "PAY-2" });
  assert.equal(get("invoices", inv.id).status, "paid");
});
test("Shopify allocated units cannot be sold directly", () => {
  const p = complete(order());
  put("products", { ...p, channelStock: 8 });
  assert.throws(() => bill(p, "product", 3), /Shopify allocation/);
  bill(p, "product", 2);
  assert.equal(get("products", p.id).stock, 8);
});
test("authentication invalidation, brute-force limits and secret-free operation storage", () => {
  const token = login("TAILOR@test.example", "long-test-password");
  assert.equal(sessionUser(token)?.id, tailor.id);
  run("userStatus", { id: tailor.id, active: false });
  assert.equal(sessionUser(token), null);
  for (let i = 0; i < 8; i++)
    assert.throws(() => login("admin@test.example", "wrong"), /incorrect/);
  assert.throws(
    () => login("admin@test.example", "long-test-password"),
    /Too many/,
  );
  const password = "another-long-test-password";
  run("user", {
    name: "New",
    email: "new@test.example",
    role: "tailor",
    password,
  });
  assert.ok(
    !JSON.stringify(db().prepare("SELECT * FROM operations").all()).includes(
      password,
    ),
  );
  assert.equal(sessionUser(startSession(admin.id))?.id, admin.id);
});
test("currency cannot relabel existing monetary records and operation keys cannot be reused", () => {
  assert.throws(
    () => run("settings", { ...settings(), currency: "USD" }),
    /Currency cannot/,
  );
  const key = randomUUID();
  run("contact", { name: "A", type: "customer" }, admin, key);
  assert.throws(
    () => run("contact", { name: "B", type: "customer" }, admin, key),
    /different request/,
  );
});
test("paid webhook authenticates, retains large IDs and deduplicates an order", () => {
  const p = complete(order());
  const variant = "9876543210987654321";
  put("products", {
    ...p,
    channelStock: 6,
    variantId: `gid://shopify/ProductVariant/${variant}`,
  });
  process.env.SHOPIFY_WEBHOOK_SECRET = "test-secret";
  process.env.SHOPIFY_SHOP = "test.myshopify.com";
  const raw = Buffer.from(
    `{"admin_graphql_api_id":"gid://shopify/Order/123","name":"#1001","currency":"INR","line_items":[{"variant_id":${variant},"quantity":2,"price":"500.00"}]}`,
  );
  const headers = new Headers({
    "x-shopify-hmac-sha256": createHmac("sha256", "test-secret")
      .update(raw)
      .digest("base64"),
    "x-shopify-shop-domain": "test.myshopify.com",
    "x-shopify-topic": "orders/paid",
  });
  processPaidWebhook(raw, headers);
  processPaidWebhook(raw, headers);
  assert.equal(get("products", p.id).stock, 8);
  assert.equal(get("products", p.id).channelStock, 4);
  assert.equal(
    all("movements").filter((m) => m.type === "Shopify sale").length,
    1,
  );
  headers.set("x-shopify-hmac-sha256", "bad");
  assert.throws(() => processPaidWebhook(raw, headers), /signature/);
});
test("Shopify partial failure preserves remote IDs and resumes without duplicate product creation", async () => {
  const p = complete(order());
  process.env.SHOPIFY_SHOP = "test.myshopify.com";
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = "test-token";
  const original = global.fetch;
  let creates = 0,
    fail = true;
  global.fetch = async (_url, options) => {
    const { query } = JSON.parse(String(options?.body));
    let data;
    if (query.includes("StoreCurrency"))
      data = { shop: { currencyCode: "INR" } };
    else if (query.includes("FindProduct"))
      data = { productByIdentifier: null };
    else if (query.includes("CreateProduct")) {
      creates++;
      data = {
        productCreate: {
          product: {
            id: "gid://shopify/Product/1",
            variants: {
              nodes: [
                {
                  id: "gid://shopify/ProductVariant/2",
                  inventoryItem: { id: "gid://shopify/InventoryItem/3" },
                },
              ],
            },
          },
          userErrors: [],
        },
      };
    } else {
      if (fail) return new Response("", { status: 503 });
      data = { productVariantsBulkUpdate: { userErrors: [] } };
    }
    return Response.json({ data });
  };
  try {
    await assert.rejects(sendToShopify(admin, p.id, false, 0), /503/);
    assert.equal(get("products", p.id).shopifyId, "gid://shopify/Product/1");
    fail = false;
    await sendToShopify(admin, p.id, false, 0);
    assert.equal(creates, 1);
    assert.equal(get("products", p.id).shopifyStatus, "draft");
  } finally {
    global.fetch = original;
  }
});

test("a depleted Shopify allocation is not reserved again on publication retry", async () => {
  const p = complete(order());
  put("products", {
    ...p,
    stock: 5,
    channelStock: 0,
    shopifyId: "gid://shopify/Product/1",
    variantId: "gid://shopify/ProductVariant/2",
    inventoryItemId: "gid://shopify/InventoryItem/3",
    allocationKey: "original-allocation",
    inventorySynced: true,
    shopifyStatus: "error",
  });
  process.env.SHOPIFY_SHOP = "test.myshopify.com";
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = "test-token";
  process.env.SHOPIFY_PUBLICATION_ID = "gid://shopify/Publication/4";
  process.env.SHOPIFY_LOCATION_ID = "gid://shopify/Location/5";
  const original = global.fetch;
  global.fetch = async (_url, options) => {
    const { query } = JSON.parse(String(options?.body));
    assert.ok(!query.includes("SetInventory"));
    return Response.json({
      data: query.includes("StoreCurrency")
        ? { shop: { currencyCode: "INR" } }
        : { mutation: { userErrors: [] } },
    });
  };
  try {
    await sendToShopify(admin, p.id, true, 5);
    const updated = get("products", p.id);
    assert.equal(updated.channelStock, 0);
    assert.equal(updated.allocationKey, "original-allocation");
    assert.equal(updated.shopifyStatus, "published");
  } finally {
    global.fetch = original;
  }
});
