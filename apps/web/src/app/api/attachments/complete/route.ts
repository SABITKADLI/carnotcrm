import { NextResponse } from "next/server";
import { z } from "zod";
import { attachmentTypes } from "@/lib/attachments";
import { audit } from "@/lib/service";
import { get, put, withStore } from "@/lib/db";
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
        attachmentId: z.string().regex(/^att_[a-f0-9-]+$/),
        entityKind: z.literal("fabricOrder"),
        entityId: z.string().min(1).max(160),
        fileName: z.string().trim().min(1).max(255),
        contentType: z.enum(attachmentTypes),
        sizeBytes: z.number().int().positive().max(10_000_000),
        s3Key: z.string().min(1).max(1000),
      })
      .parse(await readBody(request));
    const attachment = await withStore(() => {
      const order = get("fabricOrders", body.entityId);
      if (!body.s3Key.includes(`/${body.entityId}/${body.attachmentId}/`))
        throw new Error("Attachment key does not match this order");
      const value = put("attachments", {
        id: body.attachmentId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        entityKind: body.entityKind,
        entityId: body.entityId,
        fileName: body.fileName,
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
        s3Key: body.s3Key,
        uploadedBy: user.id,
      });
      audit(user, "Uploaded PO attachment", order.poNumber, body.fileName);
      return value;
    });
    return NextResponse.json({ attachment });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
