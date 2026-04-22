"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

const SIGNALING_URL = "ws://localhost:8082";

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  reports: number;
  serverStatus: string;
  lastBackup: string;
}

interface User {
  id: string;
  username: string;
  email: string;
  ig: string;
  createdAt: string;
}

interface ActiveUser {
  id: string;
  name: string;
  status: "available" | "busy";
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adminUser, setAdminUser] = useState<any>(null);
  const router = useRouter();

  // WebSocket for real-time monitoring
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    fetchStats();
    checkAdmin();

    // Connect to signaling server for real-time monitoring
    const ws = new WebSocket(SIGNALING_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      // Identify as admin
      ws.send(
        JSON.stringify({
          type: "identify",
          role: "admin",
          name: "Administrator",
        }),
      );
      // Initial request for active users
      ws.send(JSON.stringify({ type: "list-active" }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "active-users") {
          setActiveUsers(data.users);
        }
      } catch (e) {
        console.error("WS error", e);
      }
    };

    ws.onclose = () => setWsConnected(false);

    // Refresh active users every 5 seconds
    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "list-active" }));
      }
    }, 5000);

    return () => {
      ws.close();
      clearInterval(interval);
    };
  }, []);

  const checkAdmin = async () => {
    try {
      const res = await fetch("/api/me");
      const data = await res.json();
      if (data.ok && data.user.role === "admin") {
        setAdminUser(data.user);
      } else {
        router.push("/admin/login");
      }
    } catch (err) {
      router.push("/admin/login");
    }
  };

  const handleCallUser = (userId: string) => {
    // Redirect to home page with a special parameter to initiate a call
    router.push(`/?call=${userId}`);
  };

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/admin/stats");
      const data = await res.json();
      if (data.ok) {
        setStats(data.stats);
        setUsers(data.users);
      } else {
        router.push("/admin/login");
      }
    } catch (err) {
      setError("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b1220] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      {/* Sidebar/Header */}
      <nav className="border-b border-white/5 bg-white/2 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <span className="font-bold tracking-tight">Admin Dashboard</span>
          </div>
          <button
            onClick={() => router.push("/")}
            className="text-xs font-bold text-gray-400 hover:text-white transition-colors flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/5 hover:bg-white/5"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to App
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Platform Overview</h1>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <StatCard
            title="Total Registered"
            value={stats?.totalUsers || 0}
            icon={
              <svg
                className="w-6 h-6 text-blue-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            }
            label="Lifetime users"
          />
          <StatCard
            title="Active Now"
            value={stats?.activeUsers || 0}
            icon={
              <svg
                className="w-6 h-6 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            }
            label="In video chat"
            pulse
          />
          <StatCard
            title="Reports"
            value={stats?.reports || 0}
            icon={
              <svg
                className="w-6 h-6 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            }
            label="Flagged users"
          />
          <StatCard
            title="Server"
            value={stats?.serverStatus || "Offline"}
            icon={
              <svg
                className="w-6 h-6 text-amber-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
                />
              </svg>
            }
            label="System health"
          />
        </div>

        {/* Real-time Monitoring & User Management */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Active Users - Real-time Monitoring */}
          <div className="lg:col-span-1">
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl h-full p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${wsConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
                  />
                  Live Users
                </h2>
                <span className="text-xs text-gray-400 bg-white/5 px-2 py-1 rounded-full uppercase tracking-wider font-bold">
                  {activeUsers.length} Online
                </span>
              </div>

              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {activeUsers.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p>No active users currently</p>
                  </div>
                ) : (
                  activeUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:border-blue-500/30 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-white/10 group-hover:border-blue-500/50 transition-colors">
                          <span className="text-sm font-bold text-blue-400">
                            {user.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-200">
                            {user.name}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div
                              className={`w-1.5 h-1.5 rounded-full ${user.status === "available" ? "bg-green-500" : "bg-amber-500"}`}
                            />
                            <span className="text-[10px] uppercase font-bold tracking-widest text-gray-500">
                              {user.status}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleCallUser(user.id)}
                        className="p-2.5 rounded-lg bg-blue-600/10 text-blue-500 hover:bg-blue-600 hover:text-white transition-all transform hover:scale-110 active:scale-95 shadow-lg shadow-blue-500/10"
                        title="Call User"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* User Database Table */}
          <div className="lg:col-span-2">
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl h-full">
              <div className="p-6 border-b border-white/10">
                <h2 className="text-xl font-bold">User Management</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-white/[0.02] text-xs font-bold text-gray-400 uppercase tracking-wider">
                      <th className="px-6 py-4">User</th>
                      <th className="px-6 py-4">Instagram</th>
                      <th className="px-6 py-4">Registered</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {users.map((user) => (
                      <tr
                        key={user.id}
                        className="hover:bg-white/[0.02] transition-colors group"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-xs font-bold">
                              {user.username[0].toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-white group-hover:text-blue-400 transition-colors">
                                {user.username}
                              </div>
                              <div className="text-xs text-gray-500">
                                {user.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-400">
                          {user.ig}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button className="text-xs font-bold text-red-500 hover:text-red-400 px-3 py-1.5 rounded-lg border border-red-500/10 hover:bg-red-500/10 transition-all">
                            Ban User
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ title, value, icon, label, pulse }: any) {
  return (
    <div className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-xl relative overflow-hidden group">
      <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
        {React.cloneElement(icon, { className: "w-24 h-24" })}
      </div>
      <div className="flex items-center justify-between mb-4">
        <div className="p-2 bg-white/5 rounded-xl border border-white/10">
          {icon}
        </div>
        {pulse && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-500/10 rounded-full border border-green-500/20">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-green-500 uppercase tracking-tighter">
              Live
            </span>
          </div>
        )}
      </div>
      <div className="text-2xl font-black text-white mb-1">{value}</div>
      <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">
        {title}
      </div>
      <div className="mt-4 text-[10px] text-gray-600 font-medium italic">
        {label}
      </div>
    </div>
  );
}
