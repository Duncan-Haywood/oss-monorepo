"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Celebration } from "@/components/Celebration";
import { cuteBreakForCount } from "@/lib/cuteMessages";
import { DomainState, pickNextDomain, randomStreakTarget } from "@/lib/domainScheduler";
import { answersIntoLevel, answersUntilNextLevel, levelForAnswers, SWIPES_PER_LEVEL } from "@/lib/insights";
import {
  coerceSessionBundle,
  useStoredSession,
  writeSessionBundle,
  type SessionBundle,
} from "@/lib/sessionStore";
import {
  DEFAULT_PERSPECTIVE,
  PERSPECTIVE_META,
  PERSPECTIVE_ORDER,
  type PerspectiveValue,
} from "@/lib/perspective";
import {
  CenteredNote,
  FinancialTrialView,
  INSTRUCTIONS,
  isFinancial,
  ItemsTrialView,
  Trial,
} from "@/components/CardViews";

/** Always on screen while swiping, so it's never ambiguous who you're rating for. */
const PERSPECTIVE_SHORT: Record<PerspectiveValue, string> = Object.fromEntries(
  PERSPECTIVE_ORDER.map((k) => [k, `${PERSPECTIVE_META[k].glyph} ${PERSPECTIVE_META[k].short}`])
) as Record<PerspectiveValue, string>;

/**
 * A session in progress: the stored bundle plus the bookkeeping that only
 * matters while swiping.
 *
 * Held as one object rather than six `useState`s so the runner can *open*
 * on a domain instead of choosing one from inside an effect. The old shape
 * picked the domain in the same effect that fetched the question, so
 * setting it re-ran the effect and fired a second `trials/next` before the
 * first returned. That endpoint creates a row per call, so every resume
 * burned a question, silently skipped it, and inflated the abandonment
 * metric.
 */
type LiveSession = {
  firstName: string;
  perspective: PerspectiveValue;
  participants: Record<string, string>;
  domains: DomainState[];
  currentSlug: string;
  /** Questions left before moving to another domain. */
  streakRemaining: number;
};

function openSession(bundle: SessionBundle): LiveSession {
  const domains: DomainState[] = bundle.domains.map((d) => ({ ...d, confidence: 0, answeredCount: 0 }));
  return {
    firstName: bundle.firstName,
    perspective: bundle.perspective ?? DEFAULT_PERSPECTIVE,
    participants: bundle.participants,
    domains,
    currentSlug: pickNextDomain(domains, null),
    streakRemaining: randomStreakTarget(),
  };
}

