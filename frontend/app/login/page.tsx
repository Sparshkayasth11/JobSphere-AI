"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://jobsphere-ai-zxkj.onrender.com";

type LoginResult = {
  success?: boolean;
  message?: string;
  token?: string;
  candidate?: unknown;
};

type PasswordResetResult = {
  success?: boolean;
  message?: string;
  otp?: string;
  devOtp?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState<1 | 2>(1);
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [devOtp, setDevOtp] = useState("");

  const resetPasswordMismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;

  const openPasswordReset = () => {
    setResetIdentifier(emailOrPhone.trim());
    setResetStep(1);
    setResetOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setResetError("");
    setResetMessage("");
    setDevOtp("");
    setIsResetOpen(true);
  };

  const closePasswordReset = () => {
    if (resetLoading) return;
    setIsResetOpen(false);
    setResetError("");
    setResetMessage("");
  };

  const sendResetOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResetError("");
    setResetMessage("");
    setDevOtp("");
    setResetOtp("");
    setResetLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailOrPhone: resetIdentifier }),
      });
      const result: unknown = await response.json();
      if (typeof result !== "object" || result === null) {
        throw new Error("The server returned an invalid response.");
      }
      const data = result as PasswordResetResult;
      if (!response.ok || data.success !== true) {
        throw new Error(data.message || "Could not send a reset code.");
      }
      const returnedOtp =
        typeof data.otp === "string" && /^\d{6}$/.test(data.otp)
          ? data.otp
          : typeof data.devOtp === "string" && /^\d{6}$/.test(data.devOtp)
            ? data.devOtp
            : "";
      if (returnedOtp) {
        setDevOtp(returnedOtp);
        setResetOtp(returnedOtp);
      } else {
        setDevOtp("");
        setResetOtp("");
      }
      setResetStep(2);
      setResetMessage(data.message || "Check the email registered to your account for a reset code.");
    } catch (cause) {
      setResetError(
        cause instanceof Error ? cause.message : "Could not send a reset code.",
      );
    } finally {
      setResetLoading(false);
    }
  };

  const submitPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResetError("");
    if (newPassword !== confirmPassword) {
      setResetError("New password and confirmation do not match.");
      return;
    }
    setResetLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailOrPhone: resetIdentifier,
          otp: resetOtp,
          newPassword,
        }),
      });
      const result: unknown = await response.json();
      if (typeof result !== "object" || result === null) {
        throw new Error("The server returned an invalid response.");
      }
      const data = result as PasswordResetResult;
      if (!response.ok || data.success !== true) {
        throw new Error(data.message || "Could not reset your password.");
      }
      setPassword("");
      setEmailOrPhone(resetIdentifier);
      setIsResetOpen(false);
      toast.success(data.message || "Password reset successfully. You can log in now.");
    } catch (cause) {
      setResetError(
        cause instanceof Error ? cause.message : "Could not reset your password.",
      );
    } finally {
      setResetLoading(false);
    }
  };

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
          <button
            type="button"
            onClick={openPasswordReset}
            className="-mt-2 justify-self-end text-sm font-medium text-emerald-300 hover:text-emerald-200"
          >
            Forgot password?
          </button>
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
      {isResetOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-8"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePasswordReset();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-password-title"
            className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="reset-password-title" className="text-xl font-bold">
                  Reset your password
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  {resetStep === 1
                    ? "We’ll send a verification code to your registered email."
                    : "Enter your code and choose a new password."}
                </p>
              </div>
              <button
                type="button"
                onClick={closePasswordReset}
                disabled={resetLoading}
                aria-label="Close password reset"
                className="rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-50"
              >
                ×
              </button>
            </div>
            {resetStep === 1 ? (
              <form onSubmit={sendResetOtp} className="mt-5 grid gap-4">
                <label className="grid gap-1.5 text-sm text-zinc-300">
                  Registered email or phone
                  <input
                    autoComplete="username"
                    required
                    value={resetIdentifier}
                    onChange={(event) => setResetIdentifier(event.target.value)}
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 outline-none focus:border-emerald-500"
                  />
                </label>
                {resetError && (
                  <p role="alert" className="rounded-lg bg-rose-950/60 p-3 text-sm text-rose-300">
                    {resetError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-zinc-950 hover:bg-emerald-300 disabled:opacity-60"
                >
                  {resetLoading ? "Sending code..." : "Send OTP"}
                </button>
              </form>
            ) : (
              <form onSubmit={submitPasswordReset} className="mt-5 grid gap-4">
                {devOtp && (
                  <div className="mb-2 inline-block rounded border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-500">
                    Dev OTP: <span className="font-mono font-bold">{devOtp}</span>
                  </div>
                )}
                <label className="grid gap-1.5 text-sm text-zinc-300">
                  Verification code
                  <input
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={resetOtp}
                    onChange={(event) => setResetOtp(event.target.value)}
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 tracking-[0.3em] outline-none focus:border-emerald-500"
                  />
                </label>
                {resetMessage && (
                  <p role="status" className="rounded-lg bg-emerald-950/60 p-3 text-sm text-emerald-200">
                    {resetMessage}
                  </p>
                )}
                <label className="grid gap-1.5 text-sm text-zinc-300">
                  New password
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 outline-none focus:border-emerald-500"
                  />
                </label>
                <label className="grid gap-1.5 text-sm text-zinc-300">
                  Confirm new password
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    aria-invalid={resetPasswordMismatch}
                    className={`rounded-lg border bg-zinc-950 px-3 py-2.5 outline-none ${
                      resetPasswordMismatch
                        ? "border-rose-500 focus:border-rose-400"
                        : "border-zinc-700 focus:border-emerald-500"
                    }`}
                  />
                </label>
                {resetPasswordMismatch && (
                  <p role="alert" className="-mt-2 text-sm text-rose-300">
                    New password and confirmation do not match.
                  </p>
                )}
                {resetError && (
                  <p role="alert" className="rounded-lg bg-rose-950/60 p-3 text-sm text-rose-300">
                    {resetError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={resetLoading || resetPasswordMismatch}
                  className="rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-zinc-950 hover:bg-emerald-300 disabled:opacity-60"
                >
                  {resetLoading ? "Resetting password..." : "Reset password"}
                </button>
                <button
                  type="button"
                  disabled={resetLoading}
                  onClick={() => {
                    setResetStep(1);
                    setResetOtp("");
                    setDevOtp("");
                    setResetError("");
                    setResetMessage("");
                  }}
                  className="text-sm font-medium text-zinc-300 hover:text-white disabled:opacity-50"
                >
                  Use a different email or phone
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
