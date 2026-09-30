import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { get, withStore } from "@/lib/db";
import {
  attachmentTypes,
  MAX_ATTACHMENT_BYTES,
  presignAttachmentUpload,
} from "@/lib/attachments";
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
    if (!user) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
    if (user.role !== "admin")
      return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
    const body = z
      .object({
        entityKind: z.literal("fabricOrder"),
        entityId: z.string().min(1).max(160),
        fileName: z.string().trim().min(1).max(255),
        contentType: z.enum(attachmentTypes),
        sizeBytes: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
      })
      .parse(await readBody(request));
    await withStore(() => get("fabricOrders", body.entityId));
    const attachmentId = `att_${randomUUID()}`;
    return NextResponse.json({
      attachmentId,
      ...(await presignAttachmentUpload({ attachmentId, ...body })),
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
