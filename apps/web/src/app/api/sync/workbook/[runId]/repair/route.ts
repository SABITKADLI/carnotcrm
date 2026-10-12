import { NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin, currentUser, errorMessage, readBody } from "@/lib/request";
import { repairWorkbookPreview } from "@/lib/workbook";

export const runtime = "nodejs";

const schema = z.object({
  repairs: z.array(
    z.object({
      sheet: z.enum(["MASTER DATA", "FABRIC ORDERS", "TRANSPORT", "PRODUCTION", "CLEARED LOTS"]),
      rowNumber: z.number().int().positive(),
      fields: z.record(z.string().max(80), z.string().max(500)),
    }),
  ).min(1).max(1000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await currentUser();
    if (!user)
      return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
    const { runId } = await params;
    const body = schema.parse(await readBody(request));
    return NextResponse.json(await repairWorkbookPreview(runId, body.repairs, user));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
