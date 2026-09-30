export type PartnerRole =
  | "supplier"
  | "agent"
  | "transporter"
  | "delivery"
  | "jobworker"
  | "distributor";
export type Role = "admin" | PartnerRole | "tailor";
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  partnerId?: string;
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
  fromLocation?: string;
  toLocation?: string;
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
  portalName?: string;
  brandName?: string;
  logisticsName?: string;
  logisticsEmail?: string;
  logisticsPhone?: string;
  logisticsAddress?: string;
  logisticsTaxId?: string;
}

export interface SourceTrace {
  sourceSheet?: string;
  sourceRow?: number;
  legacyId?: string;
  sourceHash?: string;
  version: number;
  archived?: boolean;
  notesLog?: Array<{
    userId: string;
    author: string;
    role: Role;
    note: string;
    date: string;
  }>;
}
export type OrganizationRole =
  | "supplier"
  | "vendor"
  | "agent"
  | "jobworker"
  | "transporter"
  | "distributor"
  | "customer"
  | "legal_entity";
export interface Organization extends Base, SourceTrace {
  name: string;
  roles: OrganizationRole[];
  email: string;
  phone: string;
  address: string;
  taxId: string;
  notes: string;
}
export interface Person extends Base, SourceTrace {
  name: string;
  organizationId?: string;
  role: "driver" | "pickup" | "delivery" | "contact";
  email: string;
  phone: string;
  notes: string;
}
export interface FabricSpec extends Base, SourceTrace {
  name: string;
  rangeName: string;
  width: string;
  folding: string;
  weave: string;
  threadCount: string;
  construction: string;
  content: string;
  supplierId: string;
  agentId?: string;
}
export type FabricOrderStatus =
  "Ordered" | "Partial" | "Received" | "Cancelled";
export interface FabricOrder extends Base, SourceTrace {
  orderBy: string;
  orderDate: string;
  poNumber: string;
  internalItemName: string;
  fabricSpecId?: string;
  fabricName: string;
  supplierId: string;
  supplierName: string;
  width: string;
  folding: string;
  weave: string;
  content: string;
  construction: string;
  threadCount: string;
  agentId?: string;
  agentName: string;
  fabricType: string;
  pricePerMetre: number;
  deliveryDate: string;
  designs: string;
  colors: string;
  quantityOrdered: number;
  purposeParty: string;
  partyIds?: string[];
  fabricFor: string;
  receivedMetres: number;
  cancelledMetres: number;
  status: FabricOrderStatus;
  remarks: string;
  fabricValue: number;
  supplierAcknowledgedAt?: string;
  supplierDeliveryEstimate?: string;
  supplierNotes?: string;
  dispatchDetails?: string;
  voidedAt?: string;
  voidReason?: string;
}
export interface FabricReceipt extends Base, SourceTrace {
  fabricOrderId: string;
  receiptDate: string;
  quantityMetres: number;
  warehouse: string;
  lotNumber: string;
  remarks: string;
  lrNumber?: string;
  lrDate?: string;
  transporterId?: string;
  transportName?: string;
  numberOfBales?: number;
  sourceLocation?: string;
  destinationLocation?: string;
  dispatchDetails?: string;
  transportMovementId?: string;
  challanId?: string;
}
export interface Attachment extends Base {
  entityKind: "fabricOrder";
  entityId: string;
  fileName: string;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  sizeBytes: number;
  s3Key: string;
  uploadedBy: string;
  deletedAt?: string;
}
export type DeliveryChallanStatus =
  | "Draft"
  | "Issued"
  | "Picked Up"
  | "Delivered"
  | "Acknowledged"
  | "Void"
  | "Returned";
