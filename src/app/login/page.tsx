"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validateEmail(e: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validateEmail(email)) {
      setError("Enter a valid email");
      return;
    }
    if (!password) {
      setError("Enter your password");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || "Login failed");
        setLoading(false);
        return;
      }
      // success -> go to dashboard
      router.push("/dashboard");
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md card p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-5 text-center">
          <div className="flex justify-center mb-3">
            <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
              <div className="h-6 w-6 bg-white rounded-full"></div>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white">Welcome Back</h2>
          <p className="text-blue-100 text-sm mt-1">Sign in to continue your video chats</p>
        </div>
        
        {/* Form */}
        <div className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input w-full"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input w-full"
                placeholder="Enter your password"
              />
            </div>
            
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md">
                <div className="text-red-400 text-sm flex items-center gap-2">
                  <div className="h-2 w-2 bg-red-400 rounded-full"></div>
                  {error}
                </div>
              </div>
            )}
            
            <button 
              type="submit" 
              disabled={loading} 
              className="btn-primary w-full py-3 font-semibold"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  Signing in...
                </div>
              ) : "Sign in"}
            </button>
            
            <div className="text-center pt-4 border-t border-gray-700/50 mt-4">
              <p className="text-sm text-gray-400">
                Don't have an account?{" "}
                <a 
                  href="/signup" 
                  className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                >
                  Create account
                </a>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
