import { NextResponse } from "next/server";
import {
  checkOrigin,
  currentUser,
  errorMessage,
  readBody,
} from "@/lib/request";
import { commitWorkbook } from "@/lib/workbook";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    checkOrigin(request);
    await readBody(request);
    const user = await currentUser();
    if (!user)
      return NextResponse.json(
        { error: "Sign in to continue" },
        { status: 401 },
      );
    const { runId } = await params;
    return NextResponse.json(await commitWorkbook(runId, user));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
