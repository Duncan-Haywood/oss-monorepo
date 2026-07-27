"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

type Mode = "login" | "signup";

export function AuthView() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "signup" ? { firstName, email, password } : { email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong.");
        setBusy(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <div className="text-4xl">💛</div>
        <h1 className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-50">
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          {mode === "login"
            ? "Your progress and insights are waiting."
            : "So your answers follow you across devices."}
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        {mode === "signup" && (
          <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
            First name
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputClass}
              autoComplete="given-name"
              maxLength={60}
              required
            />
          </label>
        )}

        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            autoComplete="email"
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
          />
          {mode === "signup" && (
            <span className="text-[11px] text-neutral-400">At least 10 characters, with a letter and a number.</span>
          )}
        </label>

        {error && (
          <p role="alert" className="text-sm font-medium text-red-500">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-2xl bg-amber-500 px-4 py-4 text-base font-semibold text-neutral-950 shadow-sm transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        onClick={() => {
          setMode(mode === "login" ? "signup" : "login");
          setError(null);
        }}
        className="text-center text-sm text-neutral-600 underline underline-offset-2 dark:text-neutral-400"
      >
        {mode === "login" ? "No account yet? Create one" : "Already have an account? Sign in"}
      </button>

      <Link href="/" className="text-center text-xs text-neutral-400 underline underline-offset-2">
        Continue without an account
      </Link>
    </main>
  );
}

const inputClass =
  "rounded-xl border border-neutral-300 bg-white px-3 py-3 text-base text-neutral-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50";
