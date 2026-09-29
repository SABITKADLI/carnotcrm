import { randomBytes } from "node:crypto";
import { base, put, saveSettings, transaction, withStore } from "./db";
import { createUser, users } from "./auth";

export async function seedDemo() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Demo seeding is disabled in production");
  if (await hasUsers()) return;
  await transaction(() => {
    if (users().length) return;
    createUser(
      "Aarav Mehta",
      "admin@carnot.demo",
      randomBytes(24).toString("hex"),
      "admin",
    );
    createUser(
      "Meera Shah",
      "meera@carnot.demo",
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
    put("activities", {
      ...base("evt"),
      actor: "Carnot",
      action: "Sample workspace ready",
      subject: "Demo data",
      detail: "Demo accounts were created. Add fabrics, customers and orders to explore the workflow.",
    });
  });
}

export async function hasUsers() {
  return withStore(() => users().length > 0);
}
