import { NextResponse } from "next/server";
import { signToken, COOKIE_NAME, COOKIE_MAX_AGE } from "../../../lib/auth";
import {
  readUsers,
  writeUsers,
  validateEmail,
  validateUsername,
  generateSalt,
  hashPassword,
} from "../../../lib/users";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const username = body.username?.trim();
    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    const ig = body.ig?.trim() || null;

    const errors: Record<string, string> = {};

    if (!username || !validateUsername(username)) {
      errors.username =
        "Username must be at least 3 characters and contain only letters, numbers, or underscore";
    }
    if (!email || !validateEmail(email)) {
      errors.email = "Invalid email address";
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      errors.password = "Password must be at least 8 characters";
    }

    if (Object.keys(errors).length) {
      return NextResponse.json({ ok: false, errors }, { status: 400 });
    }

    const users = await readUsers();
    if (users.find((u: any) => u.email === email)) {
      return NextResponse.json({ ok: false, error: "Email already registered" }, { status: 409 });
    }
    if (users.find((u: any) => String(u.username).toLowerCase() === String(username).toLowerCase())) {
      return NextResponse.json({ ok: false, error: "Username already taken" }, { status: 409 });
    }

    const salt = generateSalt();
    const hash = hashPassword(password, salt);
    const id = typeof (global as any).crypto?.randomUUID === "function" ? (global as any).crypto.randomUUID() : generateSalt();

    const user = {
      id,
      username,
      email,
      ig,
      salt,
      passwordHash: hash,
      createdAt: new Date().toISOString(),
    };

    users.push(user);
    await writeUsers(users);

    // Auto-login after signup
    const token = signToken(user.id);
    const secure = process.env.NODE_ENV === "production";
    const cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure ? "; Secure" : ""}`;

    const safe = { id: user.id, username: user.username, email: user.email, ig: user.ig, createdAt: user.createdAt };
    return NextResponse.json({ ok: true, user: safe }, { status: 201, headers: { "Set-Cookie": cookie } });
  } catch (err) {
    console.error("signup error", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
