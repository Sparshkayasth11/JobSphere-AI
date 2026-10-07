"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://jobsphere-ai-zxkj.onrender.com";

type LoginResult = {
  success?: boolean;
  message?: string;
  token?: string;
  candidate?: unknown;
};

export default function LoginPage() {
  const router = useRouter();
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailOrPhone, password }),
      });
      const result: unknown = await response.json();
      if (typeof result !== "object" || result === null) {
        throw new Error("The server returned an invalid response.");
      }
      const data = result as LoginResult;
      if (!response.ok || data.success !== true || !data.token) {
        throw new Error(data.message || "Could not sign in.");
      }
      localStorage.setItem("authToken", data.token);
      if (data.candidate) {
        localStorage.setItem("candidateProfile", JSON.stringify(data.candidate));
      }
      window.dispatchEvent(new Event("jobSphereAuthChanged"));
      router.push("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-950 px-5 py-10 text-white">
      <section className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-7 shadow-2xl">
        <Link href="/" className="text-sm font-semibold text-emerald-400">
          JobSphere AI
        </Link>
        <h1 className="mt-5 text-2xl font-bold">Candidate login</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Sign in with your verified email or phone number.
        </p>
        <form onSubmit={login} className="mt-6 grid gap-4">
          <label className="grid gap-1.5 text-sm text-zinc-300">
            Email or phone
            <input
              autoComplete="username"
              required
              value={emailOrPhone}
              onChange={(event) => setEmailOrPhone(event.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 outline-none focus:border-emerald-500"
            />
          </label>
          <label className="grid gap-1.5 text-sm text-zinc-300">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 outline-none focus:border-emerald-500"
            />
          </label>
          {error && (
            <p role="alert" className="rounded-lg bg-rose-950/60 p-3 text-sm text-rose-300">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-zinc-950 transition-colors hover:bg-emerald-300 disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Log in"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-zinc-400">
          New to JobSphere AI?{" "}
          <Link href="/signup" className="font-medium text-emerald-300 hover:text-emerald-200">
            Create an account
          </Link>
        </p>
      </section>
    </main>
  );
}
