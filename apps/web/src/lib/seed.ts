import { randomBytes } from "node:crypto";
import { all, base, db, put, saveSettings, transaction } from "./db";
import { createUser, users } from "./auth";
import { execute } from "./service";
import type { Contact, Fabric, Order, Purchase, User } from "./types";

export function seedDemo() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Demo seeding is disabled in production");
  if (users().length) return;
  const people = transaction(() => {
    const admin = createUser(
      "Aarav Mehta",
      "admin@carnot.demo",
      randomBytes(24).toString("hex"),
      "admin",
    );
    const tailor = createUser(
      "Meera Shah",
      "meera@carnot.demo",
      randomBytes(24).toString("hex"),
      "tailor",
    );
    const tailor2 = createUser(
      "Rafiq Ansari",
      "rafiq@carnot.demo",
      randomBytes(24).toString("hex"),
      "tailor",
    );
    saveSettings({
      companyName: "Carnot",
      email: "studio@carnot.example",
      phone: "+91 90000 00000",
      address: "Sample studio · Bengaluru, Karnataka",
      taxId: "",
      currency: "INR",
      taxRate: 0,
      invoicePrefix: "INV",
      paymentDetails: "Add your bank details in Settings.",
    });
    return { admin, tailor, tailor2 };
  });
  const act = (action: string, input: Record<string, unknown>) =>
    execute(people.admin, action, input, crypto.randomUUID());
  const contact = (
    type: string,
    name: string,
    email: string,
    address: string,
    notes: string,
  ) => act("contact", { type, name, email, address, notes }) as Contact;
  const c1 = contact(
    "customer",
    "The August Edit",
    "buying@august.example",
    "Indiranagar, Bengaluru",
    "Contemporary essentials. Prefers natural fibers and neutral tones.",
  );
  const c2 = contact(
    "customer",
    "Maison Mira",
    "orders@maisonmira.example",
    "Bandra, Mumbai",
    "Womenswear collection. Approve fit sample before production.",
  );
  const c3 = contact(
    "customer",
    "Fieldwork Supply",
    "studio@fieldwork.example",
    "Pune, Maharashtra",
    "Workwear and hospitality uniforms.",
  );
  const supplier = contact(
    "supplier",
    "Arvind Textile House",
    "sales@arvind.example",
    "Ahmedabad, Gujarat",
    "Cotton and twill. Standard lead time 7 days.",
  );
  const s2 = contact(
    "supplier",
    "Linen & Loom Co.",
    "hello@linenloom.example",
    "Erode, Tamil Nadu",
    "Linen and blends. Request dye-lot samples.",
  );
  const fabrics = [
    [
      "European linen",
      "LIN-OAT-01",
      "100% linen",
      "Oat",
      1500,
      180,
      "LN-2409",
      "A / 01",
      620,
      150,
      420,
      680,
    ],
    [
      "Cotton poplin",
      "COT-INK-02",
      "100% cotton",
      "Ink blue",
      1450,
      120,
      "CP-2411",
      "A / 02",
      880,
      200,
      180,
      310,
    ],
    [
      "Organic cotton twill",
      "TWL-OLV-03",
      "98% cotton · 2% elastane",
      "Olive",
      1500,
      240,
      "TW-2415",
      "B / 01",
      340,
      100,
      260,
      440,
    ],
    [
      "Viscose crepe",
      "VIS-CLY-04",
      "100% viscose",
      "Clay",
      1400,
      150,
      "VC-2403",
      "B / 02",
      78,
      100,
      220,
      360,
    ],
    [
      "Cotton dobby",
      "DOB-CHR-05",
      "100% cotton",
      "Chalk",
      1500,
      160,
      "DB-2407",
      "C / 01",
      210,
      80,
      240,
      390,
    ],
  ].map(
    ([
      name,
      sku,
      composition,
      color,
      width,
      gsm,
      lot,
      location,
      stock,
      reorder,
      cost,
      price,
    ]) =>
      act("fabric", {
        name,
        sku,
        composition,
        color,
        width,
        gsm,
        lot,
        location,
        stock,
        reorder,
        cost,
        price,
      }) as Fabric,
  );
  const due = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const createOrder = (
    name: string,
    client: Contact,
    fabric: Fabric,
    category: string,
    quantity: number,
    offset: number,
    priority = "Normal",
  ) =>
    act("order", {
      name,
      customerId: client.id,
      fabricId: fabric.id,
      category,
      quantity,
      sizes: "S 20% · M 40% · L 30% · XL 10%",
      dueDate: due(offset),
      priority,
      notes:
        "Approve sample before bulk cutting. Maintain grain direction. 12 mm seam allowance included in supplied dimensions. French seams; matching thread; wash and press before QC.",
      unitPrice: 1890,
      laborCost: 260,
    }) as Order;
  const pieces = [
    { name: "Front panel", width: 520, length: 780, count: 2, rotate: false },
    { name: "Back panel", width: 560, length: 800, count: 1, rotate: false },
    { name: "Sleeve", width: 340, length: 620, count: 2, rotate: false },
    { name: "Collar & cuff", width: 200, length: 400, count: 2, rotate: true },
  ];
  const production = (order: Order, tailor: User, progress: number) => {
    act("plan", { id: order.id, pieces, allowance: 10, shrinkage: 2, gap: 3 });
    const job = act("assign", {
      orderId: order.id,
      tailorId: tailor.id,
      quantity: order.quantity,
      dueDate: order.dueDate,
      notes: "Use approved sample and cutting estimate.",
    }) as { id: string };
    if (progress)
      act("progress", {
        id: job.id,
        cut: order.quantity,
        sewn: progress,
        finished: progress,
        notes: "First fit approved. Production progressing to schedule.",
      });
  };
  const o1 = createOrder(
    "The everyday linen shirt",
    c1,
    fabrics[0],
    "Shirts",
    80,
    6,
    "High",
  );
  production(o1, people.tailor, 48);
  const o2 = createOrder(
    "Relaxed poplin co-ord",
    c2,
    fabrics[1],
    "Womenswear",
    60,
    9,
  );
  production(o2, people.tailor2, 24);
  createOrder("Utility twill trousers", c3, fabrics[2], "Trousers", 120, 14);
  createOrder("The studio wrap dress", c2, fabrics[3], "Dresses", 24, 18);
  const o5 = createOrder("Dobby resort shirt", c1, fabrics[4], "Shirts", 30, 3);
  production(o5, people.tailor, 30);
  const o6 = createOrder(
    "Linen capsule · first edition",
    c1,
    fabrics[0],
    "Shirts",
    40,
    -2,
  );
  production(o6, people.tailor2, 40);
  act("quality", {
    id: o6.id,
    accepted: 38,
    notes:
      "38 passed measurement and seam checks; 2 rejected for fabric defects.",
  });
  act("purchase", {
    supplierId: s2.id,
    fabricId: fabrics[3].id,
    quantity: 400,
    unitCost: 210,
    dueDate: due(3),
    notes: "Match existing clay dye lot.",
  });
  const po = act("purchase", {
    supplierId: supplier.id,
    fabricId: fabrics[1].id,
    quantity: 500,
    unitCost: 175,
    dueDate: due(5),
    notes: "Split delivery accepted.",
  }) as Purchase;
  act("receive", { id: po.id, quantity: 200 });
  const invoice = act("invoice", {
    customerId: c3.id,
    lines: [
      { kind: "fabric", itemId: fabrics[2].id, quantity: 65, price: 440 },
    ],
    discount: 0,
    taxRate: 0,
    dueDate: due(7),
    notes: "65 m fabric dispatched. Sample invoice, no configured tax.",
  }) as { id: string };
  act("payment", {
    invoiceId: invoice.id,
    amount: 15000,
    method: "Bank transfer",
    reference: "DEMO-TRANSFER-001",
    date: due(0),
  });
  const finished = all("products")[0];
  act("invoice", {
    customerId: c1.id,
    lines: [
      { kind: "product", itemId: finished.id, quantity: 12, price: 1890 },
    ],
    discount: 500,
    taxRate: 0,
    dueDate: due(-1),
    notes: "Capsule collection delivery.",
  });
  put("activities", {
    ...base("evt"),
    actor: "Carnot",
    action: "Sample workspace ready",
    subject: "Demo data",
    detail: "These are fictional records for exploring the workflow.",
  });
}

export function hasUsers() {
  return Number(db().prepare("SELECT COUNT(*) AS n FROM users").get()?.n) > 0;
}
