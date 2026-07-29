"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PERSPECTIVE_META, PERSPECTIVE_ORDER, type PerspectiveValue } from "@/lib/perspective";
import { useSessionBundle, writeSessionBundle } from "@/lib/sessionStore";

export function ProfileView() {
  const modes = PERSPECTIVE_ORDER.map((key) => PERSPECTIVE_META[key]);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read during render from the session store rather than mirrored into
  // state, so the highlighted row is right on the first paint.
  const bundle = useSessionBundle();
  const current: PerspectiveValue | null = bundle?.perspective ?? null;

  const name = bundle?.firstName?.trim() || "Anonymous";

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

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-6">
      <h1 className="text-2xl font-bold">You</h1>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-bold text-neutral-800 dark:text-neutral-200">What you&apos;re rating</h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
            Each mode keeps its own separate ranking — switching never overwrites the other.
          </p>
        </div>

        <div className="flex flex-col gap-3 pt-1">
          {modes.map((m) => {
            const active = current === m.key;
            const activeClass =
              m.key === "PARTNER"
                ? "border-amber-400 bg-amber-50/70 dark:border-amber-600 dark:bg-amber-950/40"
                : m.key === "SELF"
                ? "border-sky-400 bg-sky-50/70 dark:border-sky-600 dark:bg-sky-950/40"
                : "border-purple-400 bg-purple-50/70 dark:border-purple-600 dark:bg-purple-950/40";

            return (
              <button
                key={m.key}
                onClick={() => switchTo(m.key)}
                disabled={busy}
                className={`relative flex flex-col gap-2 rounded-2xl border-2 p-4 text-left transition-all active:scale-[0.98] disabled:opacity-50 ${
                  active
                    ? `${activeClass} shadow-xs`
                    : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span aria-hidden="true" className="text-xl">
                      {m.glyph}
                    </span>
                    <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                      {m.label}
                    </span>
                  </div>
                  {active && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-300 pl-7">
                  {m.blurb}
                </p>
              </button>
            );
          })}
        </div>
        {error && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
      </section>

      <section className="flex flex-col gap-1 text-xs text-neutral-500 dark:text-neutral-400">
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
