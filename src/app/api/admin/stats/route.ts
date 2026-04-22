import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "../../../../lib/auth";
import { readUsers } from "../../../../lib/users";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;

    if (!token) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { ok, payload } = verifyToken(token);
    if (!ok || payload.sub !== "admin") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const users = await readUsers();

    return NextResponse.json({
      ok: true,
      stats: {
        totalUsers: users.length,
        activeUsers: users.length, // In a real app, this would be based on recent activity
        reports: 0, // Placeholder
        serverStatus: "Online",
        lastBackup: new Date().toISOString()
      },
      users: users.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        ig: u.ig,
        createdAt: u.createdAt
      }))
    });
  } catch (err) {
    console.error("admin stats error", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
