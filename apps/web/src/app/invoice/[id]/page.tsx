import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/request";
import { all, get, settings } from "@/lib/db";
import { money, shortDate, type Invoice } from "@/lib/types";
import { PrintButton } from "@/components/print-button";
export const dynamic = "force-dynamic";
export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") notFound();
  const { id } = await params;
  let invoice: Invoice;
  try {
    invoice = get("invoices", id);
  } catch {
    notFound();
  }
  const payments = all("payments").filter((p) => p.invoiceId === id);
  const config = settings();
  return (
    <>
      <div className="invoice-tools">
        <Link href="/invoices" className="button secondary">
          ← Back to billing
        </Link>
        <PrintButton />
      </div>
      <article className="invoice-document">
        <header>
          <div>
            <span className="wordmark">
              {invoice.companyName.toLowerCase()}
            </span>
            <p className="muted">Fabric to finished</p>
          </div>
          <div>
            <span className="eyebrow">INVOICE</span>
            <h1>{invoice.number}</h1>
            <p>Issued {shortDate(invoice.createdAt)}</p>
            <p>Payment due {shortDate(invoice.dueDate)}</p>
          </div>
        </header>
        <div className="invoice-parties">
          <div>
            <span className="eyebrow">FROM</span>
            <h3>{invoice.companyName}</h3>
            <p>{invoice.companyAddress}</p>
            {invoice.companyTaxId && <p>Tax ID: {invoice.companyTaxId}</p>}
          </div>
          <div>
            <span className="eyebrow">BILL TO</span>
            <h3>{invoice.customerName}</h3>
            <p>{invoice.customerAddress}</p>
            {invoice.customerTaxId && <p>Tax ID: {invoice.customerTaxId}</p>}
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Unit price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line, i) => (
                <tr key={i}>
                  <td>{line.description}</td>
                  <td>
                    {line.quantity} {line.unit}
                  </td>
                  <td>{money(line.price, invoice.currency)}</td>
                  <td>{money(line.total, invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="invoice-totals">
          <div>
            <span>Subtotal</span>
            <span>{money(invoice.subtotal, invoice.currency)}</span>
          </div>
          <div>
            <span>Discount</span>
            <span>−{money(invoice.discount, invoice.currency)}</span>
          </div>
          <div>
            <span>Tax ({invoice.taxRate}%)</span>
            <span>{money(invoice.tax, invoice.currency)}</span>
          </div>
          <div>
            <strong>Invoice total</strong>
            <strong>{money(invoice.total, invoice.currency)}</strong>
          </div>
          <div>
            <span>Paid</span>
            <span>{money(invoice.paid, invoice.currency)}</span>
          </div>
          <div>
            <strong>Balance due</strong>
            <strong>
              {money(invoice.total - invoice.paid, invoice.currency)}
            </strong>
          </div>
        </div>
        {payments.length > 0 && (
          <section>
            <h3>Payments received</h3>
            {payments.map((p) => (
              <p key={p.id} className="footnote">
                {shortDate(p.date)} · {p.method} · {p.reference} ·{" "}
                {money(p.amount, invoice.currency)}
              </p>
            ))}
          </section>
        )}
        {invoice.notes && <p className="preserve-text">{invoice.notes}</p>}
        {config.paymentDetails && (
          <>
            <span className="eyebrow">PAYMENT DETAILS</span>
            <p className="preserve-text">{config.paymentDetails}</p>
          </>
        )}
        <p className="footnote">
          Thank you for making with {invoice.companyName}.
        </p>
      </article>
    </>
  );
}
