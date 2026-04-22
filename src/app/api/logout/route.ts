import { NextResponse } from "next/server";
import { COOKIE_NAME } from "../../../lib/auth";

export async function POST() {
  const response = NextResponse.json(
    { ok: true, message: "Logged out successfully" },
    { status: 200 }
  );

  // Clear the session cookie by setting Max-Age to 0
  response.headers.set(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );

  return response;
}
