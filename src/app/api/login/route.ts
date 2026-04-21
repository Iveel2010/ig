import { NextResponse } from "next/server";
import { readUsers, verifyPassword } from "../../../lib/users";
import { signToken, COOKIE_NAME, COOKIE_MAX_AGE } from "../../../lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = body.password;
    if (!email || !password) return NextResponse.json({ ok: false, error: "Missing credentials" }, { status: 400 });

    const users = await readUsers();
    const user = users.find((u: any) => String(u.email).toLowerCase() === email);
    if (!user) return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });

    const valid = verifyPassword(password, user.salt, user.passwordHash);
    if (!valid) return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });

    const token = signToken(user.id);
    const secure = process.env.NODE_ENV === "production";
    const cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure ? "; Secure" : ""}`;

    const safe = { id: user.id, username: user.username, email: user.email, ig: user.ig };
    return NextResponse.json({ ok: true, user: safe }, { status: 200, headers: { "Set-Cookie": cookie } });
  } catch (err) {
    console.error("login error", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
