import { NextResponse } from "next/server";
import { checkSameOrigin, currentUser, errorMessage } from "@/lib/request";
import { resetWorkbookOperations } from "@/lib/workbook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    checkSameOrigin(request);
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
    return NextResponse.json(await resetWorkbookOperations(user));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
