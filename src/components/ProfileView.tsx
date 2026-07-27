"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const LS_KEY = "survey:unified:session";

type Perspective = "SELF" | "PARTNER" | "PARTNER_GUESS";

const MODES: { key: Perspective; label: string; blurb: string; glyph: string }[] = [
  { key: "PARTNER", label: "In a partner", blurb: "What you want in someone else.", glyph: "💞" },
  { key: "SELF", label: "For myself", blurb: "What you want to build in your own life.", glyph: "⭐" },
  { key: "PARTNER_GUESS", label: "What they want", blurb: "Your guess at your partner's answers.", glyph: "🔮" },
];

export function ProfileView() {
  const router = useRouter();
  const [user, setUser] = useState<{ firstName: string; email: string } | null>(null);
  const [current, setCurrent] = useState<Perspective | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d?.user ?? null))
      .catch(() => {});
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setCurrent(JSON.parse(raw)?.perspective ?? null);
    } catch {
      /* ignore a malformed bundle */
    }
  }, []);

  /**
   * Switching mode starts a fresh set of sessions for that perspective.
   * Ratings are stored per participant, so the old mode's answers are kept
   * intact and can be switched back to — nothing is overwritten.
   */
  async function switchTo(p: Perspective) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perspective: p, firstName: user?.firstName ?? "Anonymous" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.surveys?.length || !data?.participants) {
        setError("Couldn't switch. Try again.");
        setBusy(false);
        return;
      }
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({
          firstName: user?.firstName ?? "Anonymous",
          perspective: p,
          participants: data.participants,
          domains: data.surveys,
        })
      );
      router.push("/");
    } catch {
      setError("Couldn't switch. Try again.");
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    localStorage.removeItem(LS_KEY);
    router.push("/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-6">
      <h1 className="text-2xl font-bold">You</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">What you&apos;re rating</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Each mode keeps its own separate ranking — switching never overwrites the other.
        </p>
        {MODES.map((m) => {
          const active = current === m.key;
          return (
            <button
              key={m.key}
              onClick={() => switchTo(m.key)}
              disabled={busy}
              className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition active:scale-[0.98] disabled:opacity-50 ${
                active
                  ? "border-amber-400 bg-amber-50 dark:bg-amber-950/40"
                  : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
              }`}
            >
              <span aria-hidden="true" className="text-xl">
                {m.glyph}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold">{m.label}</span>
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">{m.blurb}</span>
              </span>
              {active && <span className="shrink-0 text-xs font-bold text-amber-600 dark:text-amber-400">Active</span>}
            </button>
          );
        })}
        {error && <p className="text-sm font-medium text-red-500">{error}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Account</h2>
        {user ? (
          <>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Signed in as <span className="font-medium">{user.firstName}</span> ({user.email})
            </p>
            <button
              onClick={signOut}
              className="self-start rounded-xl border-2 border-neutral-300 px-4 py-2 text-sm font-semibold dark:border-neutral-700"
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Not signed in — your answers live only in this browser.
            </p>
            <Link
              href="/login"
              className="self-start rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-neutral-950"
            >
              Sign in to sync
            </Link>
          </>
        )}
      </section>

      <section className="flex flex-col gap-1 text-xs text-neutral-400">
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy policy
        </Link>
        <Link href="/terms" className="underline underline-offset-2">
          Terms of use
        </Link>
      </section>
    </main>
  );
}
