import { redirect } from "next/navigation";
import { currentUser } from "@/lib/request";
import { isDemo } from "@/lib/auth";
import { hasUsers, seedDemo } from "@/lib/seed";
import { Login } from "@/components/login";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  if (isDemo()) seedDemo();
  return <Login demo={isDemo()} initialized={hasUsers()} />;
}
