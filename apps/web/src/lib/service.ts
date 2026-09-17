import { z } from "zod";
import { createHash } from "node:crypto";
import {
  all,
  base,
  db,
  get,
  put,
  saveSettings,
  sequence,
  settings,
  transaction,
} from "./db";
import { createUser, isDemo, resetPassword, users } from "./auth";
import { createPlan } from "./cutting";
import type {
  Contact,
  Fabric,
  Invoice,
  InvoiceLine,
  Job,
  Order,
  Piece,
  State,
  User,
} from "./types";

export type Input = Record<string, unknown>;
const str = (v: unknown, max = 500) =>
  z.string().trim().min(1).max(max).parse(v);
const optional = (v: unknown, max = 3000) =>
  z
    .string()
    .trim()
    .max(max)
    .parse(v ?? "");
const num = (v: unknown, min = 0, max = 1e9) =>
  z.coerce.number().finite().min(min).max(max).parse(v);
const integer = (v: unknown, min = 0, max = 1e9) =>
  z.coerce.number().int().min(min).max(max).parse(v);
const date = (v: unknown) => z.iso.date().parse(v);
const cents = (v: unknown) => Math.round(num(v, 0, 1e7) * 100);
const mm = (v: unknown) => Math.round(num(v, 0.001, 1e6) * 1000);
const requireAdmin = (user: User) => {
  if (user.role !== "admin") throw new Error("Administrator access required");
};
export function audit(
  user: User,
  action: string,
  subject: string,
  detail = "",
) {
  put("activities", {
    ...base("evt"),
    actor: user.name,
    action,
    subject,
    detail,
  });
}
function movement(
  user: User,
  type: string,
  reference: string,
  quantity: number,
  ids: { fabricId?: string; productId?: string },
  note = "",
) {
  put("movements", {
    ...base("mov"),
    ...ids,
    quantity,
    type,
    reference,
    actor: user.name,
    note,
  });
}
function customer(id: unknown) {
  const contact = get("contacts", str(id));
  if (contact.type !== "customer") throw new Error("Select a customer");
  return contact;
}
export function state(user: User): State {
  const config = settings();
  const jobs = all("jobs").filter(
    (j) => user.role === "admin" || j.tailorId === user.id,
  );
  const orders = all("orders").filter(
    (o) => user.role === "admin" || jobs.some((j) => j.orderId === o.id),
  );
  if (user.role === "tailor") {
    return {
      user,
      users: [user],
      jobs,
      orders: orders.map((o) => ({
        ...o,
        customerId: "",
        unitPrice: 0,
        laborCost: 0,
        issuedCost: 0,
      })),
      contacts: [],
      fabrics: [],
      purchases: [],
      products: [],
      invoices: [],
      payments: [],
      movements: [],
      activities: [],
      settings: { ...config, address: "", taxId: "", paymentDetails: "" },
      shopify: {
        configured: false,
        domain: "",
        publication: false,
        inventory: false,
      },
      demo: isDemo(),
    };
  }
  return {
    user,
    users: users(),
    contacts: all("contacts"),
    fabrics: all("fabrics"),
    purchases: all("purchases"),
    orders,
    jobs,
    products: all("products"),
    invoices: all("invoices"),
    payments: all("payments"),
    movements: all("movements"),
    activities: all("activities").slice(0, 200),
    settings: config,
    shopify: {
      configured: !!(
        process.env.SHOPIFY_SHOP && process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
      ),
      domain: process.env.SHOPIFY_SHOP || "",
      publication: !!process.env.SHOPIFY_PUBLICATION_ID,
      inventory: !!process.env.SHOPIFY_LOCATION_ID,
    },
    demo: isDemo(),
  };
}

