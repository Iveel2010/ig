import { NextResponse } from "next/server";
import { readUsers } from "../../../lib/users";
import { verifyToken, COOKIE_NAME } from "../../../lib/auth";

function getCookieFromReq(req: Request, name: string) {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const parts = cookie.split(";").map((p) => p.trim());
  for (const p of parts) {
    const [k, ...v] = p.split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const token = getCookieFromReq(req, COOKIE_NAME);
    if (!token) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    const verified = verifyToken(token);
    if (!verified.ok) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
    const userId = verified.payload.sub;

    // Handle special admin ID
    if (userId === "admin") {
      const adminEmail = process.env.ADMIN_EMAIL || "admin@ometv.com";
      return NextResponse.json({ 
        ok: true, 
        user: { id: "admin", username: "Administrator", email: adminEmail, role: "admin" } 
      }, { status: 200 });
    }

    const users = await readUsers();
    const user = users.find((u: any) => u.id === userId);
    if (!user) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    const safe = { id: user.id, username: user.username, email: user.email, ig: user.ig };
    return NextResponse.json({ ok: true, user: safe }, { status: 200 });
  } catch (err) {
    console.error("me error", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
