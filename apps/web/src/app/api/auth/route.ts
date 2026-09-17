import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  isDemo,
  login,
  logout,
  SESSION_COOKIE,
  startSession,
  users,
} from "@/lib/auth";
import { seedDemo } from "@/lib/seed";
import { checkOrigin, errorMessage, readBody } from "@/lib/request";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = await readBody(request);
    const jar = await cookies();
    if (body.action === "logout") {
      logout(jar.get(SESSION_COOKIE)?.value);
      jar.delete(SESSION_COOKIE);
      return NextResponse.json({ success: true });
    }
    let token: string;
    if (body.action === "demo") {
      if (!isDemo())
        return NextResponse.json(
          { error: "Demo access is disabled" },
          { status: 403 },
        );
      seedDemo();
      const user = users().find(
        (u) =>
          u.email ===
          (body.role === "tailor" ? "meera@carnot.demo" : "admin@carnot.demo"),
      );
      if (!user?.active) throw new Error("Demo account unavailable");
      token = startSession(user.id);
    } else {
      if (
        typeof body.email !== "string" ||
        body.email.length > 254 ||
        typeof body.password !== "string" ||
        body.password.length > 128
      )
        throw new Error("Invalid credentials");
      token = login(body.email, body.password);
    }
    jar.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 43200,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