/** Idempotency and all stock/accounting changes share the same write transaction. */
export function execute(
  user: User,
  action: string,
  input: Input,
  operationId: string,
) {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(operationId))
    throw new Error("A valid operation ID is required");
  return transaction(() => {
    const payload = createHash("sha256")
      .update(JSON.stringify({ action, input }))
      .digest("hex");
    const previous = db()
      .prepare("SELECT actor,payload,result FROM operations WHERE id=?")
      .get(operationId);
    if (previous) {
      if (previous.actor !== user.id || previous.payload !== payload)
        throw new Error("Operation ID already used for a different request");
      return JSON.parse(String(previous.result));
    }
    const result = perform(user, action, input);
    db()
      .prepare(
        "INSERT INTO operations(id,actor,payload,result,created) VALUES(?,?,?,?,?)",
      )
      .run(
        operationId,
        user.id,
        payload,
        JSON.stringify(result ?? null),
        Date.now(),
      );
    return result;
  });
}
function perform(user: User, action: string, input: Input): unknown {
  if (action === "progress") {
    const job = get("jobs", str(input.id));
    if (user.role !== "admin" && job.tailorId !== user.id)
      throw new Error("You can only update your own assignments");
    if (job.status === "accepted")
      throw new Error("This job is already closed");
    const cut = integer(input.cut, job.cut, job.quantity);
    const sewn = integer(input.sewn, job.sewn, cut);
    const finished = integer(input.finished, job.finished, sewn);
    const updated = put("jobs", {
      ...job,
      cut,
      sewn,
      finished,
      notes: optional(input.notes),
      status:
        finished === job.quantity
          ? "submitted"
          : finished > 0
            ? "finishing"
            : sewn > 0
              ? "stitching"
              : cut > 0
                ? "cutting"
                : "assigned",
    });
    const order = get("orders", job.orderId);
    const jobs = all("jobs").filter((j) => j.orderId === order.id);
    if (jobs.reduce((sum, j) => sum + j.finished, 0) === order.quantity)
      put("orders", { ...order, status: "quality" });
    audit(
      user,
      "Updated production",
      order.number,
      `${cut} cut · ${sewn} stitched · ${finished} finished. ${updated.notes}`,
    );
    return updated;
  }
  if (action === "changePassword") {
    resetPassword(user.id, str(input.password, 128));
    audit(user, "Changed password", user.name);
    return { success: true };
  }
  requireAdmin(user);
  switch (action) {
    case "contact": {
      const type = z.enum(["customer", "supplier"]).parse(input.type);
      const existing = input.id ? get("contacts", str(input.id)) : base("ct");
      const contact: Contact = {
        ...existing,
        name: str(input.name, 120),
        email: optional(input.email, 254),
        phone: optional(input.phone, 50),
        address: optional(input.address),
        taxId: optional(input.taxId, 80),
        notes: optional(input.notes),
        type,
      };
      if (contact.email) z.email().parse(contact.email);
      put("contacts", contact);
      audit(user, "Saved " + type, contact.name);
      return contact;
    }
    case "fabric": {
      const sku = str(input.sku, 80);
      if (all("fabrics").some((f) => f.sku.toLowerCase() === sku.toLowerCase()))
        throw new Error("This fabric SKU already exists");
      const stock = input.stock ? mm(input.stock) : 0;
      const fabric: Fabric = {
        ...base("fab"),
        name: str(input.name, 120),
        sku,
        composition: optional(input.composition, 150),
        color: str(input.color, 80),
        width: integer(input.width, 100, 5000),
        gsm: num(input.gsm, 1, 1500),
        lot: optional(input.lot, 80),
        location: optional(input.location, 80),
        stock,
        reserved: 0,
        reorder: Math.round(num(input.reorder) * 1000),
        cost: cents(input.cost),
        price: cents(input.price),
      };
      put("fabrics", fabric);
      if (stock)
        movement(user, "Opening stock", fabric.sku, stock, {
          fabricId: fabric.id,
        });
      audit(user, "Added fabric", fabric.name);
      return fabric;
    }
    case "adjustStock": {
      const fabric = get("fabrics", str(input.id));
      const change = Math.round(num(input.quantity, -1e6, 1e6) * 1000);
      const reason = str(input.reason);
      if (fabric.stock + change < fabric.reserved)
        throw new Error(
          "Adjustment would reduce stock below reserved quantity",
        );
      put("fabrics", { ...fabric, stock: fabric.stock + change });
      movement(
        user,
        "Adjustment",
        fabric.sku,
        change,
        { fabricId: fabric.id },
        reason,
      );
      audit(user, "Adjusted stock", fabric.sku, reason);
      return { success: true };
    }
    case "purchase": {
      const supplier = get("contacts", str(input.supplierId));
      if (supplier.type !== "supplier") throw new Error("Select a supplier");
      const fabric = get("fabrics", str(input.fabricId));
      const purchase = put("purchases", {
        ...base("po"),
        number: sequence("purchases", "PO"),
        supplierId: supplier.id,
        fabricId: fabric.id,
        quantity: mm(input.quantity),
        received: 0,
        unitCost: cents(input.unitCost),
        dueDate: date(input.dueDate),
        notes: optional(input.notes),
        status: "ordered",
      });
      audit(user, "Created purchase order", purchase.number, fabric.name);
      return purchase;
    }
    case "receive": {
      const po = get("purchases", str(input.id));
      const quantity = mm(input.quantity);
      if (quantity > po.quantity - po.received)
        throw new Error("Receipt exceeds the outstanding purchase quantity");
      const fabric = get("fabrics", po.fabricId);
      const cost = Math.round(
        (fabric.stock * fabric.cost + quantity * po.unitCost) /
          (fabric.stock + quantity),
      );
      put("fabrics", { ...fabric, stock: fabric.stock + quantity, cost });
      put("purchases", {
        ...po,
        received: po.received + quantity,
        status: po.received + quantity === po.quantity ? "received" : "partial",
      });
      movement(user, "Purchase receipt", po.number, quantity, {
        fabricId: fabric.id,
      });
      audit(user, "Received fabric", po.number, `${quantity / 1000} m`);
      return { success: true };
    }
    case "order": {
      const client = customer(input.customerId);
      const fabric = get("fabrics", str(input.fabricId));
      const order: Order = {
        ...base("ord"),
        number: sequence("orders", "CO"),
        name: str(input.name, 150),
        customerId: client.id,
        fabricId: fabric.id,
        category: z
          .enum([
            "Shirts",
            "Trousers",
            "Womenswear",
            "Dresses",
            "Uniforms",
            "Other",
          ])
          .parse(input.category),
        quantity: integer(input.quantity, 1, 5000),
        sizes: str(input.sizes, 1000),
        dueDate: date(input.dueDate),
        priority: z.enum(["Normal", "High", "Urgent"]).parse(input.priority),
        notes: optional(input.notes, 6000),
        unitPrice: cents(input.unitPrice),
        laborCost: cents(input.laborCost),
        status: "draft",
        issued: 0,
        accepted: 0,
        rejected: 0,
      };
      put("orders", order);
      audit(user, "Created garment order", order.number, order.name);
      return order;
    }
    case "plan": {
      const order = get("orders", str(input.id));
      if (!["draft", "planned"].includes(order.status))
        throw new Error("Only unissued orders can be replanned");
      const fabric = get("fabrics", order.fabricId);
      const pieces = z
        .array(
          z.object({
            name: z.string().min(1).max(80),
            width: z.number(),
            length: z.number(),
            count: z.number().int(),
            rotate: z.boolean(),
          }),
        )
        .min(1)
        .max(30)
        .parse(input.pieces) as Piece[];
      const plan = createPlan(
        fabric.width,
        order.quantity,
        pieces,
        integer(input.allowance, 0, 100),
        num(input.shrinkage, 0, 20),
        integer(input.gap, 0, 50),
      );
      const old = order.plan?.length || 0;
      if (plan.length > fabric.stock - fabric.reserved + old)
        throw new Error(
          `Insufficient fabric: plan requires ${(plan.length / 1000).toFixed(3)} m`,
        );
      put("fabrics", {
        ...fabric,
        reserved: fabric.reserved - old + plan.length,
      });
      put("orders", { ...order, plan, status: "planned" });
      audit(
        user,
        "Approved cutting estimate",
        order.number,
        `${plan.length / 1000} m reserved · ${plan.utilization}% utilization`,
      );
      return plan;
    }
    case "cancelOrder": {
      const order = get("orders", str(input.id));
      if (!["draft", "planned"].includes(order.status))
        throw new Error(
          "An order cannot be cancelled after fabric has been issued",
        );
      if (order.plan) {
        const fabric = get("fabrics", order.fabricId);
        put("fabrics", {
          ...fabric,
          reserved: fabric.reserved - order.plan.length,
        });
      }
      put("orders", { ...order, status: "cancelled" });
      audit(user, "Cancelled order", order.number, str(input.reason));
      return { success: true };
    }
    case "assign": {
      const order = get("orders", str(input.orderId));
      if (!["planned", "production"].includes(order.status) || !order.plan)
        throw new Error("Approve a cutting plan before assigning production");
      const tailor = users().find(
        (u) => u.id === input.tailorId && u.role === "tailor" && u.active,
      );
      if (!tailor) throw new Error("Select an active tailor");
      const quantity = integer(input.quantity, 1, order.quantity);
      if (
        all("jobs")
          .filter((j) => j.orderId === order.id)
          .reduce((s, j) => s + j.quantity, 0) +
          quantity >
        order.quantity
      )
        throw new Error("Assignments exceed the order quantity");
      if (!order.issued) {
        const fabric = get("fabrics", order.fabricId);
        if (
          fabric.stock < order.plan.length ||
          fabric.reserved < order.plan.length
        )
          throw new Error("Fabric reservation is unavailable");
        put("fabrics", {
          ...fabric,
          stock: fabric.stock - order.plan.length,
          reserved: fabric.reserved - order.plan.length,
        });
        movement(user, "Production issue", order.number, -order.plan.length, {
          fabricId: fabric.id,
        });
        put("orders", {
          ...order,
          issued: order.plan.length,
          issuedCost: Math.round((order.plan.length / 1000) * fabric.cost),
          status: "production",
        });
      }
      const job: Job = {
        ...base("job"),
        orderId: order.id,
        tailorId: tailor.id,
        quantity,
        cut: 0,
        sewn: 0,
        finished: 0,
        status: "assigned",
        notes: optional(input.notes),
        dueDate: date(input.dueDate),
      };
      put("jobs", job);
      audit(
        user,
        "Assigned production",
        order.number,
        `${quantity} pieces → ${tailor.name}`,
      );
      return job;
    }
    case "quality": {
      const order = get("orders", str(input.id));
      if (order.status !== "quality")
        throw new Error(
          "All pieces must be submitted before final quality review",
        );
      const accepted = integer(input.accepted, 0, order.quantity);
      const rejected = order.quantity - accepted;
      const note = str(input.notes);
      const jobs = all("jobs").filter((j) => j.orderId === order.id);
      if (jobs.reduce((s, j) => s + j.finished, 0) !== order.quantity)
        throw new Error("Production is incomplete");
      if (all("products").some((p) => p.orderId === order.id))
        throw new Error(
          "This order has already been received into finished stock",
        );
      for (const job of jobs) put("jobs", { ...job, status: "accepted" });
      put("orders", { ...order, status: "ready", accepted, rejected });
      if (accepted) {
        const product = put("products", {
          ...base("prd"),
          name: order.name,
          sku: `${order.number}-${order.category.toUpperCase().slice(0, 3)}`,
          orderId: order.id,
          category: order.category,
          sizes: order.sizes,
          stock: accepted,
          price: order.unitPrice,
          cost: Math.round(
            ((order.issuedCost || 0) + order.laborCost * order.quantity) /
              accepted,
          ),
          channelStock: 0,
        });
        movement(
          user,
          "Quality accepted",
          order.number,
          accepted,
          { productId: product.id },
          note,
        );
      }
      audit(
        user,
        "Completed quality review",
        order.number,
        `${accepted} accepted · ${rejected} rejected. ${note}`,
      );
      return { success: true };
    }
    case "invoice": {
      const client = customer(input.customerId);
      const config = settings();
      const inputs = z
        .array(
          z.object({
            kind: z.enum(["fabric", "product"]),
            itemId: z.string(),
            quantity: z.coerce.number().positive(),
            price: z.coerce.number().nonnegative().max(1e7),
          }),
        )
        .min(1)
        .max(50)
        .parse(input.lines);
      const number = sequence("invoices", config.invoicePrefix);
      const lines: InvoiceLine[] = inputs.map((line) => {
        const price = cents(line.price);
        if (line.kind === "fabric") {
          const fabric = get("fabrics", line.itemId);
          const quantity = mm(line.quantity);
          if (quantity > fabric.stock - fabric.reserved)
            throw new Error(`${fabric.name}: insufficient available fabric`);
          put("fabrics", { ...fabric, stock: fabric.stock - quantity });
          movement(user, "Direct sale", number, -quantity, {
            fabricId: fabric.id,
          });
          return {
            ...line,
            description: `${fabric.name} · ${fabric.sku}`,
            quantity: quantity / 1000,
            unit: "m",
            price,
            total: Math.round((quantity / 1000) * price),
          };
        }
        const product = get("products", line.itemId);
        const quantity = integer(line.quantity, 1, 100000);
        if (quantity > product.stock - product.channelStock)
          throw new Error(
            `${product.name}: insufficient stock outside Shopify allocation`,
          );
        put("products", { ...product, stock: product.stock - quantity });
        movement(user, "Direct sale", number, -quantity, {
          productId: product.id,
        });
        return {
          ...line,
          description: `${product.name} · ${product.sku}`,
          quantity,
          unit: "pcs",
          price,
          total: quantity * price,
        };
      });
      const subtotal = lines.reduce((s, l) => s + l.total, 0);
      const discount = cents(input.discount);
      if (discount > subtotal)
        throw new Error("Discount exceeds the invoice subtotal");
      const taxRate = num(input.taxRate, 0, 100);
      const tax = Math.round(((subtotal - discount) * taxRate) / 100);
      const total = subtotal - discount + tax;
      const invoice: Invoice = {
        ...base("inv"),
        number,
        customerId: client.id,
        customerName: client.name,
        customerAddress: client.address,
        customerTaxId: client.taxId,
        companyName: config.companyName,
        companyAddress: config.address,
        companyTaxId: config.taxId,
        currency: config.currency,
        lines,
        subtotal,
        discount,
        taxRate,
        tax,
        total,
        paid: 0,
        dueDate: date(input.dueDate),
        notes: optional(input.notes),
        status: total === 0 ? "paid" : "unpaid",
      };
      put("invoices", invoice);
      audit(user, "Issued invoice & delivered stock", number, client.name);
      return invoice;
    }
    case "payment": {
      const invoice = get("invoices", str(input.invoiceId));
      const amount = cents(input.amount);
      if (amount <= 0 || amount > invoice.total - invoice.paid)
        throw new Error(
          "Payment must be positive and cannot exceed the outstanding balance",
        );
      const payment = put("payments", {
        ...base("pay"),
        invoiceId: invoice.id,
        amount,
        method: z
          .enum(["Bank transfer", "UPI", "Cash", "Card", "Cheque"])
          .parse(input.method),
        reference: str(input.reference, 150),
        date: date(input.date),
      });
      put("invoices", {
        ...invoice,
        paid: invoice.paid + amount,
        status: invoice.paid + amount === invoice.total ? "paid" : "partial",
      });
      audit(user, "Recorded payment", invoice.number, payment.reference);
      return payment;
    }
    case "settings": {
      const currency = z
        .string()
        .regex(/^[A-Z]{3}$/)
        .parse(input.currency);
      try {
        new Intl.NumberFormat("en", { style: "currency", currency });
      } catch {
        throw new Error("Use a valid three-letter currency code");
      }
      if (
        currency !== settings().currency &&
        (all("fabrics").length ||
          all("orders").length ||
          all("invoices").length)
      )
        throw new Error(
          "Currency cannot change after monetary records are created",
        );
      const config = {
        companyName: str(input.companyName, 120),
        email: optional(input.email, 254),
        phone: optional(input.phone, 50),
        address: optional(input.address),
        taxId: optional(input.taxId, 100),
        currency,
        taxRate: num(input.taxRate, 0, 100),
        invoicePrefix: z
          .string()
          .regex(/^[A-Z0-9-]{1,10}$/)
          .parse(input.invoicePrefix),
        paymentDetails: optional(input.paymentDetails),
      };
      saveSettings(config);
      audit(user, "Updated company settings", config.companyName);
      return config;
    }
    case "user": {
      const person = createUser(
        str(input.name, 100),
        z.email().parse(input.email),
        str(input.password, 128),
        z.enum(["admin", "tailor"]).parse(input.role),
      );
      audit(user, "Created account", person.name, person.role);
      return person;
    }
    case "userStatus": {
      const id = str(input.id);
      const active = z.boolean().parse(input.active);
      if (id === user.id)
        throw new Error("You cannot disable your own account");
      const person = users().find((u) => u.id === id);
      if (!person) throw new Error("User not found");
      if (
        !active &&
        all("jobs").some((j) => j.tailorId === id && j.status !== "accepted")
      )
        throw new Error(
          "Complete open tailor assignments before disabling this account",
        );
      db()
        .prepare("UPDATE users SET active=? WHERE id=?")
        .run(active ? 1 : 0, id);
      db().prepare("DELETE FROM sessions WHERE user_id=?").run(id);
      audit(user, active ? "Enabled account" : "Disabled account", person.name);
      return { success: true };
    }
    case "resetPassword": {
      const id = str(input.id);
      const person = users().find((u) => u.id === id);
      if (!person) throw new Error("User not found");
      resetPassword(id, str(input.password, 128));
      audit(user, "Reset account password", person.name);
      return { success: true };
    }
    default:
      throw new Error("Unknown operation");
  }
}
