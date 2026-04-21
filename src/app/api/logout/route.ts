import { NextResponse } from "next/server";
import { COOKIE_NAME } from "../../../lib/auth";

export async function POST() {
  try {
    const cookie = `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`;
    return NextResponse.json({ ok: true }, { status: 200, headers: { "Set-Cookie": cookie } });
  } catch (err) {
    console.error("logout error", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
