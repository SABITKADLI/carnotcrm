import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/request";
import { state } from "@/lib/service";
import { Workspace } from "@/components/workspace";
export const dynamic = "force-dynamic";
const views = [
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
];
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  if (!views.includes(view)) notFound();
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role === "tailor" && !["production", "settings"].includes(view))
    redirect("/production");
  return <Workspace key={view} view={view} initial={state(user)} />;
}
