"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PERSPECTIVE_META, PERSPECTIVE_ORDER, type PerspectiveValue } from "@/lib/perspective";
import { clearSessionBundle, useSessionBundle, writeSessionBundle } from "@/lib/sessionStore";

const MODES = PERSPECTIVE_ORDER.map((key) => PERSPECTIVE_META[key]);

export function ProfileView() {
  const router = useRouter();
  const [user, setUser] = useState<{ firstName: string; email: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read during render from the session store rather than mirrored into
  // state, so the highlighted row is right on the first paint.
  const bundle = useSessionBundle();
  const current: PerspectiveValue | null = bundle?.perspective ?? null;

  /**
   * `/api/auth/me` is still in flight on the first paint, and the mode
   * buttons are live before it lands. Falling straight through to
   * "Anonymous" meant a signed-in person who tapped quickly had that written
   * onto the Participant row created for a mode they had not used before —
   * where it is permanent, shows in the admin table, and comes back at them
   * as "Thank you, Anonymous" at the end of the round. The stored bundle
   * already carries the name they started under, so it is the better guess.
   */
  const name = user?.firstName ?? (bundle?.firstName?.trim() || "Anonymous");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d?.user ?? null))
      .catch(() => {});
  }, []);

  /**
   * Switching mode resumes that perspective's existing sessions — the
   * server hands back the participants already tied to the account, so the
   * answers given in the other modes are untouched and switching back
   * lands on them rather than on an empty ranking.
   */
  async function switchTo(p: PerspectiveValue) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perspective: p, firstName: name }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.surveys?.length || !data?.participants) {
        setError("Couldn't switch. Try again.");
        setBusy(false);
        return;
      }
      writeSessionBundle({
        firstName: name,
        perspective: p,
        participants: data.participants,
        domains: data.surveys,
      });
      router.push("/");
    } catch {
      setError("Couldn't switch. Try again.");
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    clearSessionBundle();
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
              {active && <span className="shrink-0 text-xs font-bold text-amber-700 dark:text-amber-400">Active</span>}
            </button>
          );
        })}
        {error && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
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

      <section className="flex flex-col gap-1 text-xs text-neutral-500 dark:text-neutral-400">
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy policy
        </Link>
        <Link href="/terms" className="underline underline-offset-2">
          Terms of use
        </Link>
        <a
          href="https://github.com/sponsors/Duncan-Haywood"
          rel="noopener"
          className="underline underline-offset-2"
        >
          Support this app
        </a>
      </section>
    </main>
  );
}
