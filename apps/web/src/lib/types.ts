export type Role = "admin" | "tailor";
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}
export interface Base {
  id: string;
  createdAt: string;
  updatedAt: string;
}
export interface Contact extends Base {
  name: string;
  email: string;
  phone: string;
  address: string;
  taxId: string;
  notes: string;
  type: "customer" | "supplier";
}
export interface Fabric extends Base {
  name: string;
  sku: string;
  composition: string;
  color: string;
  width: number;
  gsm: number;
  lot: string;
  location: string;
  stock: number;
  reserved: number;
  reorder: number;
  cost: number;
  price: number;
}
export interface Purchase extends Base {
  number: string;
  supplierId: string;
  fabricId: string;
  quantity: number;
  received: number;
  unitCost: number;
  dueDate: string;
  notes: string;
  status: "ordered" | "partial" | "received";
}
export interface Piece {
  name: string;
  width: number;
  length: number;
  count: number;
  rotate: boolean;
}
export interface Placement {
  name: string;
  x: number;
  y: number;
  width: number;
  length: number;
  rotated: boolean;
}
export interface Plan {
  width: number;
  usableWidth: number;
  length: number;
  utilization: number;
  waste: number;
  allowance: number;
  shrinkage: number;
  gap: number;
  placements: Placement[];
  pieces: Piece[];
  quantity: number;
}
export type OrderStatus =
  "draft" | "planned" | "production" | "quality" | "ready" | "cancelled";
export interface Order extends Base {
  number: string;
  name: string;
  customerId: string;
  fabricId: string;
  category: string;
  quantity: number;
  sizes: string;
  dueDate: string;
  priority: string;
  notes: string;
  unitPrice: number;
  laborCost: number;
  status: OrderStatus;
  plan?: Plan;
  issued: number;
  issuedCost?: number;
  accepted: number;
  rejected: number;
}
export interface Job extends Base {
  orderId: string;
  tailorId: string;
  quantity: number;
  cut: number;
  sewn: number;
  finished: number;
  status:
    | "assigned"
    | "cutting"
    | "stitching"
    | "finishing"
    | "submitted"
    | "accepted";
  notes: string;
  dueDate: string;
}
export interface Product extends Base {
  name: string;
  sku: string;
  orderId: string;
  category: string;
  sizes: string;
  stock: number;
  price: number;
  cost: number;
  shopifyId?: string;
  variantId?: string;
  inventoryItemId?: string;
  shopifyStatus?: "draft" | "published" | "error" | "syncing";
  shopifyError?: string;
  shopifyUrl?: string;
  channelStock: number;
  allocationKey?: string;
  inventoryAttempted?: boolean;
  inventorySynced?: boolean;
}
export interface InvoiceLine {
  kind: "fabric" | "product";
  itemId: string;
  description: string;
  quantity: number;
  unit: string;
  price: number;
  total: number;
}
export interface Invoice extends Base {
  number: string;
  customerId: string;
  customerName: string;
  customerAddress: string;
  customerTaxId: string;
  companyName: string;
  companyAddress: string;
  companyTaxId: string;
  currency: string;
  lines: InvoiceLine[];
  subtotal: number;
  discount: number;
  taxRate: number;
  tax: number;
  total: number;
  paid: number;
  dueDate: string;
  notes: string;
  status: "unpaid" | "partial" | "paid";
}
export interface Payment extends Base {
  invoiceId: string;
  amount: number;
  method: string;
  reference: string;
  date: string;
}
export interface Movement extends Base {
  fabricId?: string;
  productId?: string;
  quantity: number;
  type: string;
  reference: string;
  actor: string;
  note: string;
}
export interface Activity extends Base {
  actor: string;
  action: string;
  subject: string;
  detail: string;
}
export interface Settings {
  companyName: string;
  email: string;
  phone: string;
  address: string;
  taxId: string;
  currency: string;
  taxRate: number;
  invoicePrefix: string;
  paymentDetails: string;
}
export interface Entities {
  contacts: Contact;
  fabrics: Fabric;
  purchases: Purchase;
  orders: Order;
  jobs: Job;
  products: Product;
  invoices: Invoice;
  payments: Payment;
  movements: Movement;
  activities: Activity;
}
export type Kind = keyof Entities;
export interface State {
  user: User;
  users: User[];
  contacts: Contact[];
  fabrics: Fabric[];
  purchases: Purchase[];
  orders: Order[];
  jobs: Job[];
  products: Product[];
  invoices: Invoice[];
  payments: Payment[];
  movements: Movement[];
  activities: Activity[];
  settings: Settings;
  shopify: {
    configured: boolean;
    domain: string;
    publication: boolean;
    inventory: boolean;
  };
  demo: boolean;
}
export const money = (amount: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount / 100);
export const meters = (mm: number) =>
  `${(mm / 1000).toLocaleString("en-IN", { maximumFractionDigits: 3 })} m`;
export const shortDate = (date: string) =>
  date
    ? new Date(date.slice(0, 10) + "T12:00:00").toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
