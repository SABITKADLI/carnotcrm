import { NextResponse } from "next/server";
import { currentUser } from "@/lib/request";
import { state } from "@/lib/service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  const includeOperations =
    new URL(request.url).searchParams.get("scope") === "full";
  return NextResponse.json(await state(user, includeOperations), {
    headers: { "Cache-Control": "no-store" },
  });
}