export interface TransportMovement extends Base, SourceTrace {
  fabricOrderId?: string;
  poNumber: string;
  fabricName: string;
  supplierId: string;
  supplierName: string;
  partyId?: string;
  partyName: string;
  lrDate: string;
  lrNumber: string;
  numberOfBales: number;
  transporterId?: string;
  transportName: string;
  fabricQuantity: number;
  destinationJobworkerId: string;
  destinationJobworkerName: string;
  pickedByPersonId?: string;
  pickedBy: string;
  challanId?: string;
  outwardDcNumber: string;
  dcIssueDate: string;
  balePickupDate: string;
  balePickupInward: string;
  stage: string;
  priority: string;
  remarks: string;
  pricePerMetre: number;
  priceOverride: boolean;
  value: number;
}
export interface DeliveryChallanLine {
  id: string;
  transportMovementId?: string;
  fabricOrderId?: string;
  fabricName: string;
  quantityMetres: number;
  transportName: string;
  lrNumber: string;
  bundles: number;
  pricePerMetre: number;
}
export interface PartySnapshot {
  name: string;
  address: string;
  taxId: string;
  email: string;
  phone: string;
}
export interface DeliveryChallan extends Base, SourceTrace {
  number: string;
  issueDate: string;
  status: DeliveryChallanStatus;
  issuer: PartySnapshot;
  consignee: PartySnapshot;
  jobworkerId?: string;
  driverName: string;
  driverPhone: string;
  transportName: string;
  lrNumber: string;
  purpose: string;
  terms: string;
  remarks: string;
  lines: DeliveryChallanLine[];
  issuedAt?: string;
  acknowledgedAt?: string;
}
export const PRODUCTION_SIZES = [
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  "20",
  "22",
  "24",
  "26",
  "28",
  "30",
  "32",
  "34",
  "36",
  "38",
  "40",
] as const;
export type ProductionSize = (typeof PRODUCTION_SIZES)[number];
export type SizeBreakdown = Partial<Record<ProductionSize, number>>;
export interface ProductionWorkOrder extends Base, SourceTrace {
  challanId?: string;
  dcNumber: string;
  jobworkerId: string;
  jobworkerName: string;
  fabricOutwardDate: string;
  woNumber: string;
  brandId?: string;
  brandName: string;
  itemName: string;
  bodyFabric: number;
  trimFabric: number;
  issuedDate: string;
  ageingDays: number;
  remarks: string;
  ratio: SizeBreakdown;
  approvedConsumption?: number;
  cuttingDate: string;
  expectedQuantity: number;
  status: string;
  lastUpdateDate: string;
  fiDone: boolean;
  productionRemarks: string;
  actualGoodsReadyDate: string;
  cutting: SizeBreakdown;
  totalCutQuantity: number;
  fabricName: string;
  fabricSupplier: string;
  pricePerMetre: number;
  value: number;
}
export interface ProductionInward extends Base, SourceTrace {
  workOrderId: string;
  inwardDate: string;
  setwiseQuantity: number;
  mixPiecesQuantity: number;
  damagePiecesQuantity: number;
  totalInward: number;
  remarks: string;
}
export interface Brand extends Base, SourceTrace {
  name: string;
}
export interface ReferenceValue extends Base, SourceTrace {
  category: "production_status" | "order_status" | "fabric_for";
  value: string;
  active: boolean;
  sortOrder: number;
}
export interface ImportIssue extends Base {
  runId: string;
  sheet: string;
  rowNumber: number;
  severity: "warning" | "error";
  code: string;
  message: string;
  values: Record<string, unknown>;
  resolved: boolean;
}
export interface SyncRun extends Base {
  fileName: string;
  status: "preview" | "committed" | "failed";
  mode: "replace" | "sync";
  summary: Record<string, number>;
  sourceFingerprint: string;
  committedAt?: string;
  createdBy: string;
  payload?: string;
}
export interface SyncConflict extends Base {
  runId: string;
  kind: Kind;
  recordId?: string;
  sheet: string;
  rowNumber: number;
  field: string;
  baselineValue: unknown;
  portalValue: unknown;
  workbookValue: unknown;
  resolution?: "portal" | "workbook" | "archive";
}
export interface OperationalBackup extends Base {
  label: string;
  createdBy: string;
  counts: Record<string, number>;
  payload: string;
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
  organizations: Organization;
  people: Person;
  fabricSpecs: FabricSpec;
  fabricOrders: FabricOrder;
  fabricReceipts: FabricReceipt;
  transports: TransportMovement;
  challans: DeliveryChallan;
  workOrders: ProductionWorkOrder;
  inwards: ProductionInward;
  brands: Brand;
  referenceValues: ReferenceValue;
  importIssues: ImportIssue;
  syncRuns: SyncRun;
  syncConflicts: SyncConflict;
  operationalBackups: OperationalBackup;
  attachments: Attachment;
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
  organizations: Organization[];
  people: Person[];
  fabricSpecs: FabricSpec[];
  fabricOrders: FabricOrder[];
  fabricReceipts: FabricReceipt[];
  transports: TransportMovement[];
  challans: DeliveryChallan[];
  workOrders: ProductionWorkOrder[];
  inwards: ProductionInward[];
  brands: Brand[];
  referenceValues: ReferenceValue[];
  importIssues: ImportIssue[];
  syncRuns: SyncRun[];
  syncConflicts: SyncConflict[];
  operationalBackups: Array<Omit<OperationalBackup, "payload">>;
  attachments: Attachment[];
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
