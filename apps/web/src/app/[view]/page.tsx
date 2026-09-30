import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/request";
import { state } from "@/lib/service";
import { Workspace } from "@/components/workspace";
export const dynamic = "force-dynamic";
const views = [
  "overview",
  "master-data",
  "fabric-orders",
  "transport-dc",
  "cleared-lots",
  "workbook-sync",
  "orders",
  "cutting",
  "production",
  "garment-production",
  "fabrics",
  "purchases",
  "products",
  "customers",
  "suppliers",
  "invoices",
  "reports",
  "activity",
  "settings",
];
export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ view: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { view } = await params;
  if (!views.includes(view)) notFound();
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") {
    const allowed: Record<string, string[]> = {
      supplier: ["fabric-orders", "transport-dc", "settings"],
      agent: ["fabric-orders", "settings"],
      transporter: ["transport-dc", "settings"],
      delivery: ["transport-dc", "settings"],
      jobworker: ["transport-dc", "production", "cleared-lots", "settings"],
      tailor: ["transport-dc", "production", "cleared-lots", "settings"],
      distributor: ["fabric-orders", "transport-dc", "settings"],
    };
    if (!(allowed[user.role] || []).includes(view))
      redirect(`/${allowed[user.role]?.[0] || "settings"}`);
  }
  const rawFilters = await searchParams;
  const initialFilters = Object.fromEntries(
    Object.entries(rawFilters).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
  return (
    <Workspace
      key={view}
      view={view}
      initial={await state(user)}
      initialFilters={initialFilters}
    />
  );
}
