import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/request";
import { INITIALIZED_COOKIE, isDemo } from "@/lib/auth";
import { hasUsers, seedDemo } from "@/lib/seed";
import { Login } from "@/components/login";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  if (isDemo()) seedDemo();
  const initialized =
    (await cookies()).get(INITIALIZED_COOKIE)?.value === "true" || hasUsers();
  return <Login demo={isDemo()} initialized={initialized} />;
}
