"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function fetchMe() {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const json = await res.json();
        if (json?.ok) {
          if (mounted) setUser(json.user);
        } else {
          router.replace("/login");
        }
      } catch (e) {
        console.error(e);
        router.replace("/login");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchMe();
    return () => {
      mounted = false;
    };
  }, [router]);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
  }

  if (loading) return <div className="p-6 text-center text-white">Loading…</div>;

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-gray-900 to-black text-white">
      <div className="max-w-3xl mx-auto bg-gray-800/40 p-6 rounded border border-gray-700">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <div className="flex items-center gap-2">
            <button onClick={logout} className="px-3 py-1 rounded bg-red-600 hover:bg-red-500">Sign out</button>
          </div>
        </div>

        {user ? (
          <div className="mt-4 space-y-2">
            <div>Username: <span className="font-mono">{user.username}</span></div>
            <div>Email: <span className="font-mono">{user.email}</span></div>
            <div>IG: <span className="font-mono">{user.ig || '—'}</span></div>
            <div className="mt-3">Protected content goes here.</div>
          </div>
        ) : (
          <div className="mt-4 text-gray-300">Not signed in.</div>
        )}
      </div>
    </div>
  );
}
