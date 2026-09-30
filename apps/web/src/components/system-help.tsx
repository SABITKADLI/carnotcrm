"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  CircleAlert,
  Factory,
  FileSpreadsheet,
  PackageCheck,
  ReceiptText,
  Scissors,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Spool,
  Truck,
  Users,
} from "lucide-react";
import { canAccessView, PARTNER_VIEW_ACCESS, type VisibleAppView } from "@/lib/access";
import type { Role } from "@/lib/types";
import { Dialog } from "./ui";

type GuideStatus = "connected" | "partial" | "separate";

const workflow = [
  {
    view: "settings",
    title: "Set up people",
    simple: "Tell Carnot who may come inside and what each person may touch.",
    icon: Settings2,
  },
  {
    view: "master-data",
    title: "Fill the address book",
    simple: "Save fabrics, suppliers, agents, transporters, jobworkers, parties and brands once.",
    icon: Users,
  },
  {
    view: "fabric-orders",
    title: "Order fabric",
    simple: "Ask a supplier for a fabric, price, quantity and delivery date.",
    icon: Spool,
  },
  {
    view: "fabric-orders",
    title: "Receive fabric",
    simple: "Write down how many metres really arrived. Carnot compares ordered and received metres.",
    icon: PackageCheck,
  },
  {
    view: "transport-dc",
    title: "Send fabric out",
    simple: "Choose the jobworker, transporter, bundles and driver, then print the delivery challan.",
    icon: Truck,
  },
  {
    view: "production",
    title: "Make the garments",
    simple: "Create a work order. The jobworker updates cutting, stitching and finishing stages.",
    icon: Factory,
  },
  {
    view: "cleared-lots",
    title: "Count what came back",
    simple: "Record good pieces, mixed pieces and damaged pieces. Carnot shows loss and differences.",
    icon: PackageCheck,
  },
  {
    view: "products",
    title: "Keep finished stock",
    simple: "Good garments become finished goods that are ready to sell.",
    icon: ShoppingBag,
  },
] satisfies Array<{
  view: VisibleAppView;
  title: string;
  simple: string;
  icon: typeof Settings2;
}>;

export const SYSTEM_GUIDE_SCREENS: Array<{
  view: VisibleAppView;
  title: string;
  simple: string;
  status: GuideStatus;
}> = [
  { view: "overview", title: "Dashboard", simple: "The big picture: fabric, work at factories, inward pieces, damage, old work orders and import problems.", status: "connected" },
  { view: "master-data", title: "Master Data", simple: "The shared list of fabrics, suppliers, agents, jobworkers, transporters, parties, brands and production stages.", status: "connected" },
  { view: "fabric-orders", title: "Fabric Orders", simple: "Purchase orders, receipts, supplier promises, overdue dates, prices and quantities.", status: "connected" },
  { view: "transport-dc", title: "Transport & DC", simple: "Fabric movement, LR details, bundles, drivers, jobworkers and printable delivery challans.", status: "connected" },
  { view: "production", title: "Production", simple: "Work orders, approved consumption, size ratios, cutting quantities, factory stages and garment inward.", status: "connected" },
  { view: "cleared-lots", title: "Cleared Lots", simple: "Finished work with expected, cut, inward, damage, shortage, excess and final consumption numbers.", status: "connected" },
  { view: "workbook-sync", title: "Workbook Sync", simple: "Admin-only Excel preview, conflict review, import and export. It never silently deletes portal data.", status: "connected" },
  { view: "cutting", title: "Cutting Room", simple: "The marker-planning engine is preserved, but this screen is being rebuilt for the new fabric-PO workflow.", status: "separate" },
  { view: "products", title: "Finished Goods", simple: "Accepted garments, available stock, selling prices and Shopify allocations.", status: "connected" },
  { view: "customers", title: "Customers", simple: "The customer workspace is being rebuilt. Invoice customer records still exist, but they are separate from operational parties.", status: "separate" },
  { view: "suppliers", title: "Suppliers / Vendors", simple: "A focused view of supplier master records and their contact details.", status: "connected" },
  { view: "invoices", title: "Billing & Payments", simple: "Sell fabric or finished garments, issue an invoice, reduce stock and record payments.", status: "connected" },
  { view: "reports", title: "Reports", simple: "Sales and receivables are connected. Some production and material report rows still use the preserved older garment-order records.", status: "partial" },
  { view: "activity", title: "Activity Log", simple: "The latest important changes, who made them and which record changed.", status: "connected" },
  { view: "settings", title: "Settings", simple: "Company and challan details, user accounts, passwords and Shopify connection status.", status: "connected" },
];

