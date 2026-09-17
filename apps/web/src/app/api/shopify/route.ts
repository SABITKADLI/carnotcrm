import { NextResponse } from "next/server";
import {
  checkOrigin,
  currentUser,
  errorMessage,
  readBody,
} from "@/lib/request";
import { sendToShopify } from "@/lib/shopify";
import { state } from "@/lib/service";
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
    const { input } = await readBody(request);
    if (
      typeof input?.id !== "string" ||
      !["Draft listing", "Publish with stock"].includes(input.mode)
    )
      throw new Error("Choose a product and publishing action");
    await sendToShopify(
      user,
      input.id,
      input.mode === "Publish with stock",
      Number(input.quantity),
    );
    return NextResponse.json({ state: state(user) });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
