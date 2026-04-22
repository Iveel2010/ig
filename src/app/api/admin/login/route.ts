import { NextResponse } from "next/server";
import { signToken, COOKIE_NAME, COOKIE_MAX_AGE } from "../../../../lib/auth";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@ometv.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = body.password;

    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      // For admin, we use a special ID "admin"
      const token = signToken("admin");
      const secure = process.env.NODE_ENV === "production";
      const cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure ? "; Secure" : ""}`;

      return NextResponse.json(
        { ok: true, user: { id: "admin", username: "Administrator", email: ADMIN_EMAIL, role: "admin" } },
        { status: 200, headers: { "Set-Cookie": cookie } }
      );
    }

    return NextResponse.json({ ok: false, error: "Invalid admin credentials" }, { status: 401 });
  } catch (err) {
    console.error("admin login error", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