export const SYSTEM_ROLE_GUIDES: Array<{
  role: Role;
  name: string;
  connectsTo: string;
  canDo: string;
  cannotSee: string;
}> = [
  { role: "admin", name: "Administrator", connectsTo: "No partner link is needed", canDo: "Everything: all records, prices, users, imports, overrides, billing, Shopify and settings", cannotSee: "Nothing is hidden" },
  { role: "supplier", name: "Supplier", connectsTo: "A supplier/vendor organization", canDo: "See its own fabric POs and related transport; acknowledge orders; add delivery estimates, dispatch details and notes", cannotSee: "Other suppliers, production, billing, users and company settings" },
  { role: "agent", name: "Agent", connectsTo: "An agent organization", canDo: "See POs linked to that agent and add notes", cannotSee: "Transport, production, billing and other agents' records" },
  { role: "transporter", name: "Transporter", connectsTo: "A transporter organization", canDo: "See assigned movements and challans; add notes; update pickup and delivery status", cannotSee: "Prices, fabric-order lists, production, billing and other transporters' work" },
  { role: "delivery", name: "Delivery person", connectsTo: "A driver, pickup or delivery person record", canDo: "See challans explicitly assigned to that person and update the journey status", cannotSee: "Prices, unrelated deliveries, production and billing" },
  { role: "jobworker", name: "Jobworker", connectsTo: "A jobworker organization", canDo: "See its own challans, work orders and cleared lots; acknowledge fabric; update stages, cutting quantities, inward, damage and notes", cannotSee: "Prices, other factories, billing, users and imports" },
  { role: "distributor", name: "Distributor / party", connectsTo: "A distributor/party organization", canDo: "See linked POs and transport records and add notes", cannotSee: "Production details, billing, users and unrelated parties" },
  { role: "tailor", name: "Tailor (older accounts)", connectsTo: "A legacy tailor assignment or jobworker organization", canDo: "Use the jobworker screens for assigned work", cannotSee: "Commercial values and all unrelated work. Use Jobworker for new accounts" },
];

const gaps = [
  {
    title: "Customers and operational parties are two lists",
    body: "Billing uses customer contact records. Fabric operations use distributor/party organizations. Choosing a party on a fabric order does not automatically choose the invoice customer yet.",
  },
  {
    title: "Cutting Room is not on the new chain yet",
    body: "The older marker planner can calculate fabric use and waste, but it does not yet create the cutting plan for a new production work order made from a delivery challan.",
  },
  {
    title: "Delivery-person assignment is only partly connected",
    body: "Imported transport rows can point to a person. The new delivery-challan form still stores the driver as text, so a delivery login only sees rows that have an explicit person link.",
  },
  {
    title: "Reports are mixed",
    body: "Invoice sales and receivables are live. The production-performance export still reads the preserved older garment-order workflow, so it is not a complete report of the new work-order chain.",
  },
  {
    title: "Shopify sizes need separate stock records",
    body: "Shopify publishes by finished-goods batch SKU. If each size needs its own Shopify variant and stock count, sizes must be split before publication.",
  },
  {
    title: "Older garment-order data is preserved",
    body: "The old garment-order and garment-job menu tabs were removed. Their records and engine remain for compatibility, but they are not the main Singal Fabrics workflow.",
  },
];

function Status({ status }: { status: GuideStatus }) {
  const label = status === "connected" ? "Connected" : status === "partial" ? "Partly connected" : "Separate for now";
  return <span className={`guide-status ${status}`}>{label}</span>;
}

function GuideLink({ role, view, children }: { role: Role; view: VisibleAppView; children: ReactNode }) {
  return canAccessView(role, view) ? <Link href={`/${view}`}>{children}</Link> : <div className="guide-link-disabled">{children}</div>;
}

