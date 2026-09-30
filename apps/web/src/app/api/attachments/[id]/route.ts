import { NextResponse } from "next/server";
import { audit } from "@/lib/service";
import { get, put, withStore } from "@/lib/db";
import { checkSameOrigin, currentUser, errorMessage } from "@/lib/request";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkSameOrigin(request);
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
    if (user.role !== "admin")
      return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
    const { id } = await params;
    const attachment = await withStore(() => {
      const item = get("attachments", id);
      const order = get("fabricOrders", item.entityId);
      const value = put("attachments", {
        ...item,
        deletedAt: new Date().toISOString(),
      });
      audit(user, "Removed PO attachment", order.poNumber, item.fileName);
      return value;
    });
    return NextResponse.json({ attachment });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
