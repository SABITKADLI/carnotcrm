import { NextResponse } from "next/server";
import { normalizeParties } from "@/lib/partner-normalization";
import {
  checkOrigin,
  currentUser,
  errorMessage,
  readBody,
} from "@/lib/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await currentUser();
    if (!user)
      return NextResponse.json(
        { error: "Sign in to continue" },
        { status: 401 },
      );
    if (user.role !== "admin")
      return NextResponse.json(
        { error: "Administrator access required" },
        { status: 403 },
      );
    await readBody(request);
    return NextResponse.json({ result: await normalizeParties() });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
