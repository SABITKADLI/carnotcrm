import { NextResponse } from "next/server";
import { processPaidWebhook } from "@/lib/shopify";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 2_000_000)
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length > 2_000_000)
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  try {
    return NextResponse.json(processPaidWebhook(raw, request.headers));
  } catch {
    return NextResponse.json(
      { error: "Webhook rejected or requires reconciliation" },
      { status: 400 },
    );
  }
}
