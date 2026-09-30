import { currentUser } from "@/lib/request";
import { exportWorkbook } from "@/lib/workbook";
import { withStore } from "@/lib/db";
export const runtime = "nodejs";
export async function GET() {
  const user = await currentUser();
  if (!user || user.role !== "admin")
    return new Response("Administrator access required", {
      status: user ? 403 : 401,
    });
  const buffer = await withStore(() => exportWorkbook());
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Carnot-Fabric-Tracker-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
