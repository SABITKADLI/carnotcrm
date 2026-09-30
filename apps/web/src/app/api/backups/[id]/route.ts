import { gunzipSync } from "node:zlib";
import { currentUser } from "@/lib/request";
import { get, withStore } from "@/lib/db";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user || user.role !== "admin")
    return new Response("Administrator access required", {
      status: user ? 403 : 401,
    });
  const { id } = await params;
  const backup = await withStore(() => get("operationalBackups", id));
  const content = gunzipSync(Buffer.from(backup.payload, "base64"));
  return new Response(new Uint8Array(content), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="carnot-operational-backup-${backup.createdAt.slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
