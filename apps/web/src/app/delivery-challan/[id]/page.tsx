import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/request";
import { all, get, withStore } from "@/lib/db";
import { shortDate, type DeliveryChallan } from "@/lib/types";
import { PrintButton } from "@/components/print-button";
export const dynamic = "force-dynamic";
export default async function DeliveryChallanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const challan = await withStore(() => {
    let value: DeliveryChallan;
    try {
      value = get("challans", id);
    } catch {
      notFound();
    }
    const allowed =
      user.role === "admin" ||
      value.jobworkerId === user.partnerId ||
      all("transports").some(
        (movement) =>
          movement.challanId === value.id &&
          [movement.transporterId, movement.pickedByPersonId].includes(
            user.partnerId,
          ),
      );
    if (!allowed) notFound();
    return value;
  });
  const totalQuantity = challan.lines.reduce(
    (sum, line) => sum + line.quantityMetres,
    0,
  );
  const totalBundles = challan.lines.reduce(
    (sum, line) => sum + line.bundles,
    0,
  );
  return (
    <>
      <div className="invoice-tools">
        <Link href="/transport-dc" className="button secondary">
          ← Back to Transport &amp; DC
        </Link>
        <PrintButton />
      </div>
      <article className="challan-document">
        <header className="challan-header">
          <div>
            <span className="challan-kicker">DELIVERY CHALLAN</span>
            <h1>{challan.issuer.name}</h1>
            <p>{challan.issuer.address}</p>
            <p>
              <strong>GSTIN:</strong> {challan.issuer.taxId}
            </p>
            <p>
              {challan.issuer.email} · {challan.issuer.phone}
            </p>
          </div>
          <div className="challan-number">
            <span>CHALLAN NO.</span>
            <strong>{challan.number}</strong>
            <span>DATE</span>
            <strong>{shortDate(challan.issueDate)}</strong>
          </div>
        </header>
        <section className="challan-grid">
          <div>
            <span>CONSIGNEE / JOBWORKER</span>
            <h2>{challan.consignee.name}</h2>
            <p>{challan.consignee.address || "Address to be confirmed"}</p>
            {challan.consignee.taxId && <p>GSTIN: {challan.consignee.taxId}</p>}
          </div>
          <div>
            <span>TRANSPORT DETAILS</span>
            <p>
              <strong>Transport:</strong> {challan.transportName || "—"}
            </p>
            <p>
              <strong>Driver / pickup:</strong> {challan.driverName || "—"}
            </p>
            <p>
              <strong>LR number:</strong> {challan.lrNumber || "—"}
            </p>
          </div>
        </section>
        <table className="challan-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Fabric / trade name</th>
              <th>Quantity (m)</th>
              <th>Transport</th>
              <th>LR number</th>
              <th>Bundles</th>
            </tr>
          </thead>
          <tbody>
            {challan.lines.map((line, index) => (
              <tr key={line.id}>
                <td>{index + 1}</td>
                <td>
                  <strong>{line.fabricName}</strong>
                </td>
                <td>
                  {line.quantityMetres.toLocaleString("en-IN", {
                    maximumFractionDigits: 3,
                  })}
                </td>
                <td>{line.transportName}</td>
                <td>{line.lrNumber}</td>
                <td>{line.bundles}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>
                <strong>TOTAL</strong>
              </td>
              <td>
                <strong>
                  {totalQuantity.toLocaleString("en-IN", {
                    maximumFractionDigits: 3,
                  })}
                </strong>
              </td>
              <td colSpan={2}></td>
              <td>
                <strong>{totalBundles}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
        <section className="challan-purpose">
          <span>PURPOSE OF MOVEMENT</span>
          <p>{challan.purpose}</p>
        </section>
        <section className="challan-terms">
          <span>TERMS &amp; DECLARATION</span>
          <p>{challan.terms}</p>
          {challan.remarks && (
            <p>
              <strong>Remarks:</strong> {challan.remarks}
            </p>
          )}
        </section>
        <footer className="challan-signatures">
          <div>
            <span>RECEIVED BY</span>
            <div className="signature-line" />
            <p>Name, date and signature</p>
          </div>
          <div>
            <span>FOR {challan.issuer.name.toUpperCase()}</span>
            <div className="signature-line" />
            <p>Authorised signatory</p>
          </div>
        </footer>
      </article>
    </>
  );
}
