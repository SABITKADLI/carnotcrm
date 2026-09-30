import { NextResponse } from "next/server";
import { get, withStore } from "@/lib/db";
import { presignAttachmentDownload } from "@/lib/attachments";
import { currentUser, errorMessage } from "@/lib/request";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
    const { id } = await params;
    const attachment = await withStore(() => {
      const item = get("attachments", id);
      if (item.deletedAt) throw new Error("Attachment not found");
      const order = get("fabricOrders", item.entityId);
      const partnerName = user.partnerId
        ? get("organizations", user.partnerId).name.toLowerCase()
        : "";
      const allowed =
        user.role === "admin" ||
        (user.role === "supplier" && order.supplierId === user.partnerId) ||
        (user.role === "agent" && order.agentId === user.partnerId) ||
        (user.role === "distributor" &&
          ((order.partyIds || []).includes(user.partnerId || "") ||
            (!!partnerName && order.purposeParty.toLowerCase().includes(partnerName))));
      if (!allowed) throw new Error("You do not have access to this attachment");
      return item;
    });
    return NextResponse.redirect(await presignAttachmentDownload(attachment.s3Key));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
