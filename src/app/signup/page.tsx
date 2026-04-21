"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignUpPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ig, setIg] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (usernameError || emailError || passwordError || confirmError) {
      setError("Fix the highlighted fields before submitting");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password, ig }),
      });
      const json = await res.json();
      if (!res.ok) {
        const errMsg =
          json?.error ||
          (json?.errors
            ? Object.values(json.errors).join("; ")
            : "Signup failed");
        setError(errMsg);
        setLoading(false);
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push("/"), 1200);
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function passwordStrength(pw: string) {
    let score = 0;
    if (!pw) return { score: 0, label: "", color: "bg-gray-600" };
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    score = Math.min(4, Math.max(0, score - 1));
    const labels = ["Very weak", "Weak", "Okay", "Good", "Strong"];
    const colors = [
      "bg-red-500",
      "bg-orange-500",
      "bg-yellow-500",
      "bg-blue-500",
      "bg-green-500",
    ];
    return {
      score,
      label: labels[Math.min(labels.length - 1, score)],
      color: colors[Math.min(colors.length - 1, score)],
    };
  }

  function validateUsernameField(v: string) {
    if (!v || v.trim().length < 3) return "Must be at least 3 characters";
    if (!/^[a-zA-Z0-9_]+$/.test(v))
      return "Only letters, numbers, and _ allowed";
    return null;
  }

  function validateEmailField(v: string) {
    if (!v) return "Email required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Invalid email";
    return null;
  }

  function validatePasswordField(v: string) {
    if (!v || v.length < 8) return "Password must be at least 8 characters";
    return null;
  }

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md card p-0 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-5 text-center">
          <div className="flex justify-center mb-3">
            <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
              <div className="h-6 w-6 bg-white rounded-full"></div>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white">Create Account</h2>
          <p className="text-blue-100 text-sm mt-1">
            Join us and start connecting
          </p>
        </div>

        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">
                Username
              </label>
              <input
                value={username}
                onChange={(e) => {
                  const v = e.target.value;
                  setUsername(v);
                  setUsernameError(validateUsernameField(v));
                }}
                required
                className="input w-full"
                placeholder="username"
              />
              {usernameError && (
                <div className="text-red-400 text-xs mt-1">{usernameError}</div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  const v = e.target.value;
                  setEmail(v);
                  setEmailError(validateEmailField(v));
                }}
                required
                className="input w-full"
                placeholder="you@example.com"
              />
              {emailError && (
                <div className="text-red-400 text-xs mt-1">{emailError}</div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  const v = e.target.value;
                  setPassword(v);
                  setPasswordError(validatePasswordField(v));
                  if (confirm)
                    setConfirmError(
                      v !== confirm ? "Passwords do not match" : null,
                    );
                }}
                required
                className="input w-full"
                placeholder="Enter your password"
              />
              <div className="mt-2">
                {password ? (
                  <div>
                    <div className="w-full bg-gray-700 rounded h-2 overflow-hidden">
                      <div
                        className={`${passwordStrength(password).color} h-2 rounded transition-all`}
                        style={{
                          width: `${((passwordStrength(password).score + 1) / 5) * 100}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {passwordStrength(password).label}
                    </p>
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">
                    Use 8+ characters, mix letters and numbers.
                  </div>
                )}
                {passwordError && (
                  <div className="text-red-400 text-xs mt-1">
                    {passwordError}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => {
                  const v = e.target.value;
                  setConfirm(v);
                  setConfirmError(
                    v !== password ? "Passwords do not match" : null,
                  );
                }}
                required
                className="input w-full"
                placeholder="Confirm your password"
              />
              {confirmError && (
                <div className="text-red-400 text-xs mt-1">{confirmError}</div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">
                Instagram (optional)
              </label>
              <input
                value={ig}
                onChange={(e) => setIg(e.target.value)}
                className="input w-full"
                placeholder="@yourhandle"
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

            {success && (
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-md">
                <div className="text-green-400 text-sm flex items-center gap-2">
                  <div className="h-2 w-2 bg-green-400 rounded-full animate-pulse"></div>
                  Account created — redirecting…
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                !!usernameError ||
                !!emailError ||
                !!passwordError ||
                !!confirmError ||
                !username ||
                !email ||
                !password ||
                !confirm
              }
              className="btn-primary w-full py-3 font-semibold"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  Creating...
                </div>
              ) : (
                "Sign up"
              )}
            </button>

            <div className="text-center pt-4 border-t border-gray-700/50 mt-4">
              <p className="text-sm text-gray-400">
                Already have an account?{" "}
                <a
                  href="/login"
                  className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                >
                  Sign in
                </a>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
