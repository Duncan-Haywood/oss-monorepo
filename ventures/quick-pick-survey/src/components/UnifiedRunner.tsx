"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  getInstructions,
  isFinancial,
  ItemsTrialView,
  Trial,
  type InteractionMethod,
} from "@/components/CardViews";
import { recordUsage } from "@/lib/usageClient";
import {
  selectCoupleInsightBreak,
  selectInsightBreak,
  shouldCheckForInsight,
  type InsightBreak,
} from "@/lib/insightBreaks";
import { InsightInterrupt } from "@/components/InsightInterrupt";
import { ModeTransitionModal } from "@/components/ModeTransitionModal";

const SHOWN_INSIGHT_BREAKS_KEY = "survey:shown-insight-breaks";
const LAST_INSIGHT_BREAK_ANSWER_KEY = "survey:last-insight-break-answer";
const GUIDED_SESSIONS_KEY = "survey:guided-couples-sessions";
const PICKS_PER_FOCUS = 10;

function rememberedPerspective(perspective: PerspectiveValue): SessionBundle | null {
  try {
    const stored = JSON.parse(localStorage.getItem(GUIDED_SESSIONS_KEY) ?? "{}") as Record<string, unknown>;
    return coerceSessionBundle(stored[perspective]);
  } catch {
    return null;
  }
}

function rememberPerspective(bundle: SessionBundle) {
  try {
    const stored = JSON.parse(localStorage.getItem(GUIDED_SESSIONS_KEY) ?? "{}") as Record<string, unknown>;
    localStorage.setItem(GUIDED_SESSIONS_KEY, JSON.stringify({ ...stored, [String(bundle.perspective)]: bundle }));
  } catch {
    // The active session still works when private browsing denies storage.
  }
}

function shownInsightBreaks(perspective: PerspectiveValue): Set<string> {
  try {
    const stored = JSON.parse(localStorage.getItem(SHOWN_INSIGHT_BREAKS_KEY) ?? "{}") as Record<string, unknown>;
    const keys = stored[perspective];
    return new Set(Array.isArray(keys) ? keys.filter((key): key is string => typeof key === "string") : []);
  } catch {
    return new Set();
  }
}

function rememberInsightBreak(perspective: PerspectiveValue, key: string) {
  try {
    const stored = JSON.parse(localStorage.getItem(SHOWN_INSIGHT_BREAKS_KEY) ?? "{}") as Record<string, unknown>;
    const prior = Array.isArray(stored[perspective])
      ? stored[perspective].filter((item): item is string => typeof item === "string")
      : [];
    const next = { ...stored, [perspective]: [...new Set([...prior, key])] };
    if (key.startsWith("couple-")) {
      for (const p of PERSPECTIVE_ORDER) {
        const values = Array.isArray(stored[p])
          ? stored[p].filter((item): item is string => typeof item === "string")
          : [];
        next[p] = [...new Set([...values, key])];
      }
    }
    localStorage.setItem(
      SHOWN_INSIGHT_BREAKS_KEY,
      JSON.stringify(next)
    );
  } catch {
    // Private browsing can deny storage. The insight is still useful once.
  }
}

function lastInsightBreakAnswer(perspective: PerspectiveValue): number {
  try {
    const stored = JSON.parse(localStorage.getItem(LAST_INSIGHT_BREAK_ANSWER_KEY) ?? "{}") as Record<string, unknown>;
    return typeof stored[perspective] === "number" ? stored[perspective] : 0;
  } catch {
    return 0;
  }
}

