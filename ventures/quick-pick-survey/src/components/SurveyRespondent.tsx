"use client";

import { useCallback, useEffect, useState } from "react";

type Item = { id: string; label: string };
type Trial = { trialId: string; itemA: Item; itemB: Item; answeredCount: number };
type Survey = { title: string; description: string | null };

const BUTTON =
  "w-full rounded-2xl border border-neutral-300 bg-white px-4 py-5 text-left text-base font-medium shadow-sm hover:border-amber-500 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900";

const storageKey = (slug: string) => `qps:s:${slug}`;

function remembered(slug: string): string | null {
  try {
    return localStorage.getItem(storageKey(slug));
  } catch {
    return null;
  }
}

function remember(slug: string, id: string | null) {
  try {
    if (id) localStorage.setItem(storageKey(slug), id);
    else localStorage.removeItem(storageKey(slug));
  } catch {
    // Private mode: the session still works, it just can't resume.
  }
}

/**
 * The page behind an admin-made survey's share link (/s/[slug]): pick one of
 * two options, repeatedly. Questions and ratings come from the same
 * `trials/next` and `trials/answer` routes as the main flow; the only new
 * server call is `surveys/[slug]/join`, which makes one anonymous participant.
 * A failed request keeps the screen and offers Try again.
 */
export function SurveyRespondent({ slug }: { slug: string }) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [trial, setTrial] = useState<Trial | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadTrial = useCallback(
    async (pid: string) => {
      const res = await fetch("/api/trials/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: pid }),
      });
      if (res.status === 404) {
        // A remembered participant that the server no longer has: start over.
        remember(slug, null);
        setParticipantId(null);
        throw new Error("restart");
      }
      if (!res.ok) throw new Error("Couldn't load the next question.");
      setTrial(await res.json());
    },
    [slug],
  );

  const start = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const sRes = await fetch(`/api/surveys/${slug}`);
      if (sRes.status === 404) {
        setNotFound(true);
        return;
      }
      if (!sRes.ok) throw new Error("Couldn't load this survey.");
      setSurvey((await sRes.json()).survey);

      let pid = remembered(slug);
      for (let attempt = 0; attempt < 2; attempt++) {
        if (!pid) {
          const jRes = await fetch(`/api/surveys/${slug}/join`, { method: "POST" });
          const j = await jRes.json().catch(() => ({}));
          if (!jRes.ok) throw new Error(j?.error ?? "Couldn't start the survey.");
          pid = j.participantId as string;
          remember(slug, pid);
        }
        setParticipantId(pid);
        try {
          await loadTrial(pid);
          return;
        } catch (e) {
          if ((e as Error).message !== "restart") throw e;
          pid = null;
        }
      }
      throw new Error("Couldn't start the survey.");
    } catch (e) {
      setError((e as Error).message === "Failed to fetch" ? "Couldn't reach the server." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [slug, loadTrial]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void start();
  }, [start]);

  async function answer(result: "A" | "B" | "EQUAL") {
    if (!trial || !participantId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/trials/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trialId: trial.trialId, result }),
      });
      if (!res.ok) throw new Error("Couldn't save that answer.");
      await loadTrial(participantId);
    } catch {
      // The same trial stays on screen; answering again is safe (the server
      // treats a repeat as already answered).
      setError("Couldn't reach the server. Your answer wasn't lost; try again.");
    }
    setBusy(false);
  }

  if (notFound) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-semibold">Survey not found</h1>
        <p className="mt-2 text-sm">Check the link you were sent.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl font-semibold">{survey?.title ?? "Loading…"}</h1>
      {survey?.description && <p className="text-sm text-neutral-600 dark:text-neutral-400">{survey.description}</p>}
      {error && (
        <div role="alert" className="rounded-xl border border-red-300 p-3 text-sm">
          <p>{error}</p>
          {!trial && (
            <button type="button" className="mt-2 underline" onClick={() => void start()}>
              Try again
            </button>
          )}
        </div>
      )}
      {trial && (
        <section aria-label="Question" className="space-y-3">
          <p className="text-sm">Which do you prefer?</p>
          <button type="button" className={BUTTON} disabled={busy} onClick={() => answer("A")}>
            {trial.itemA.label}
          </button>
          <button type="button" className={BUTTON} disabled={busy} onClick={() => answer("B")}>
            {trial.itemB.label}
          </button>
          <button type="button" className="text-sm underline" disabled={busy} onClick={() => answer("EQUAL")}>
            Can&apos;t choose
          </button>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">{trial.answeredCount} answered. Stop whenever you like.</p>
        </section>
      )}
    </main>
  );
}
