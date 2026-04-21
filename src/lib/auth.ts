import crypto from "crypto";

const SECRET = process.env.SESSION_SECRET || "dev-session-secret-change";
export const COOKIE_NAME = "session";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

function base64UrlEncode(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64");
}

export function signToken(userId: string) {
  const header = { alg: "HS256", typ: "JWT" };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + COOKIE_MAX_AGE;
  const payload = { sub: userId, iat, exp };
  const base = `${base64UrlEncode(Buffer.from(JSON.stringify(header)))}.${base64UrlEncode(Buffer.from(JSON.stringify(payload)))}`;
  const sig = base64UrlEncode(crypto.createHmac("sha256", SECRET).update(base).digest());
  return `${base}.${sig}`;
}

export function verifyToken(token: string) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, error: "invalid_format" };
    const [h, p, s] = parts;
    const base = `${h}.${p}`;
    const expectedSig = base64UrlEncode(crypto.createHmac("sha256", SECRET).update(base).digest());
    const a = Buffer.from(s);
    const b = Buffer.from(expectedSig);
    // constant time compare
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, error: "invalid_signature" };
    const payloadBuf = base64UrlDecode(p);
    const payload = JSON.parse(payloadBuf.toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return { ok: false, error: "expired" };
    return { ok: true, payload };
  } catch (e) {
    return { ok: false, error: "exception" };
  }
}
