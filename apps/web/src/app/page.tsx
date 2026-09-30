import { redirect } from "next/navigation";
import { currentUser } from "@/lib/request";
import { homeForRole } from "@/lib/access";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  redirect(`/${homeForRole(user.role)}`);
}
