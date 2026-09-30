import { redirect } from "next/navigation";
import { currentUser } from "@/lib/request";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const home: Record<string, string> = {
    supplier: "/fabric-orders",
    agent: "/fabric-orders",
    transporter: "/transport-dc",
    delivery: "/transport-dc",
    jobworker: "/production",
    tailor: "/production",
    distributor: "/fabric-orders",
  };
  redirect(
    user.role === "admin" ? "/overview" : home[user.role] || "/settings",
  );
}
