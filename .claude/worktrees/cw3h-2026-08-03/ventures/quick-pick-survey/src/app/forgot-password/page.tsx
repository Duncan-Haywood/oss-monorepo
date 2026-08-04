"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setResetUrl(null);
    setBusy(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong.");
      } else {
        setSuccessMsg(data?.message ?? "Password reset link generated.");
        if (data?.resetUrl) {
          setResetUrl(data.resetUrl);
        }
      }
    } catch {
      setError("Couldn't reach the server.");
    }
    setBusy(false);
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <div className="text-4xl">🔑</div>
        <h1 className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-50">Reset your password</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Enter your account email to receive a password reset link.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
          Email address
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-3 text-base text-neutral-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
            autoComplete="email"
            required
          />
        </label>

        {error && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}

        {successMsg && (
          <div className="rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            {successMsg}
          </div>
        )}

        {resetUrl && (
          <div className="rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-xs dark:border-amber-400/30 dark:bg-amber-950/40">
            <p className="font-semibold text-amber-900 dark:text-amber-200">Reset URL (Development / Direct Access):</p>
            <Link href={resetUrl} className="mt-1 block font-mono text-[11px] text-amber-700 underline break-all dark:text-amber-300">
              {resetUrl}
            </Link>
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-2xl bg-amber-500 px-4 py-4 text-base font-semibold text-neutral-950 shadow-sm transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send Reset Link"}
        </button>
      </form>

      <Link href="/login" className="text-center text-xs text-neutral-500 dark:text-neutral-400 underline underline-offset-2">
        Back to sign in
      </Link>
    </main>
  );
}
