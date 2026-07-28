"use client";

import { useCallback, useEffect, useState } from "react";
import { Celebration } from "@/components/Celebration";
import { cuteBreakForCount } from "@/lib/cuteMessages";
import { DomainState, pickNextDomain, randomStreakTarget } from "@/lib/domainScheduler";
import { answersIntoLevel, answersUntilNextLevel, levelForAnswers, SWIPES_PER_LEVEL } from "@/lib/insights";
import {
  parseSessionBundle,
  SESSION_KEY,
  writeSessionBundle,
  type SessionBundle,
} from "@/lib/sessionStore";
import {
  DEFAULT_PERSPECTIVE,
  PERSPECTIVE_META,
  PERSPECTIVE_ORDER,
  parsePerspective,
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

type IntroForm = {
  firstName: string;
  lastName: string;
  email: string;
  sex: string;
  age: string;
  ethnicity: string;
  countryOfResidence: string;
};

/** Always on screen while swiping, so it's never ambiguous who you're rating for. */
const PERSPECTIVE_SHORT: Record<PerspectiveValue, string> = Object.fromEntries(
  PERSPECTIVE_ORDER.map((k) => [k, `${PERSPECTIVE_META[k].glyph} ${PERSPECTIVE_META[k].short}`])
) as Record<PerspectiveValue, string>;

/** Blank by default — no personal data baked into the client bundle. */
const DEFAULT_INTRO: IntroForm = {
  firstName: "",
  lastName: "",
  email: "",
  sex: "",
  age: "",
  ethnicity: "",
  countryOfResidence: "",
};

export function UnifiedRunner() {
  const [phase, setPhase] = useState<"loading" | "welcome" | "name-entry" | "running" | "thanks">("loading");
  const [perspective, setPerspective] = useState<PerspectiveValue>(DEFAULT_PERSPECTIVE);
  const [intro, setIntro] = useState<IntroForm>(DEFAULT_INTRO);
  const [firstName, setFirstName] = useState("");
  const [participants, setParticipants] = useState<Record<string, string>>({});
  const [domains, setDomains] = useState<DomainState[]>([]);
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const [streakRemaining, setStreakRemaining] = useState(0);
  const [trial, setTrial] = useState<Trial | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cuteNote, setCuteNote] = useState<{ en: string; fa: string } | null>(null);
  const [burst, setBurst] = useState(0);
  const [undoableSlug, setUndoableSlug] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [accountName, setAccountName] = useState<string | null>(null);

  /**
   * Fills the per-domain counters in from the server. Resuming without this
   * shows every progress bar at zero for someone who has already answered
   * hundreds of questions, which reads as "my answers were lost".
   */
  const hydrateProgress = useCallback((forParticipants: Record<string, string>) => {
    fetch("/api/session/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participants: forParticipants }),
    })
      .then((r) => r.json())
      .then((data) => {
        setDomains((prev) => prev.map((d) => (data.status?.[d.slug] ? { ...d, ...data.status[d.slug] } : d)));
      })
      .catch(() => {});
  }, []);

  const resumeFrom = useCallback(
    (bundle: SessionBundle) => {
      const stored = parsePerspective(bundle.perspective);
      if (stored) setPerspective(stored);
      setFirstName(bundle.firstName);
      setParticipants(bundle.participants);
      setDomains(bundle.domains.map((d) => ({ ...d, confidence: 0, answeredCount: 0 })));
      setPhase("running");
      hydrateProgress(bundle.participants);
    },
    [hydrateProgress]
  );

  useEffect(() => {
    // A signed-in account is the source of truth — it lets progress resume on
    // a device that has nothing in localStorage.
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.user) return;
        setAccountName(data.user.firstName);
        if (data.surveys?.length && data.participants && Object.keys(data.participants).length) {
          const bundle: SessionBundle = {
            firstName: data.user.firstName,
            // Without this the account-resume path drops which perspective
            // the participants belong to, and the badge above the cards then
            // claims you're rating something you aren't.
            perspective: parsePerspective(data.perspective) ?? undefined,
            participants: data.participants,
            domains: data.surveys,
          };
          writeSessionBundle(bundle);
          resumeFrom(bundle);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [resumeFrom]);

  useEffect(() => {
    const bundle = parseSessionBundle(localStorage.getItem(SESSION_KEY));
    // Reading the stored session is a synchronous external-store read on
    // mount; the `loading` phase exists precisely so this cannot flash.
    // Tracked in IMPROVEMENT-PLAN.md as "move the runner onto
    // useSessionBundle", which removes the effect entirely.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (bundle) resumeFrom(bundle);
    else setPhase("welcome");
    // Bootstrap once, on mount. `resumeFrom` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchNext = useCallback(
    async (slug: string, pid: string, kind: DomainState["kind"]) => {
      setError(null);
      const endpoint = kind === "ITEMS" ? "/api/trials/next" : "/api/financial-trials/next";
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
      setTrial(data);
      const totalPoints = domains.reduce((s, d) => s + d.answeredCount, 0);
      setCuteNote(cuteBreakForCount(totalPoints));
      setDomains((prev) =>
        prev.map((d) => (d.slug === slug ? { ...d, confidence: data.confidence, answeredCount: data.answeredCount } : d))
      );
    },
    [domains]
  );

  useEffect(() => {
    if (phase !== "running" || trial || domains.length === 0) return;
    let slug = currentSlug;
    let streak = streakRemaining;
    if (!slug || streak <= 0) {
      slug = pickNextDomain(domains, slug);
      streak = randomStreakTarget();
      // The scheduler's choice has to survive to the next render, and that
      // render is the one that shows the card. Tracked in IMPROVEMENT-PLAN.md
      // alongside the rest of the runner's state model.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentSlug(slug);
      setStreakRemaining(streak);
    }
    const pid = participants[slug];
    const domain = domains.find((d) => d.slug === slug);
    if (pid && domain) fetchNext(slug, pid, domain.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, trial, domains.length, currentSlug, retryTick]);

  /**
   * Straight from the welcome screen into swiping — no form first. Details
   * are asked for later (or never), because the fastest possible path to
   * the first card is what makes people actually start.
   */
  async function beginSwiping(p: PerspectiveValue) {
    setPerspective(p);
    setError(null);
    const name = accountName ?? "Anonymous";
    try {
      const res = await fetch("/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perspective: p, firstName: name }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.surveys?.length || !data?.participants) {
        setError("Couldn't start. Try again.");
        return;
      }
      const bundle: SessionBundle = {
        firstName: name,
        perspective: p,
        participants: data.participants,
        domains: data.surveys,
      };
      writeSessionBundle(bundle);
      setFirstName(name);
      setParticipants(data.participants);
      setDomains(
        data.surveys.map((s: { slug: string; title: string; kind: DomainState["kind"] }) => ({
          ...s,
          confidence: 0,
          answeredCount: 0,
        }))
      );
      setPhase("running");
    } catch {
      setError("Couldn't start. Try again.");
    }
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    const name = intro.firstName.trim();
    if (!name) return;
    setError(null);
    const age = intro.age.trim() ? Number(intro.age) : undefined;
    const res = await fetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        perspective,
        firstName: name,
        lastName: intro.lastName.trim() || undefined,
        email: intro.email.trim() || undefined,
        sex: intro.sex.trim() || undefined,
        age,
        ethnicity: intro.ethnicity.trim() || undefined,
        countryOfResidence: intro.countryOfResidence.trim() || undefined,
      }),
    });
    if (!res.ok) {
      setError("Couldn't start. Try again.");
      return;
    }
    const data = await res.json();
    if (!data?.surveys?.length || !data?.participants) {
      setError("Couldn't start — the server sent back an empty session.");
      return;
    }
    const bundle: SessionBundle = {
      firstName: name,
      perspective,
      participants: data.participants,
      domains: data.surveys,
    };
    writeSessionBundle(bundle);
    setFirstName(name);
    setParticipants(data.participants);
    setDomains(data.surveys.map((s: { slug: string; title: string; kind: DomainState["kind"] }) => ({ ...s, confidence: 0, answeredCount: 0 })));
    setPhase("running");
  }

  function updateIntro<K extends keyof IntroForm>(key: K, value: IntroForm[K]) {
    setIntro((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAnswer(result: "A" | "B" | "EQUAL") {
    if (!trial || submitting || !currentSlug) return;
    const domain = domains.find((d) => d.slug === currentSlug);
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
      ok = res.ok;
    } catch {
      ok = false;
    }
    setSubmitting(false);
    if (!ok) {
      setError("That didn't save — check your connection and tap again.");
      return;
    }
    setBurst((n) => n + 1);
    setUndoableSlug(currentSlug);
    setTrial(null);
    const remaining = streakRemaining - 1;
    if (remaining <= 0) {
      const next = pickNextDomain(domains, currentSlug);
      setCurrentSlug(next);
      setStreakRemaining(randomStreakTarget());
    } else {
      setStreakRemaining(remaining);
    }
  }

  /** Tinder-style rewind of the most recent answer in the domain it was made in. */
  async function handleUndo() {
    if (!undoableSlug || submitting) return;
    const domain = domains.find((d) => d.slug === undoableSlug);
    const pid = participants[undoableSlug];
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
    setDomains((prev) =>
      prev.map((d) => (d.slug === undoableSlug ? { ...d, answeredCount: Math.max(0, d.answeredCount - 1) } : d))
    );
    // Go back to the domain the undone answer belonged to, and pull a fresh question there.
    setCurrentSlug(undoableSlug);
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

  if (phase === "name-entry") {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-5 py-10">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Quick pick 💛</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            One continuous session — it moves between topics on its own.
          </p>
        </div>

        <form onSubmit={handleStart} className="flex flex-col gap-4">
          <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            Just a few details so your answers can be told apart from anyone else&apos;s. Only the first
            name is required — leave the rest blank if you&apos;d rather not say.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="First name">
              <input
                autoFocus
                value={intro.firstName}
                onChange={(e) => updateIntro("firstName", e.target.value)}
                className={inputClass}
                placeholder="Required"
                maxLength={60}
              />
            </Field>
            <Field label="Last name">
              <input
                value={intro.lastName}
                onChange={(e) => updateIntro("lastName", e.target.value)}
                className={inputClass}
                placeholder="Optional"
                maxLength={60}
              />
            </Field>
            <Field label="Email" className="col-span-2">
              <input
                type="email"
                value={intro.email}
                onChange={(e) => updateIntro("email", e.target.value)}
                className={inputClass}
                placeholder="Optional"
                maxLength={120}
              />
            </Field>
            <Field label="Sex">
              <select value={intro.sex} onChange={(e) => updateIntro("sex", e.target.value)} className={inputClass}>
                <option value="">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Age">
              <input
                type="number"
                inputMode="numeric"
                value={intro.age}
                onChange={(e) => updateIntro("age", e.target.value)}
                className={inputClass}
                placeholder="Optional"
                min={13}
                max={120}
              />
            </Field>
            <Field label="Ethnicity">
              <input
                value={intro.ethnicity}
                onChange={(e) => updateIntro("ethnicity", e.target.value)}
                className={inputClass}
                placeholder="Optional"
                maxLength={60}
              />
            </Field>
            <Field label="Country">
              <input
                value={intro.countryOfResidence}
                onChange={(e) => updateIntro("countryOfResidence", e.target.value)}
                className={inputClass}
                placeholder="Optional"
                maxLength={60}
              />
            </Field>
          </div>

          <button
            type="submit"
            className="mt-1 rounded-2xl bg-amber-500 px-4 py-4 text-base font-semibold text-neutral-950 shadow-sm transition active:scale-[0.98] disabled:opacity-50"
            disabled={!intro.firstName.trim()}
          >
            Start
          </button>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </form>
      </div>
    );
  }

  if (phase === "thanks") {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-5 py-10 text-center">
        <div className="text-4xl">💛</div>
        <h1 className="text-2xl font-bold">Thank you, {firstName}</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          دوستت دارم — come back anytime, it&apos;ll pick up right where you left off.
        </p>
        <button
          onClick={() => setPhase("running")}
          className="mt-2 rounded-2xl bg-amber-500 px-5 py-3 text-sm font-semibold text-neutral-950 shadow-sm transition active:scale-[0.98]"
        >
          Keep going
        </button>
      </div>
    );
  }

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
            onClick={() => setPhase("thanks")}
            className="shrink-0 rounded-full border border-neutral-300 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-600 transition active:scale-95 dark:border-neutral-700 dark:text-neutral-300"
          >
            Pause
          </button>
        </div>

        <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
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
            ⭐ Level {level} — new insights may be ready
          </p>
        )}
        {cuteNote && (
          <p className="text-center text-[11px] font-medium text-amber-700 dark:text-amber-300">
            {cuteNote.en} · <span className="italic">{cuteNote.fa}</span>
          </p>
        )}
        {error && <p className="text-center text-xs font-medium text-red-500">{error}</p>}
      </header>

      <div className="relative flex flex-1 flex-col gap-2 overflow-hidden p-2">
        {burst > 0 && <Celebration burstKey={burst} milestone={burst % 10 === 0} label={`Level ${level}!`} />}
        {!trial ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <CenteredNote>Loading next…</CenteredNote>
            {error && (
              <button
                onClick={() => setRetryTick((n) => n + 1)}
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

const inputClass =
  "rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 ${className ?? ""}`}>
      {label}
      {children}
    </label>
  );
}
