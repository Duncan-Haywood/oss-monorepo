"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token") || "";

  const [manualToken, setManualToken] = useState("");
  const token = tokenFromUrl || manualToken;
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Couldn't reset password.");
      } else {
        setSuccessMsg(data?.message ?? "Password updated successfully!");
        setTimeout(() => {
          router.push("/login");
        }, 2000);
      }
    } catch {
      setError("Couldn't reach the server.");
    }
    setBusy(false);
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <div className="text-4xl">🔐</div>
        <h1 className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-50">Set new password</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Enter your new account password below.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        {!tokenFromUrl && (
          <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Reset Token
            <input
              type="text"
              value={token}
              onChange={(e) => setManualToken(e.target.value)}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-3 text-base text-neutral-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 font-mono text-xs"
              required
            />
          </label>
        )}

        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
          New Password
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-3 text-base text-neutral-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
            autoComplete="new-password"
            required
          />
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400">At least 10 characters, with a letter and a number.</span>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
          Confirm Password
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-3 text-base text-neutral-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
            autoComplete="new-password"
            required
          />
        </label>

        {error && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}

        {successMsg && (
          <div className="rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            {successMsg} Redirecting to sign in…
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-2xl bg-amber-500 px-4 py-4 text-base font-semibold text-neutral-950 shadow-sm transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "Updating…" : "Update Password"}
        </button>
      </form>

      <Link href="/login" className="text-center text-xs text-neutral-600 dark:text-neutral-300 underline underline-offset-2">
        Back to sign in
      </Link>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center p-10 text-neutral-600 dark:text-neutral-300">Loading…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
