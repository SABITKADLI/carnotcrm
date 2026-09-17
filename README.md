# Carnot — Fabric to finished

A working fabric sourcing and garment-production CRM, built in the existing Next.js app. Administrators source and sell fabric, plan garment production, assign tailors, approve finished stock, issue invoices and publish batch SKUs to Shopify. Tailors sign in to a restricted portal and update only their assignments.

## Run the sample studio

Requires **Node.js 24+**.

```powershell
cd apps/web
npm ci
npm run demo
```

Open **http://127.0.0.1:3000** and choose **Open admin studio** or **Open tailor portal**. The demo includes fictional suppliers, customers, fabric lots, production orders, tailor assignments, invoices and payments. Its database is `apps/web/data/demo.sqlite`; changes survive restarts. Demo accounts use random passwords and are accessible only through development demo mode. Demo login is disabled in production.

## Start an empty business workspace

```powershell
cd apps/web
npm ci
Copy-Item .env.example .env
npm run admin:create
npm run dev
```

The administrator command prompts for a name/email and generates a temporary password. It never resets an existing account. Sign in at the origin configured by `CRM_PUBLIC_URL`, then change the temporary password under Settings. Set company details, currency and tax rate **before** creating stock. Currency is locked once monetary records exist. The production database is separate from the demo database.

For automated provisioning, supply `CRM_ADMIN_NAME`, `CRM_ADMIN_EMAIL` and `CRM_ADMIN_PASSWORD` as process environment variables to `npm run admin:create`; do not commit them. Passwords need 12–128 characters. Administrators can create and disable additional admin/tailor accounts and reset passwords.

## Included workflow

1. **Contacts:** customer/supplier directory with contact information, addresses, tax IDs and relationship notes.
2. **Materials:** fabric SKUs/lots, composition, color, width, GSM, location, opening stock, reserved stock, reorder thresholds, weighted-average cost, prices and stock movements.
3. **Purchasing:** supplier purchase orders and partial goods receipts. Only received fabric becomes available.
4. **Garment orders:** customer, category, quantity, size breakdown, deadline, priority, price, labor cost and technical instructions.
5. **Cutting room:** editable rectangular components, grain-aware rotation, selvedge allowance, shrinkage compensation, cutting gap, deterministic shelf layout, utilization, marker preview and full placement CSV. Approval reserves material. A revised plan replaces its reservation atomically.
6. **Tailor production:** split assignments with deadlines, suggested garment-specific stitching sequences, approved cutting information, cumulative cut/stitched/finished counts and progress notes. The first assignment issues the order's reserved fabric once.
7. **Quality control:** administrator inspection after all pieces are submitted. Accepted pieces become finished stock; rejected pieces are recorded without becoming sellable.
8. **Sales & billing:** sell raw fabric or finished garments using a combined **bill-and-deliver** action. Invoices snapshot company/customer details and prices, calculate configurable discounts/tax, decrement stock atomically, support partial payments and print/save-as-PDF.
9. **Shopify:** server-side GraphQL product creation, SKU/price update, explicit inventory allocation and channel publication. Signed paid-order webhooks reconcile mapped sales. See [Shopify setup](docs/SHOPIFY.md).
10. **Operations:** dashboard, due-order queue, low-stock alerts, quality queue, production reports, receivables aging, CSV exports, activity log, account controls and consistent SQLite backups.

## Integrity & access controls

- SQLite WAL persistence with prepared statements and write transactions. Material length uses integer millimetres; prices use integer minor currency units; garments use integer pieces.
- Available fabric is on-hand less reserved. Direct sales cannot consume production reservations or Shopify allocations.
- Receipts, reservations, stock issues, invoices, payments and QC operate atomically. Stable operation IDs make request retries idempotent. Operation records store request hashes, not passwords.
- Scrypt password hashing; hashed opaque session tokens; HttpOnly/SameSite cookies; production Secure cookies; session expiry and invalidation; login-attempt limits; origin checks on mutations.
- Authentication and role checks run on the server. Tailor API responses omit customer, billing and material pricing data, and include only their assigned orders/jobs.
- Issued material cost is captured before later purchasing changes average cost. Issued invoices keep price/customer snapshots.
- Sample data and sample account access are isolated from production.

## Validation

```powershell
cd apps/web
npm run lint
npm run typecheck
npm test
npm run build
```

The test suite covers purchasing retries, over-receipt rollback, competing reservations, grain direction and shrinkage, non-overlapping layouts, split job allocations, tailor isolation, progress bounds, QC, historical material cost, billing rollback, partial payments, currency locking, session invalidation, secret-free operation storage, Shopify allocations, signed webhooks and remote product retry recovery.

With the demo server running, `node scripts/smoke.mjs` verifies HTTP authentication, every app view, printable invoices, CSRF rejection, tailor isolation and logout. This is HTTP verification, not browser interaction/visual testing. The Shopify unit tests use mocked HTTP responses; no live store operation is claimed without credentials.

## Architecture

```text
apps/web/
  src/app/                  Next.js routes, protected views and API endpoints
  src/components/           Studio UI, editors, cutting room and print controls
  src/lib/db.ts             SQLite persistence and transactions
  src/lib/auth.ts           Users, password hashing, sessions and login limits
  src/lib/service.ts        Domain operations, validation and role-scoped reads
  src/lib/cutting.ts        Deterministic rectangular shelf-packing heuristic
  src/lib/stitching.ts      Category-specific suggested sewing sequences
  src/lib/shopify.ts        Product, inventory, publication and webhook adapter
  scripts/                  Demo runner, admin provisioning, backups, HTTP smoke
  tests/                    Domain and integration tests
  data/                     Ignored runtime databases and backups
docs/                       Hosting and Shopify connection instructions
```

The backend lives in Next.js route handlers. No separate `apps/api` service or external database account is needed. The `entities` table stores typed JSON records under `(kind,id)`; domain validation and cross-record invariants live in `service.ts`. This design favors a straightforward single-company deployment; it is not a multi-tenant SaaS.

## Deployment and boundaries

See [Operations](docs/OPERATIONS.md) for persistent Node/Docker deployment and backup recovery. The app has **not been deployed to a public host**. Local SQLite requires a durable disk and a single application instance; ordinary ephemeral/serverless deployment is unsuitable without a database migration.

- Cutting is a **rectangular planning estimate**, not garment CAD, polygon nesting or proof of an optimal cut. It does not model pattern curves, fabric defects, directional prints or repeat matching. Approve production patterns and a fit sample before bulk cutting.
- Size breakdown and measurements are descriptive fields. A production order is one batch SKU, not a matrix of independently counted size/color variants. Split orders by size/color if separate SKUs are required.
- Stitching sequences are category-based suggestions, supplemented by recorded technical instructions; they are not an automatically validated technical pack.
- QC is final batch acceptance. Rejected pieces do not have a separate rework/returns lifecycle. Post-issue cancellation, credit notes and payment reversal are not implemented.
- Billing combines invoice issuance and stock delivery. This is not a complete accounting, jurisdiction-specific tax filing, shipping or payroll system. Configure applicable tax rates and company details yourself.
- Shopify requires real credentials and permissions. Cancellations, refunds, returns, order edits and ambiguous inventory failures require reconciliation. Shopify invoices/payments remain in Shopify and are excluded from CRM invoice revenue charts.
- File/photo uploads, email delivery, SSO/MFA, self-service password reset and multi-warehouse transfers are not included.

These boundaries are explicit so the implementation can be evaluated as a working release without mistaking it for a fully commissioned ERP.