function rememberInsightBreakAnswer(perspective: PerspectiveValue, answers: number) {
  try {
    const stored = JSON.parse(localStorage.getItem(LAST_INSIGHT_BREAK_ANSWER_KEY) ?? "{}") as Record<string, unknown>;
    localStorage.setItem(
      LAST_INSIGHT_BREAK_ANSWER_KEY,
      JSON.stringify({ ...stored, [perspective]: answers })
    );
  } catch {
    // The once-per-kind check still limits interruptions when storage works.
  }
}

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
    currentSlug: pickNextDomain(domains, null, bundle.perspective ?? DEFAULT_PERSPECTIVE),
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
  const [nextTrial, setNextTrial] = useState<Trial | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cuteNote, setCuteNote] = useState<{ en: string } | null>(null);
  const [burst, setBurst] = useState(0);
  const [undoableSlug, setUndoableSlug] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [insightBreak, setInsightBreak] = useState<InsightBreak | null>(null);
  const [isModeModalOpen, setIsModeModalOpen] = useState(false);
  const [targetPerspective, setTargetPerspective] = useState<PerspectiveValue>("PARTNER");
  const [isModalAutoSuggested, setIsModalAutoSuggested] = useState(false);
  const [focusAnswers, setFocusAnswers] = useState(0);
  const cardShownAt = useRef(0);
  const submittingTrialIdRef = useRef<string | null>(null);

  // A session the person has touched wins over the stored one, so a late
  // account response can't yank the question out from under them.
  const session = live ?? restored;
  const phase = !hydrated ? "loading" : paused ? "thanks" : session ? "running" : "welcome";

  async function switchPerspective(p: PerspectiveValue) {
    setError(null);
    setTrial(null);
    setNextTrial(null);
    const remembered = rememberedPerspective(p);
    if (remembered) {
      writeSessionBundle(remembered);
      setLive(openSession(remembered));
      setTrial(null);
      setNextTrial(null);
      setFocusAnswers(0);
      setIsModeModalOpen(false);
      setRetryTick((n) => n + 1);
      recordUsage("survey_start", { perspective: p, success: true });
      return;
    }
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
        recordUsage("survey_start", { perspective: p, success: false });
        setError("Couldn't switch mode. Try again.");
        return;
      }
      writeSessionBundle(started);
      rememberPerspective(started);
      setLive(openSession(started));
      setTrial(null);
      setNextTrial(null);
      setFocusAnswers(0);
      setIsModeModalOpen(false);
      setRetryTick((n) => n + 1);
      recordUsage("survey_start", { perspective: p, success: true });
    } catch {
      recordUsage("survey_start", { perspective: p, success: false });
      setError("Couldn't switch mode. Try again.");
    }
  }

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

  const pendingPrefetchRef = useRef<Promise<Trial | null> | null>(null);

  const prefetchNext = useCallback(
    async (slug: string, pid: string, kind: DomainState["kind"]) => {
      const endpoint = kind === "ITEMS" ? "/api/trials/next" : "/api/financial-trials/next";
      const promise = (async () => {
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ participantId: pid }),
          });
          if (!res.ok) return null;
          const data = await res.json();
          if (!data?.trialId) return null;
          setNextTrial(data);
          return data;
        } catch {
          return null;
        }
      })();
      pendingPrefetchRef.current = promise;
      return promise;
    },
    []
  );

  const fetchNext = useCallback(
    async (slug: string, pid: string, kind: DomainState["kind"], totalPoints: number, perspective: PerspectiveValue) => {
      // Nothing is set before the first await on purpose: this runs from an
      // effect, and a synchronous setState there cascades a second render
      // before the first has painted. Clearing a stale error is the job of
      // whatever event triggered the reload (Retry, an answer, a restart).
      const endpoint = kind === "ITEMS" ? "/api/trials/next" : "/api/financial-trials/next";
      const startedAt = performance.now();
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participantId: pid }),
        });
        if (!res.ok) {
          recordUsage("question_load", { perspective, domain: slug, durationMs: Math.round(performance.now() - startedAt), success: false });
          setError("Couldn't load the next question. Try again.");
          return;
        }
        const data = await res.json();
        // A body without a trial id would leave `trial` falsy and re-trigger
        // this fetch forever, so it counts as a failure, not a question.
        if (!data?.trialId) {
          recordUsage("question_load", { perspective, domain: slug, durationMs: Math.round(performance.now() - startedAt), success: false });
          setError("Couldn't load the next question. Try again.");
          return;
        }
        setTrial(data);
        recordUsage("question_load", { perspective, domain: slug, durationMs: Math.round(performance.now() - startedAt), success: true });
        cardShownAt.current = performance.now();
        setError(null);
        setCuteNote(cuteBreakForCount(totalPoints));
        update((s) => ({
          ...s,
          domains: s.domains.map((d) =>
            d.slug === slug ? { ...d, confidence: data.confidence, answeredCount: data.answeredCount } : d
          ),
        }));
      } catch {
        recordUsage("question_load", { perspective, domain: slug, durationMs: Math.round(performance.now() - startedAt), success: false });
        // A dropped connection rejects rather than returning !ok. Without
        // this the rejection went unhandled and the screen sat on "Loading
        // next…" with no Retry and no way out but a hard refresh — the
        // common case on a phone, not an edge case.
        setError("Couldn't load the next question. Try again.");
      }
    },
    [update, prefetchNext]
  );

  useEffect(() => {
    if (phase !== "running" || trial || !session || isModeModalOpen) return;
    const pid = session.participants[session.currentSlug];
    const domain = session.domains.find((d) => d.slug === session.currentSlug);
    if (!pid || !domain) return;
    const totalPoints = session.domains.reduce((sum, d) => sum + d.answeredCount, 0);
    void (async () => {
      await fetchNext(session.currentSlug, pid, domain.kind, totalPoints, session.perspective);
    })();
  }, [phase, trial, session, fetchNext, retryTick, isModeModalOpen]);

  /**
   * Straight from the welcome screen into swiping — no form first. Details
   * are asked for later (or never), because the fastest possible path to
   * the first card is what makes people actually start.
   */
  async function beginSwiping(p: PerspectiveValue) {
    setError(null);
    setTrial(null);
    setNextTrial(null);
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
        recordUsage("survey_start", { perspective: p, success: false });
        setError("Couldn't start. Try again.");
        return;
      }
      writeSessionBundle(started);
      rememberPerspective(started);
      setLive(openSession(started));
      setFocusAnswers(0);
      recordUsage("survey_start", { perspective: p, success: true });
    } catch {
      recordUsage("survey_start", { perspective: p, success: false });
      setError("Couldn't start. Try again.");
    }
  }

  async function handleAnswer(result: "A" | "B", interactionMethod: InteractionMethod) {
    if (!session || !trial || submittingTrialIdRef.current === trial.trialId) return;
    submittingTrialIdRef.current = trial.trialId;
    const currentTrial = trial;
    const answeredSlug = session.currentSlug;
    const domain = session.domains.find((d) => d.slug === answeredSlug);
    if (!domain) return;

    setError(null);
    const timeSpent = cardShownAt.current
      ? Math.max(0, Math.round(performance.now() - cardShownAt.current))
      : null;

    setBurst((n) => n + 1);
    setUndoableSlug(answeredSlug);
    const answersAfterThis = session.domains.reduce((sum, d) => sum + d.answeredCount, 0) + 1;
    setFocusAnswers(answersAfterThis % PICKS_PER_FOCUS || PICKS_PER_FOCUS);

    const willOpenModeModal = answersAfterThis % 10 === 0 && !insightBreak;

    let upcomingTrial = nextTrial;
    if (!upcomingTrial && pendingPrefetchRef.current) {
      upcomingTrial = (await pendingPrefetchRef.current) as Trial | null;
    }
    pendingPrefetchRef.current = null;

    // Optimistic UI update: advance instantly to pre-fetched trial if available
    if (!willOpenModeModal && upcomingTrial) {
      setTrial(upcomingTrial);
      setNextTrial(null);
      cardShownAt.current = performance.now();
      const pid = session.participants[answeredSlug];
      if (pid) {
        void prefetchNext(answeredSlug, pid, domain.kind);
      }
    } else {
      setTrial(null);
      setNextTrial(null);
    }

    setSubmitting(false);

    const endpoint = domain.kind === "ITEMS" ? "/api/trials/answer" : "/api/financial-trials/answer";
    const startedAt = performance.now();

    // Save answer asynchronously in background without blocking interaction on the next card
    void (async () => {
      let ok = false;
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trialId: currentTrial.trialId,
            result,
            interactionMethod,
            clientMsToAnswer: timeSpent,
          }),
        });
        // 409 means the server already has this answer — a retry after a
        // timeout, not a failure. Treating it as one wedged the session
        // permanently, since every retry returned 409 too.
        ok = res.ok || res.status === 409;
      } catch {
        ok = false;
      }
      recordUsage("answer_save", {
        perspective: session.perspective,
        domain: answeredSlug,
        durationMs: Math.round(performance.now() - startedAt),
        success: ok,
      });
      if (!ok) {
        setError("That didn't save — check your connection and tap again.");
      }
    })();

    if (willOpenModeModal) {
      const alternatePerspective: PerspectiveValue = session.perspective === "SELF" ? "PARTNER" : "SELF";
      setTargetPerspective(alternatePerspective);
      setIsModalAutoSuggested(true);
      setIsModeModalOpen(true);
    }

    if (shouldCheckForInsight(answersAfterThis, lastInsightBreakAnswer(session.perspective))) {
      void Promise.all([
        fetch("/api/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participants: session.participants }),
        }).then((res) => (res.ok ? res.json() : null)),
        fetch("/api/couple/compare").then((res) => (res.ok ? res.json() : null)),
      ])
        .then(([personalData, coupleData]) => {
          const shown = shownInsightBreaks(session.perspective);
          const nextBreak =
            selectCoupleInsightBreak(coupleData ?? {}, answersAfterThis, shown) ??
            selectInsightBreak(personalData ?? {}, session.perspective, shown);
          if (!nextBreak) return;
          rememberInsightBreak(session.perspective, nextBreak.key);
          rememberInsightBreakAnswer(session.perspective, nextBreak.answers);
          setInsightBreak(nextBreak);
          recordUsage("insight_break", { perspective: session.perspective, domain: answeredSlug });
        })
        .catch(() => {});
    }
    update((s) => {
      const remaining = s.streakRemaining - 1;
      return remaining <= 0
        ? {
            ...s,
            currentSlug: pickNextDomain(s.domains, s.currentSlug, s.perspective),
            streakRemaining: randomStreakTarget(),
            domains: s.domains.map((d) => (d.slug === answeredSlug ? { ...d, answeredCount: d.answeredCount + 1 } : d)),
          }
        : {
            ...s,
            streakRemaining: remaining,
            domains: s.domains.map((d) => (d.slug === answeredSlug ? { ...d, answeredCount: d.answeredCount + 1 } : d)),
          };
    });
  }

  /**
   * Skipping is not an equality judgment. It records where the person
   * hesitated, leaves both ratings untouched, and moves to a fresh pair.
   */
  function handleSkip() {
    if (!trial || submitting || !session) return;
    const clientMsToAnswer = cardShownAt.current
      ? Math.max(0, Math.round(performance.now() - cardShownAt.current))
      : null;
    const perspective = session.perspective;
    const domain = session.currentSlug;
    void fetch("/api/trials/skip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trialId: trial.trialId,
        kind: isFinancial(trial) ? "FINANCIAL" : "ITEMS",
        clientMsToAnswer,
      }),
      keepalive: true,
    })
      .then((res) => recordUsage("question_skip", { perspective, domain, durationMs: clientMsToAnswer ?? undefined, success: res.ok }))
      .catch(() => recordUsage("question_skip", { perspective, domain, durationMs: clientMsToAnswer ?? undefined, success: false }));
    if (nextTrial) {
      setTrial(nextTrial);
      setNextTrial(null);
      cardShownAt.current = performance.now();
    } else {
      setTrial(null);
      setRetryTick((n) => n + 1);
    }
  }

  /** Tinder-style rewind of the most recent answer in the domain it was made in. */
  async function handleUndo() {
    if (!session || !undoableSlug || submitting) return;
    const domain = session.domains.find((d) => d.slug === undoableSlug);
    const pid = session.participants[undoableSlug];
    if (!domain || !pid) return;
    setSubmitting(true);
    setError(null);
    const startedAt = performance.now();
    try {
      const res = await fetch("/api/trials/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: pid, kind: domain.kind }),
      });
      if (!res.ok) {
        recordUsage("answer_undo", { perspective: session.perspective, domain: undoableSlug, durationMs: Math.round(performance.now() - startedAt), success: false });
        setError("Couldn't undo that one.");
        setSubmitting(false);
        return;
      }
    } catch {
      recordUsage("answer_undo", { perspective: session.perspective, domain: undoableSlug, durationMs: Math.round(performance.now() - startedAt), success: false });
      setError("Couldn't undo that one.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    recordUsage("answer_undo", { perspective: session.perspective, domain: undoableSlug, durationMs: Math.round(performance.now() - startedAt), success: true });
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

  useEffect(() => {
    if (phase !== "running" || !trial || submitting) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        void handleAnswer("A", "button");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        void handleAnswer("B", "button");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        handleSkip();
      } else if (e.key.toLowerCase() === "z" && undoableSlug) {
        e.preventDefault();
        void handleUndo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, trial, submitting, undoableSlug, handleAnswer, handleSkip, handleUndo]);

  if (phase === "loading") {
    return <CenteredNote>Loading…</CenteredNote>;
  }

  if (phase === "welcome") {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-5 py-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="text-4xl" aria-hidden="true">💛</div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">A clearer picture of both of you</h1>
          <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
            You&apos;ll answer both parts automatically: what you value in a partner, then what you value for your own life.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-4 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div>
              <span className="block text-xl" aria-hidden="true">💛</span>
              <span className="mt-1 block text-xs font-bold">Partner preferences</span>
            </div>
            <span className="text-neutral-700 dark:text-neutral-300" aria-hidden="true">→</span>
            <div>
              <span className="block text-xl" aria-hidden="true">👤</span>
              <span className="mt-1 block text-xs font-bold">Self values</span>
            </div>
          </div>
          <button
            onClick={() => beginSwiping("PARTNER")}
            className="rounded-2xl bg-amber-500 px-5 py-4 text-sm font-bold text-neutral-950 shadow-sm transition active:scale-[0.98]"
          >
            Start our couples check-in
          </button>
          {error && <p role="alert" className="text-center text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
          {/*
            What starting actually costs someone, said before they tap rather
            than in a policy page they would have to go looking for. Signed
            out it is genuinely nothing identifying — `beginSwiping` sends
            "Anonymous" — and that is worth saying, not hiding.
          */}
          <p className="text-center text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            {accountName
              ? "Your picks are saved to your account. A linked partner sees how your rankings compare, never what you picked."
              : "Answering without an account saves your picks and nothing else — no name, no email."}{" "}
            <a href="/privacy" className="underline underline-offset-2">
              Privacy
            </a>
          </p>
          <p className="rounded-xl bg-neutral-100 px-3 py-2 text-center text-xs leading-relaxed text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
            On the next screen: choose the card that feels closer. Tap it or use the labeled buttons.
          </p>
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
      <ModeTransitionModal
        isOpen={isModeModalOpen}
        targetPerspective={targetPerspective}
        currentPerspective={perspective}
        isAutoSuggested={isModalAutoSuggested}
        onConfirm={() => {
          setIsModeModalOpen(false);
          void switchPerspective(targetPerspective);
        }}
        onCancel={() => {
          setIsModeModalOpen(false);
          setTrial(null);
        }}
      />
      {insightBreak && (
        <InsightInterrupt
          moment={{
            key: insightBreak.key,
            eyebrow: `${insightBreak.eyebrow} · ${insightBreak.answers} picks`,
            title: insightBreak.headline,
            body: insightBreak.detail,
            details: insightBreak.details ?? [],
            conversationPrompt: insightBreak.prompt,
            experiment: insightBreak.experiment,
          }}
          onContinue={() => setInsightBreak(null)}
        />
      )}
      <header className="flex flex-col gap-2 border-b border-neutral-200 bg-neutral-50/95 px-4 pb-2.5 pt-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Couples check-in · part {perspective === "SELF" ? "2" : "1"} of 2
          </span>

          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-[11px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">
              Lv {level}
            </span>
            <a
              href="/insights"
              className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-800 hover:bg-amber-500/20 dark:bg-amber-400/10 dark:text-amber-300"
            >
              ✨ Insights
            </a>
            <button
              onClick={() => setPaused(true)}
              className="shrink-0 rounded-full border border-neutral-300 px-2 py-0.5 text-[11px] font-semibold text-neutral-600 transition active:scale-95 dark:border-neutral-700 dark:text-neutral-300"
            >
              Pause
            </button>
          </div>
        </div>

        <div className={`flex items-center justify-between rounded-xl border-2 px-3.5 py-2 text-xs font-semibold shadow-xs ${PERSPECTIVE_META[perspective].badgeStyle} ${PERSPECTIVE_META[perspective].accentBorder}`}>
          <div className="flex items-center gap-2 truncate">
            <span className="text-base">{PERSPECTIVE_META[perspective].glyph}</span>
            <span className="truncate font-bold tracking-tight">
              Focus: {PERSPECTIVE_META[perspective].short} · {PERSPECTIVE_META[perspective].label}
            </span>
          </div>
          <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-wide opacity-90">
            {focusAnswers || 1}/{PICKS_PER_FOCUS}
          </span>
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
          <p className="text-center text-sm font-extrabold tracking-tight text-neutral-900 dark:text-neutral-50">
            {getInstructions(currentDomain.kind, perspective)}
          </p>
        )}

        <p className="text-center text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
          Choose the closer card · first impressions are enough
        </p>

        {toNextLevel === SWIPES_PER_LEVEL && totalPoints > 0 && (
          <p className="text-center text-[11px] font-bold text-amber-700 dark:text-amber-300">
            <span aria-hidden="true">⭐</span> Level {level} — new insights may be ready
          </p>
        )}
        {cuteNote && (
          <p className="text-center text-[11px] font-medium text-amber-700 dark:text-amber-300">
            {cuteNote.en}
          </p>
        )}
        {/* Announced, not just shown: a failure while swiping is otherwise
            silent for anyone not looking at this strip. */}
        {error && (
          <p role="alert" className="text-center text-xs font-medium text-red-600 dark:text-red-400">
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
            onSkip={handleSkip}
            onUndo={handleUndo}
            canUndo={!!undoableSlug}
          />
        ) : (
          <ItemsTrialView
            trial={trial}
            submitting={submitting}
            onAnswer={handleAnswer}
            onSkip={handleSkip}
            onUndo={handleUndo}
            canUndo={!!undoableSlug}
          />
        )}
        {trial && (
          <p className="mt-1 hidden text-center text-[10px] font-medium text-neutral-500 sm:block dark:text-neutral-400">
            Keyboard: <kbd className="rounded border border-neutral-300 px-1 dark:border-neutral-700">←</kbd> Left &bull; <kbd className="rounded border border-neutral-300 px-1 dark:border-neutral-700">→</kbd> Right &bull; <kbd className="rounded border border-neutral-300 px-1 dark:border-neutral-700">↓</kbd> Skip &bull; <kbd className="rounded border border-neutral-300 px-1 dark:border-neutral-700">Z</kbd> Undo
          </p>
        )}
      </div>
    </div>
  );
}
