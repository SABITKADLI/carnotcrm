import assert from "node:assert/strict";
const origin = process.env.CRM_TEST_URL || "http://127.0.0.1:3000";
async function signIn(role) {
  const response = await fetch(`${origin}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ action: "demo", role }),
  });
  assert.equal(response.status, 200, await response.text());
  return response.headers.get("set-cookie").split(";")[0];
}
const guest = await fetch(`${origin}/api/state`);
assert.equal(guest.status, 401);
const admin = await signIn("admin");
const adminState = await fetch(`${origin}/api/state`, {
  headers: { Cookie: admin },
}).then((r) => r.json());
assert.equal(adminState.user.role, "admin");
assert.ok(adminState.orders.length > 0);
const routes = [
  "overview",
  "orders",
  "cutting",
  "production",
  "fabrics",
  "purchases",
  "products",
  "customers",
  "suppliers",
  "invoices",
  "reports",
  "activity",
  "settings",
  `invoice/${adminState.invoices[0].id}`,
];
for (const route of routes) {
  const response = await fetch(`${origin}/${route}`, {
    headers: { Cookie: admin },
  });
  await response.text();
  assert.equal(response.status, 200, route);
  console.log(`PASS /${route}`);
}
const csrf = await fetch(`${origin}/api/action`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: "https://untrusted.example",
    Cookie: admin,
  },
  body: JSON.stringify({
    action: "contact",
    input: { name: "Blocked" },
    operationId: crypto.randomUUID(),
  }),
});
assert.equal(csrf.status, 400);
const tailor = await signIn("tailor");
const tailorState = await fetch(`${origin}/api/state`, {
  headers: { Cookie: tailor },
}).then((r) => r.json());
assert.equal(tailorState.user.role, "tailor");
assert.equal(tailorState.contacts.length, 0);
assert.equal(tailorState.invoices.length, 0);
assert.ok(tailorState.jobs.every((j) => j.tailorId === tailorState.user.id));
const forbidden = await fetch(`${origin}/api/action`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: origin,
    Cookie: tailor,
  },
  body: JSON.stringify({
    action: "invoice",
    input: {},
    operationId: crypto.randomUUID(),
  }),
});
assert.equal(forbidden.status, 400);
const invoice = await fetch(`${origin}/invoice/${adminState.invoices[0].id}`, {
  headers: { Cookie: tailor },
});
assert.equal(invoice.status, 404);
for (const Cookie of [admin, tailor]) {
  const res = await fetch(`${origin}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, Cookie },
    body: JSON.stringify({ action: "logout" }),
  });
  assert.equal(res.status, 200);
  const loggedOut = await fetch(`${origin}/api/state`, { headers: { Cookie } });
  assert.equal(loggedOut.status, 401);
}
console.log(
  "PASS HTTP authentication, CSRF, tailor isolation, invoice authorization and logout",
);