export function SystemHelp({ role, onClose }: { role: Role; onClose: () => void }) {
  return (
    <Dialog title="How Carnot CRM works" onClose={onClose} wide>
      <div className="system-guide">
        <section className="guide-intro">
          <div>
            <span className="eyebrow">THE WHOLE SYSTEM, IN SIMPLE WORDS</span>
            <h3>Fabric comes in. Garments go out. Carnot remembers every step.</h3>
            <p>Follow the numbered path first. Green means the screens already talk to one another. Amber means a piece still needs joining.</p>
          </div>
          <BookOpenText size={42} strokeWidth={1.25} />
        </section>

        <section aria-labelledby="guide-flow-title">
          <div className="guide-section-heading">
            <div>
              <span className="eyebrow">01 / THE MAIN ROAD</span>
              <h3 id="guide-flow-title">From an empty workspace to a sale</h3>
            </div>
            <Status status="connected" />
          </div>
          <ol className="guide-flow">
            {workflow.map((step, index) => (
              <li key={`${step.view}-${step.title}`}>
                <GuideLink role={role} view={step.view}>
                  <span className="guide-step-number">{String(index + 1).padStart(2, "0")}</span>
                  <step.icon size={21} strokeWidth={1.5} />
                  <strong>{step.title}</strong>
                  <p>{step.simple}</p>
                </GuideLink>
                {index < workflow.length - 1 && <><ArrowRight className="guide-arrow-right" size={18} /><ArrowDown className="guide-arrow-down" size={18} /></>}
              </li>
            ))}
          </ol>
          <div className="guide-sale-split">
            <div>
              <ReceiptText size={23} />
              <strong>Sell with an invoice</strong>
              <p>Choose a customer, sell fabric or finished garments, reduce stock and record each payment.</p>
            </div>
            <span>OR</span>
            <div>
              <ShoppingBag size={23} />
              <strong>Send to Shopify</strong>
              <p>Make a draft listing, or publish and reserve a chosen number of finished pieces for the store.</p>
            </div>
          </div>
          <div className="guide-watch-rail">
            <strong>Watching over every step</strong>
            <span>Dashboard shows the big picture</span>
            <span>Reports explain sales and stock</span>
            <span>Activity Log remembers changes</span>
            <span>Workbook Sync moves Excel data safely</span>
          </div>
        </section>

        <section aria-labelledby="guide-users-title">
          <div className="guide-section-heading">
            <div>
              <span className="eyebrow">02 / PEOPLE & KEYS</span>
              <h3 id="guide-users-title">Who can sign in, and what can they see?</h3>
            </div>
            <ShieldCheck size={27} strokeWidth={1.4} />
          </div>
          <div className="guide-user-steps">
            <span><b>1</b> Admin saves the company or person in Master Data.</span>
            <span><b>2</b> Admin opens Settings → Add team member.</span>
            <span><b>3</b> Pick the access level and link the matching partner record.</span>
            <span><b>4</b> Give them the temporary password. No invitation email is sent.</span>
            <span><b>5</b> They sign in and may change their own password.</span>
          </div>
          <div className="table-scroll guide-access-table">
            <table>
              <thead><tr><th>User</th><th>Connect this record</th><th>Pages they receive</th><th>What they can do</th><th>Kept away</th></tr></thead>
              <tbody>
                {SYSTEM_ROLE_GUIDES.map((item) => (
                  <tr key={item.role}>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.connectsTo}</td>
                    <td>{item.role === "admin" ? "Every page" : PARTNER_VIEW_ACCESS[item.role].map((view) => SYSTEM_GUIDE_SCREENS.find((screen) => screen.view === view)?.title || view).join(", ")}</td>
                    <td>{item.canDo}</td>
                    <td>{item.cannotSee}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="guide-note"><CircleAlert size={16} /> Customers do not have a login role today. “Delivery person” is the login role for a linked driver, pickup worker or delivery worker. Administrators can reset passwords, disable accounts and see every commercial value.</p>
        </section>

        <section aria-labelledby="guide-pages-title">
          <div className="guide-section-heading">
            <div>
              <span className="eyebrow">03 / EVERY ROOM</span>
              <h3 id="guide-pages-title">What each page is for</h3>
            </div>
          </div>
          <div className="guide-screen-list">
            {SYSTEM_GUIDE_SCREENS.map((screen) => (
              <GuideLink key={screen.view} role={role} view={screen.view}>
                <article>
                  <div><strong>{screen.title}</strong><Status status={screen.status} /></div>
                  <p>{screen.simple}</p>
                </article>
              </GuideLink>
            ))}
          </div>
        </section>

        <section className="guide-gaps" aria-labelledby="guide-gaps-title">
          <div className="guide-section-heading">
            <div>
              <span className="eyebrow">04 / PIECES STILL TO JOIN</span>
              <h3 id="guide-gaps-title">What is not fully connected yet</h3>
            </div>
            <Scissors size={27} strokeWidth={1.4} />
          </div>
          <div>
            {gaps.map((gap, index) => (
              <article key={gap.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{gap.title}</strong><p>{gap.body}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section className="guide-trust">
          <CheckCircle2 size={25} />
          <div><strong>One safe rule</strong><p>If a partner signs in, Carnot only sends records linked to that partner. Prices and company details are removed for factory, transport and delivery users.</p></div>
          <FileSpreadsheet size={25} />
        </section>
      </div>
    </Dialog>
  );
}
