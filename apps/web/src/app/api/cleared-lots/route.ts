import { NextResponse } from "next/server";
import { currentUser } from "@/lib/request";
import { paginated } from "@/lib/operations";
export async function GET(request: Request) {
  const user = await currentUser();
  return user
    ? NextResponse.json(await paginated(user, "clearedLots", request.url))
    : NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
}
