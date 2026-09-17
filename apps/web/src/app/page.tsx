import { redirect } from "next/navigation";
import { currentUser } from "@/lib/request";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await currentUser();
  redirect(
    user ? (user.role === "tailor" ? "/production" : "/overview") : "/login",
  );
}
