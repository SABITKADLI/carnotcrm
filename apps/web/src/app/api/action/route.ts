import { NextResponse } from "next/server";
import {
  checkOrigin,
  currentUser,
  errorMessage,
  readBody,
} from "@/lib/request";
import { execute, state } from "@/lib/service";
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
    const body = await readBody(request);
    if (
      typeof body.action !== "string" ||
      typeof body.operationId !== "string" ||
      !body.input ||
      typeof body.input !== "object"
    )
      throw new Error("Invalid request");
    const result = execute(user, body.action, body.input, body.operationId);
    return NextResponse.json({ result, state: state(user) });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
