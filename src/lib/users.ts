import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const DATA_FILE = path.join(process.cwd(), "data", "users.json");

export async function readUsers(): Promise<any[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}

export async function writeUsers(users: any[]) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(users, null, 2), "utf8");
}

export function validateEmail(email: any) {
  if (typeof email !== "string") return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function validateUsername(username: any) {
  if (typeof username !== "string") return false;
  return username.length >= 3 && /^[a-zA-Z0-9_]+$/.test(username);
}

export function generateSalt() {
  return crypto.randomBytes(16).toString("hex");
}

export function hashPassword(password: string, salt: string) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

export function verifyPassword(password: string, salt: string, expectedHash: string) {
  const calc = hashPassword(password, salt);
  try {
    const a = Buffer.from(calc, "hex");
    const b = Buffer.from(expectedHash, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}
