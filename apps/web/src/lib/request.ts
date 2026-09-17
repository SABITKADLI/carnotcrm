import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionUser } from "./auth";
export async function currentUser() {
  return sessionUser((await cookies()).get(SESSION_COOKIE)?.value);
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const expected = process.env.CRM_PUBLIC_URL
    ? new URL(process.env.CRM_PUBLIC_URL).origin
    : `${url.protocol}//${request.headers.get("host") || url.host}`;
  if (!origin || origin !== expected)
    throw new Error("Request origin is not allowed");
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new Error("JSON request required");
}
export async function readBody(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 200_000)
    throw new Error("Request too large");
  const raw = await request.text();
  if (raw.length > 200_000) throw new Error("Request too large");
  return JSON.parse(raw);
}
export function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (
      error as { issues: { path: (string | number)[]; message: string }[] }
    ).issues;
    return issues
      .map((i) => `${i.path.join(".") || "Input"}: ${i.message}`)
      .join("; ");
  }
  return error instanceof Error ? error.message : "Something went wrong";
}
