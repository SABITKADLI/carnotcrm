import { NextResponse } from "next/server";
import { currentUser } from "@/lib/request";
import { state } from "@/lib/service";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  return NextResponse.json(state(user), {
    headers: { "Cache-Control": "no-store" },
  });
}
