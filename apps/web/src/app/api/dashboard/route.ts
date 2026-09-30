import { NextResponse } from "next/server";
import { currentUser, errorMessage } from "@/lib/request";
import { dashboard } from "@/lib/operations";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await currentUser();
    if (!user)
      return NextResponse.json(
        { error: "Sign in to continue" },
        { status: 401 },
      );
    const fy = new URL(request.url).searchParams.get("fy") || "2026-27";
    return NextResponse.json(await dashboard(user, fy), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
