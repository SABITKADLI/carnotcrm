import { NextResponse } from "next/server";
import { checkSameOrigin, currentUser, errorMessage } from "@/lib/request";
import { previewWorkbook } from "@/lib/workbook";
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
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 20_000_000)
      throw new Error("Workbook must be smaller than 20 MB");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx"))
      throw new Error("Choose an XLSX workbook");
    if (file.size > 20_000_000)
      throw new Error("Workbook must be smaller than 20 MB");
    return NextResponse.json(
      await previewWorkbook(
        Buffer.from(await file.arrayBuffer()),
        file.name,
        user,
      ),
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