export function UnifiedRunner() {
  // `hydrated` is false until the browser has actually read storage.
  // Rendering the welcome screen before then flashes it in front of every
  // returning visitor.
  const { hydrated, bundle } = useStoredSession();
  const restored = useMemo(() => (bundle ? openSession(bundle) : null), [bundle]);

  const [live, setLive] = useState<LiveSession | null>(null);
  const [paused, setPaused] = useState(false);
  const [trial, setTrial] = useState<Trial | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cuteNote, setCuteNote] = useState<{ en: string; fa: string } | null>(null);
  const [burst, setBurst] = useState(0);
  const [undoableSlug, setUndoableSlug] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [accountName, setAccountName] = useState<string | null>(null);

  // A session the person has touched wins over the stored one, so a late
  // account response can't yank the question out from under them.
  const session = live ?? restored;
  const phase = !hydrated ? "loading" : paused ? "thanks" : session ? "running" : "welcome";

  const update = useCallback(
    (fn: (s: LiveSession) => LiveSession) => setLive((prev) => (prev ? fn(prev) : restored ? fn(restored) : null)),
    [restored]
  );

  useEffect(() => {
    // A signed-in account is the source of truth — it lets progress resume on
    // a device that has nothing in localStorage. Writing it to the store is
    // enough; `restored` above picks it up on the next snapshot.
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (cancelled || !data?.user) return;
        setAccountName(data.user.firstName);
        const fromAccount = coerceSessionBundle({
          firstName: data.user.firstName,
          // Without this the account-resume path drops which perspective the
          // participants belong to, and the badge above the cards then claims
          // you're rating something you aren't.
          perspective: data.perspective,
          participants: data.participants,
          domains: data.surveys,
        });
        if (fromAccount) writeSessionBundle(fromAccount);
      } catch {
        // Signed out, or offline. The anonymous session still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    /**
     * Fills the per-domain counters in from the server for a resumed
     * session. The stored bundle knows which surveys, not how far into
     * them — without this every progress bar reads zero for someone who
     * has answered hundreds of questions, which looks like lost answers.
     */
    if (!restored) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/session/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participants: restored.participants }),
        });
        const data = await res.json();
        if (cancelled || !data?.status) return;
        update((s) => ({
          ...s,
          domains: s.domains.map((d) => (data.status[d.slug] ? { ...d, ...data.status[d.slug] } : d)),
        }));
      } catch {
        // Progress bars start at zero. Not worth interrupting anyone over.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [restored, update]);

  const fetchNext = useCallback(
    async (slug: string, pid: string, kind: DomainState["kind"], totalPoints: number) => {
      // Nothing is set before the first await on purpose: this runs from an
      // effect, and a synchronous setState there cascades a second render
      // before the first has painted. Clearing a stale error is the job of
      // whatever event triggered the reload (Retry, an answer, a restart).
      const endpoint = kind === "ITEMS" ? "/api/trials/next" : "/api/financial-trials/next";
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participantId: pid }),
        });
        if (!res.ok) {
          setError("Couldn't load the next question. Try again.");
          return;
        }
        const data = await res.json();
        // A body without a trial id would leave `trial` falsy and re-trigger
        // this fetch forever, so it counts as a failure, not a question.
        if (!data?.trialId) {
          setError("Couldn't load the next question. Try again.");
          return;
        }
        setTrial(data);
        setError(null);
        setCuteNote(cuteBreakForCount(totalPoints));
        update((s) => ({
          ...s,
          domains: s.domains.map((d) =>
            d.slug === slug ? { ...d, confidence: data.confidence, answeredCount: data.answeredCount } : d
          ),
        }));
      } catch {
        // A dropped connection rejects rather than returning !ok. Without
        // this the rejection went unhandled and the screen sat on "Loading
        // next…" with no Retry and no way out but a hard refresh — the
        // common case on a phone, not an edge case.
        setError("Couldn't load the next question. Try again.");
      }
    },
    [update]
  );

  useEffect(() => {
    if (phase !== "running" || trial || !session) return;
    const pid = session.participants[session.currentSlug];
    const domain = session.domains.find((d) => d.slug === session.currentSlug);
    if (!pid || !domain) return;
    const totalPoints = session.domains.reduce((sum, d) => sum + d.answeredCount, 0);
    void (async () => {
      await fetchNext(session.currentSlug, pid, domain.kind, totalPoints);
    })();
  }, [phase, trial, session, fetchNext, retryTick]);

  /**
   * Straight from the welcome screen into swiping — no form first. Details
   * are asked for later (or never), because the fastest possible path to
   * the first card is what makes people actually start.
   */
  async function beginSwiping(p: PerspectiveValue) {
    setError(null);
    const name = accountName ?? "Anonymous";
    try {
      const res = await fetch("/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perspective: p, firstName: name }),
      });
      const data = await res.json().catch(() => null);
      const started = res.ok
        ? coerceSessionBundle({
            firstName: name,
            perspective: p,
            participants: data?.participants,
            domains: data?.surveys,
          })
        : null;
      if (!started) {
        setError("Couldn't start. Try again.");
        return;
      }
      writeSessionBundle(started);
      setLive(openSession(started));
    } catch {
      setError("Couldn't start. Try again.");
    }
  }

  async function handleAnswer(result: "A" | "B" | "EQUAL") {
    if (!session || !trial || submitting) return;
    const answeredSlug = session.currentSlug;
    const domain = session.domains.find((d) => d.slug === answeredSlug);
    if (!domain) return;
    setSubmitting(true);
    setError(null);
    const endpoint = domain.kind === "ITEMS" ? "/api/trials/answer" : "/api/financial-trials/answer";
    let ok = false;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trialId: trial.trialId, result }),
      });
      // 409 means the server already has this answer — a retry after a
      // timeout, not a failure. Treating it as one wedged the session
      // permanently, since every retry returned 409 too.
      ok = res.ok || res.status === 409;
    } catch {
      ok = false;
    }
    setSubmitting(false);
    if (!ok) {
      setError("That didn't save — check your connection and tap again.");
      return;
    }
    setBurst((n) => n + 1);
    setUndoableSlug(answeredSlug);
    setTrial(null);
    update((s) => {
      const remaining = s.streakRemaining - 1;
      return remaining <= 0
        ? { ...s, currentSlug: pickNextDomain(s.domains, s.currentSlug), streakRemaining: randomStreakTarget() }
        : { ...s, streakRemaining: remaining };
    });
  }

  /** Tinder-style rewind of the most recent answer in the domain it was made in. */
  async function handleUndo() {
    if (!session || !undoableSlug || submitting) return;
    const domain = session.domains.find((d) => d.slug === undoableSlug);
    const pid = session.participants[undoableSlug];
    if (!domain || !pid) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/trials/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: pid, kind: domain.kind }),
      });
      if (!res.ok) {
        setError("Couldn't undo that one.");
        setSubmitting(false);
        return;
      }
    } catch {
      setError("Couldn't undo that one.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setUndoableSlug(null);
    // Go back to the domain the undone answer belonged to, and pull a fresh question there.
    update((s) => ({
      ...s,
      domains: s.domains.map((d) =>
        d.slug === undoableSlug ? { ...d, answeredCount: Math.max(0, d.answeredCount - 1) } : d
      ),
      currentSlug: undoableSlug,
    }));
    setTrial(null);
  }

  if (phase === "loading") {
    return <CenteredNote>Loading…</CenteredNote>;
  }

  if (phase === "welcome") {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-7 px-6 py-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="text-5xl">💛</div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">Quick pick</h1>
          <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
            Two options at a time. Pick the one you like more — that&apos;s the whole thing.
            <br />
            About 30 seconds gets you your first insight.
          </p>
        </div>

        <ol className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900">
          <li className="flex items-start gap-3">
            <span className="text-lg leading-none">👆</span>
            <span className="text-neutral-700 dark:text-neutral-300">
              Swipe up for the top card, down for the bottom
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-lg leading-none">⭐</span>
            <span className="text-neutral-700 dark:text-neutral-300">Every 10 picks levels you up</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-lg leading-none">✨</span>
            <span className="text-neutral-700 dark:text-neutral-300">
              Each level unlocks a new insight about what you actually want
            </span>
          </li>
        </ol>

        <div className="flex flex-col gap-3">
          <p className="text-center text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            What are we figuring out?
          </p>
          {PERSPECTIVE_ORDER.map((key, i) => (
            <button
              key={key}
              onClick={() => beginSwiping(key)}
              className={
                i === 0
                  ? "rounded-2xl bg-amber-500 px-4 py-4 text-base font-semibold text-neutral-950 shadow-sm transition active:scale-[0.98]"
                  : "rounded-2xl border-2 border-neutral-300 px-4 py-4 text-base font-semibold text-neutral-800 transition active:scale-[0.98] dark:border-neutral-700 dark:text-neutral-200"
              }
            >
              {PERSPECTIVE_META[key].cta}
            </button>
          ))}
          {error && <p className="text-center text-sm font-medium text-red-500">{error}</p>}
          {accountName ? (
            <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">Signed in as {accountName}</p>
          ) : (
            <a
              href="/login"
              className="text-center text-xs text-neutral-500 underline underline-offset-2 dark:text-neutral-400"
            >
              Have an account? Sign in to sync across devices
            </a>
          )}
        </div>
      </main>
    );
  }

  if (phase === "thanks" || !session) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-5 py-10 text-center">
        <div className="text-4xl" aria-hidden="true">
          💛
        </div>
        <h1 className="text-2xl font-bold">Thank you, {session?.firstName}</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          <span lang="fa" dir="rtl">
            دوستت دارم
          </span>{" "}
          — come back anytime, it&apos;ll pick up right where you left off.
        </p>
        <button
          onClick={() => setPaused(false)}
          className="mt-2 rounded-2xl bg-amber-500 px-5 py-3 text-sm font-semibold text-neutral-950 shadow-sm transition active:scale-[0.98]"
        >
          Keep going
        </button>
      </div>
    );
  }

  const { domains, currentSlug, perspective } = session;
  const currentDomain = domains.find((d) => d.slug === currentSlug);
  const totalPoints = domains.reduce((s, d) => s + d.answeredCount, 0);
  const level = levelForAnswers(totalPoints);
  const levelProgressPct = Math.round((answersIntoLevel(totalPoints) / SWIPES_PER_LEVEL) * 100);
  const toNextLevel = answersUntilNextLevel(totalPoints);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Two dense rows instead of five stacked strips: identity + progress on
          top, the actual question prompt below. Everything else (level-up
          nudges, notes) is transient and only appears when it has something
          to say. */}
      <header className="flex flex-col gap-2 border-b border-neutral-200 bg-neutral-50/95 px-4 pb-2.5 pt-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">
            {PERSPECTIVE_SHORT[perspective]}
          </span>
          {currentDomain && (
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              {currentDomain.title}
            </span>
          )}
          <span className="shrink-0 text-[11px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">
            Lv {level}
          </span>
          <button
            onClick={() => setPaused(true)}
            className="shrink-0 rounded-full border border-neutral-300 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-600 transition active:scale-95 dark:border-neutral-700 dark:text-neutral-300"
          >
            Pause
          </button>
        </div>

        <div
          role="progressbar"
          aria-label={`Progress through level ${level}`}
          aria-valuenow={levelProgressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500"
            style={{ width: `${Math.max(levelProgressPct, 3)}%` }}
          />
        </div>

        {currentDomain && (
          <p className="text-center text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            {INSTRUCTIONS[currentDomain.kind]}
          </p>
        )}

        {toNextLevel === SWIPES_PER_LEVEL && totalPoints > 0 && (
          <p className="text-center text-[11px] font-bold text-amber-700 dark:text-amber-300">
            <span aria-hidden="true">⭐</span> Level {level} — new insights may be ready
          </p>
        )}
        {cuteNote && (
          <p className="text-center text-[11px] font-medium text-amber-700 dark:text-amber-300">
            {cuteNote.en} ·{" "}
            <span className="italic" lang="fa" dir="rtl">
              {cuteNote.fa}
            </span>
          </p>
        )}
        {/* Announced, not just shown: a failure while swiping is otherwise
            silent for anyone not looking at this strip. */}
        {error && (
          <p role="alert" className="text-center text-xs font-medium text-red-500">
            {error}
          </p>
        )}
      </header>

      <div className="relative flex flex-1 flex-col gap-2 overflow-hidden p-2">
        {burst > 0 && <Celebration burstKey={burst} milestone={burst % 10 === 0} label={`Level ${level}!`} />}
        {!trial ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <CenteredNote>Loading next…</CenteredNote>
            {error && (
              <button
                onClick={() => {
                  setError(null);
                  setRetryTick((n) => n + 1);
                }}
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-neutral-950"
              >
                Retry
              </button>
            )}
          </div>
        ) : isFinancial(trial) ? (
          <FinancialTrialView
            trial={trial}
            submitting={submitting}
            onAnswer={handleAnswer}
            onUndo={handleUndo}
            canUndo={!!undoableSlug}
          />
        ) : (
          <ItemsTrialView
            trial={trial}
            submitting={submitting}
            onAnswer={handleAnswer}
            onUndo={handleUndo}
            canUndo={!!undoableSlug}
          />
        )}
      </div>
    </div>
  );
}
