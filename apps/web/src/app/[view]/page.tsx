import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/request";
import { state } from "@/lib/service";
import { Workspace } from "@/components/workspace";
import { canAccessView, homeForRole, VALID_APP_VIEWS } from "@/lib/access";
export const dynamic = "force-dynamic";
export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ view: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { view } = await params;
  if (!VALID_APP_VIEWS.includes(view as (typeof VALID_APP_VIEWS)[number]))
    notFound();
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canAccessView(user.role, view)) redirect(`/${homeForRole(user.role)}`);
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
