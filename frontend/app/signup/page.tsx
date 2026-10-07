"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://jobsphere-ai-zxkj.onrender.com";

type ApiResult = {
  success?: boolean;
  message?: string;
  token?: string;
  devOtp?: string;
  profilePicture?: string | null;
};

async function readApiResult(response: Response): Promise<ApiResult> {
  const result: unknown = await response.json();
  if (typeof result !== "object" || result === null) {
    throw new Error("The server returned an invalid response.");
  }
  return result as ApiResult;
}

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [token, setToken] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [step, setStep] = useState<"signup" | "otp" | "photo" | "complete">(
    "signup",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const requestOtp = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/signup-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, password }),
      });
      const result = await readApiResult(response);
      if (!response.ok || result.success !== true) {
        throw new Error(result.message || "Could not send the verification code.");
      }
      const returnedDevOtp =
        typeof result.devOtp === "string" && /^\d{6}$/.test(result.devOtp)
          ? result.devOtp
          : "";
      setDevOtp(returnedDevOtp);
      setOtp(returnedDevOtp);
      setStep("otp");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not start signup.",
      );
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const result = await readApiResult(response);
      if (!response.ok || result.success !== true || !result.token) {
        throw new Error(result.message || "Could not verify the code.");
      }
      setToken(result.token);
      setStep("photo");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not verify the code.",
      );
    } finally {
      setLoading(false);
    }
  };

  const uploadPhoto = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!photo) {
      setError("Choose a JPEG, PNG, or WEBP photo, or skip this step.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("profileImage", photo);
      const response = await fetch(`${API_BASE}/api/auth/profile-image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await readApiResult(response);
      if (!response.ok || result.success !== true) {
        throw new Error(result.message || "Could not upload the profile photo.");
      }
      setStep("complete");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not upload the profile photo.",
      );
    } finally {
      setLoading(false);
    }
  };

  const goToLogin = () => router.push("/login");

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-950 px-5 py-10 text-white">
      <section className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-7 shadow-2xl">
        <Link href="/" className="text-sm font-semibold text-emerald-400">
          JobSphere AI
        </Link>
        <h1 className="mt-5 text-2xl font-bold">Create your candidate account</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Verify your email to finish setting up your account.
        </p>

        {step === "signup" && (
          <form onSubmit={requestOtp} className="mt-6 grid gap-4">
            <label className="grid gap-1.5 text-sm text-zinc-300">
              Full name
              <input
                autoComplete="name"
                required
                minLength={2}
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 outline-none focus:border-emerald-500"
              />
            </label>
            <label className="grid gap-1.5 text-sm text-zinc-300">
              Email
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 outline-none focus:border-emerald-500"
              />
            </label>
            <label className="grid gap-1.5 text-sm text-zinc-300">
              Phone
              <input
                type="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+15551234567"
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 outline-none focus:border-emerald-500"
              />
            </label>
            <label className="grid gap-1.5 text-sm text-zinc-300">
              Password
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 outline-none focus:border-emerald-500"
              />
              <span className="text-xs text-zinc-500">At least 8 characters</span>
            </label>
            <button
              type="submit"
              disabled={loading}
              className="mt-1 rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-zinc-950 transition-colors hover:bg-emerald-300 disabled:opacity-60"
            >
              {loading ? "Sending code..." : "Continue with email verification"}
            </button>
          </form>
        )}

        {step === "complete" && (
          <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-5">
            <h2 className="font-semibold text-emerald-300">Signup complete</h2>
            <p className="mt-2 text-sm text-zinc-300">
              Your email is verified. You can now sign in with your email or phone.
            </p>
            <button
              type="button"
              onClick={goToLogin}
              className="mt-4 w-full rounded-lg bg-emerald-400 px-4 py-2.5 font-semibold text-zinc-950"
            >
              Go to login
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-rose-950/60 p-3 text-sm text-rose-300">
            {error}
          </p>
        )}

        {step === "otp" && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-5 backdrop-blur-sm">
            <form
              onSubmit={verifyOtp}
              className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl"
            >
              <h2 className="text-xl font-bold">Verify your email</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Enter the 6-digit code sent to {email}. It expires in 10 minutes.
              </p>
              {devOtp && (
                <p className="mt-3 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
                  Dev OTP: {devOtp}
                </p>
              )}
              <input
                aria-label="6-digit verification code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={otp}
                onChange={(event) =>
                  setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="mt-5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-emerald-500"
              />
              {error && (
                <p role="alert" className="mt-3 text-sm text-rose-300">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="mt-4 w-full rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-zinc-950 disabled:opacity-60"
              >
                {loading ? "Verifying..." : "Verify code"}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void requestOtp()}
                className="mt-3 w-full text-sm text-zinc-400 underline underline-offset-4 hover:text-white disabled:opacity-60"
              >
                Resend verification code
              </button>
            </form>
          </div>
        )}

        {step === "photo" && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-5 backdrop-blur-sm">
            <form
              onSubmit={uploadPhoto}
              className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl"
            >
              <h2 className="text-xl font-bold">Add a profile photo</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Your email is verified. Add a JPEG, PNG, or WEBP photo (up to 5 MB), or skip for now.
              </p>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
                className="mt-5 block w-full text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-zinc-100"
              />
              {error && (
                <p role="alert" className="mt-3 text-sm text-rose-300">
                  {error}
                </p>
              )}
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setStep("complete")}
                  className="flex-1 rounded-lg border border-zinc-700 px-4 py-3 text-sm text-zinc-200 disabled:opacity-60"
                >
                  Skip
                </button>
                <button
                  type="submit"
                  disabled={loading || !photo}
                  className="flex-1 rounded-lg bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-60"
                >
                  {loading ? "Uploading..." : "Upload photo"}
                </button>
              </div>
            </form>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-zinc-400">
          Already registered?{" "}
          <Link href="/login" className="font-medium text-emerald-300 hover:text-emerald-200">
            Log in
          </Link>
        </p>
      </section>
    </main>
  );
}
