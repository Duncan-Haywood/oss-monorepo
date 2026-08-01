"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ShareInsightModal } from "./ShareInsightModal";

type Row = { label: string; a: number; b: number; gap: number };
type Comparison = {
  overlap: number;
  agreement: number | null;
  /** 0–1: how much of the spread in these rankings is preference, not noise. */
  reliability?: number;
  aligned: Row[];
  diverged: Row[];
};

type ActionItem = { label: string; rating: number; rd: number; category: string | null };
type SharedValue = { label: string; aStrength: number; bStrength: number; combined: number };
type Asymmetry = { label: string; theirStrength: number; myStrength: number; gap: number };
type CategoryCompass = {
  shared: { category: string; mine: number; theirs: number; combined: number }[];
  differences: { category: string; mine: number; theirs: number; gap: number }[];
};
type Readiness = {
  ready: boolean;
  mine: number | null;
  theirs: number | null;
  needed: number;
  waitingOn: "you" | "them" | "both" | null;
};

type DateNightIdea = { title: string; category: string | null; sharedItem: string; description: string };
type ConversationStarter = { type: "BLIND_SPOT" | "ASYMMETRY"; itemLabel: string; headline: string; prompt: string };
type ExpressionDimension = { name: string; glyph: string; mineScore: number; theirsScore: number; alignmentPct: number };
type MicroCommitment = { itemLabel: string; category: string | null; challenge: string };
type DeepInsight = {
  key: string;
  label: string;
  mine: number;
  theirs: number;
  pattern: "shared-strength" | "difference" | "complement";
  headline: string;
  interpretation: string;
  prompt: string;
  confidence: { mineCards: number; theirCards: number; overlapCards: number };
  evidence: {
    mine: { label: string; strength: number; contribution: number }[];
    theirs: { label: string; strength: number; contribution: number }[];
  };
  provenance: { taxonomyVersion: string; calculation: string };
};

type ExplainableInsight = {
  id: string;
  title: string;
  headline: string;
  discovery: string;
  evidenceTrail: {
    cards: { label: string; myPercentile: number; theirPercentile: number; traits: string[] }[];
    underlyingMechanism: string;
    confidence: "High" | "Medium" | "Developing";
  };
  relationalImpact: string;
  actionablePrescription: string;
};

type TopSharedItem = {
  label: string;
  myPercentile: number;
  theirPercentile: number;
  combined: number;
  category: string | null;
};

type CompareData = {
  couple: { inviteCode: string; partner: { id: string; firstName: string } | null } | null;
  fit?: Comparison;
  theirFit?: Comparison;
  mirror?: Comparison;
  blindSpots?: Comparison;
  theirBlindSpots?: Comparison;
  selfAlignment?: Comparison;
  topSharedItems?: TopSharedItem[];
  topSelfMatches?: TopSharedItem[];
  makeThemHappy?: ActionItem[];
  makeYouHappy?: ActionItem[];
  shared?: SharedValue[];
  mattersMoreToThem?: Asymmetry[];
  categoryCompass?: CategoryCompass;
  dateNightIdeas?: DateNightIdea[];
  conversationStarters?: ConversationStarter[];
  expressionProfiles?: ExpressionDimension[];
  microCommitments?: MicroCommitment[];
  semanticInsights?: DeepInsight[];
  explainableInsights?: ExplainableInsight[];
  readiness?: {
    makeThemHappy: Readiness;
    makeYouHappy: Readiness;
    shared: Readiness;
    mattersMoreToThem: Readiness;
  };
  counts?: Record<string, number>;
};

export function CoupleView() {
  const [data, setData] = useState<CompareData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "signedout" | "error">("loading");
  const [code, setCode] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("code")?.toUpperCase() ?? "";
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeShareInsight, setActiveShareInsight] = useState<{
    title: string;
    headline: string;
    discovery: string;
    alignmentPct?: number;
  } | null>(null);
  const [challengeLink, setChallengeLink] = useState<string | null>(null);
  const [creatingChallenge, setCreatingChallenge] = useState(false);

  async function handleCreateChallenge() {
    setCreatingChallenge(true);
    try {
      const res = await fetch("/api/couple/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckId: "core-values" }),
      });
      if (res.ok) {
        const result = await res.json();
        setChallengeLink(`${window.location.origin}${result.challengeUrl}`);
      }
    } catch (err) {
      console.error("Failed to create challenge", err);
    }
    setCreatingChallenge(false);
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/couple/compare");
      if (res.status === 401) return setState("signedout");
      if (!res.ok) return setState("error");
      const result = await res.json();
      setData(result);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function createInvite() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/couple/create", { method: "POST" });
      if (!res.ok) setError((await res.json())?.error ?? "Couldn't create an invite.");
      else await load();
    } catch {
      setError("Couldn't create an invite.");
    }
    setBusy(false);
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/couple/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: code }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d?.error ?? "Couldn't join.");
      else {
        setCode("");
        await load();
      }
    } catch {
      setError("Couldn't join.");
    }
    setBusy(false);
  }

  function getShareInfo() {
    const inviteCode = data?.couple?.inviteCode || "";
    const url = typeof window !== "undefined"
      ? `${window.location.origin}/couple?code=${inviteCode}`
      : `https://pairwise.marisstella.dev/couple?code=${inviteCode}`;
    const message = `Join me on Pairwise to compare our preferences! Click here to connect: ${url}`;
    return { inviteCode, url, message };
  }

  async function handleCopyMessage() {
    const { message } = getShareInfo();
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error("Clipboard copy failed", e);
    }
  }

  async function handleShareNative() {
    const { url, message } = getShareInfo();
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Pairwise — Connect with Partner",
          text: message,
          url,
        });
      } catch (e) {
        console.log("Share cancelled or failed", e);
      }
    } else {
      handleCopyMessage();
    }
  }

  const [copiedPromptIndex, setCopiedPromptIndex] = useState<number | null>(null);
  const [copiedIdeaIndex, setCopiedIdeaIndex] = useState<number | null>(null);
  const [completedCommitments, setCompletedCommitments] = useState<Record<string, boolean>>({});
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizAnswerRevealed, setQuizAnswerRevealed] = useState(false);
  const [selectedQuizOption, setSelectedQuizOption] = useState<string | null>(null);

  async function handleCopyStarter(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPromptIndex(index);
      setTimeout(() => setCopiedPromptIndex(null), 2500);
    } catch {
      // Swallowed
    }
  }

  async function handleShareStarter(promptText: string, index: number) {
    const text = `Hey! Question for us: "${promptText}"`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Prompt for Partner",
          text,
        });
        return;
      } catch (e) {
        console.log("Share cancelled or failed", e);
      }
    }
    await handleCopyStarter(text, index);
  }

  async function handleCopyIdea(title: string, desc: string, index: number) {
    const text = `Hey! Found a date idea for us based on what we both love: "${title}" — ${desc}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdeaIndex(index);
      setTimeout(() => setCopiedIdeaIndex(null), 2500);
    } catch {
      // Swallowed
    }
  }

  function toggleCommitment(label: string) {
    setCompletedCommitments((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  if (state === "loading") return <Shell><p className="text-neutral-500 dark:text-neutral-400">Loading…</p></Shell>;

  if (state === "signedout") {
    return (
      <Shell>
        <p className="text-neutral-600 dark:text-neutral-400">
          Comparing needs an account for each of you.
        </p>
        <Link href="/login" className="rounded-2xl bg-amber-500 px-5 py-3 text-sm font-semibold text-neutral-950">
          Sign in
        </Link>
      </Shell>
    );
  }

  if (state === "error" || !data) {
    return (
      <Shell>
        <p role="alert" className="text-red-600 dark:text-red-400">Couldn&apos;t load this.</p>
        <button
          onClick={() => {
            setState("loading");
            load();
          }}
          className="rounded-xl border-2 border-neutral-300 px-4 py-2 text-sm font-semibold dark:border-neutral-700"
        >
          Try again
        </button>
        <Link href="/" className="text-sm underline underline-offset-2">Back</Link>
      </Shell>
    );
  }

  // Not linked yet — show invite + join.
  if (!data.couple || !data.couple.partner) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-10">
        <div className="text-center">
          <div className="text-4xl">💛</div>
          <h1 className="mt-2 text-2xl font-bold">Compare with your partner</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            You both answer on your own. Then you see where you line up — and where you were wrong
            about each other.
          </p>
        </div>

        {data.couple?.inviteCode ? (
          <div className="rounded-2xl border-2 border-amber-300/70 bg-amber-50 p-5 text-center dark:border-amber-400/30 dark:bg-amber-950/40">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
              Send them this code or link
            </p>
            <p className="mt-2 select-all font-mono text-3xl font-bold tracking-widest text-amber-900 dark:text-amber-100">
              {data.couple.inviteCode}
            </p>

            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={handleShareNative}
                className="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-neutral-950 shadow-sm active:scale-[0.98]"
              >
                📲 Share Invite Link & Message
              </button>

              <button
                onClick={handleCopyMessage}
                className="w-full rounded-xl border border-amber-400/60 bg-amber-100/50 py-2.5 text-xs font-semibold text-amber-900 transition-all dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-200"
              >
                {copied ? "✓ Copied to clipboard!" : "📋 Copy Invite Text"}
              </button>
            </div>

            <p className="mt-3 text-xs text-amber-800/80 dark:text-amber-300/70">
              Waiting for them to join…
            </p>
          </div>
        ) : (
          <button
            onClick={createInvite}
            disabled={busy}
            className="rounded-2xl bg-amber-500 px-4 py-4 text-base font-semibold text-neutral-950 disabled:opacity-50"
          >
            Create an invite code
          </button>
        )}

        <form onSubmit={join} className="flex flex-col gap-2">
          <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Or enter their code
          </label>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD-EFGH"
              className="flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-3 font-mono text-base uppercase tracking-widest outline-none focus:border-amber-500 dark:border-neutral-700 dark:bg-neutral-900"
              maxLength={20}
            />
            <button
              type="submit"
              disabled={busy || !code.trim()}
              className="rounded-xl border-2 border-neutral-300 px-4 font-semibold disabled:opacity-40 dark:border-neutral-700"
            >
              Join
            </button>
          </div>
        </form>

        {error && <p role="alert" className="text-center text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
        <Link href="/" className="text-center text-xs text-neutral-500 dark:text-neutral-400 underline underline-offset-2">
          Back to swiping
        </Link>
      </main>
    );
  }

  const partnerName = data.couple.partner.firstName;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">You &amp; {partnerName}</h1>
        <Link href="/" className="text-sm font-semibold text-amber-700 underline underline-offset-2 dark:text-amber-400">
          Swipe →
        </Link>
      </div>

      {!!data.semanticInsights?.length && (
        <section className="rounded-2xl border-2 border-violet-300/70 bg-violet-50/70 p-4 dark:border-violet-700/60 dark:bg-violet-950/25">
          <h2 className="font-bold text-violet-950 dark:text-violet-100">The deeper pattern underneath your choices</h2>
          <p className="mt-1 text-xs leading-relaxed text-violet-800/80 dark:text-violet-300/80">
            Each pattern combines several cards. Open the evidence to see exactly where it came from.
          </p>
          <div className="mt-3 flex flex-col gap-3">
            {data.semanticInsights.map((insight) => (
              <article key={insight.key} className="rounded-xl border border-violet-200 bg-white p-3 dark:border-violet-800 dark:bg-neutral-900">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                      {insight.pattern === "shared-strength" ? "Shared strength" : insight.pattern === "difference" ? "Useful difference" : "Different expression"}
                    </span>
                    <h3 className="mt-0.5 text-sm font-bold">{insight.headline}</h3>
                  </div>
                  <span className="shrink-0 text-[10px] tabular-nums text-neutral-600 dark:text-neutral-400">
                    {insight.mine} you · {insight.theirs} partner
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">{insight.interpretation}</p>
                <div className="mt-2 rounded-lg bg-violet-50 px-2.5 py-2 text-xs font-medium text-violet-950 dark:bg-violet-950/60 dark:text-violet-200">
                  Ask each other: “{insight.prompt}”
                </div>
                <details className="mt-2 text-[11px] text-neutral-600 dark:text-neutral-400">
                  <summary className="cursor-pointer font-semibold text-violet-700 dark:text-violet-400">Why we think this</summary>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div>
                      <p className="font-semibold text-neutral-800 dark:text-neutral-200">Your evidence</p>
                      <ul className="mt-1 space-y-1">
                        {insight.evidence.mine.map((e) => <li key={e.label}>{e.label} · {Math.round(e.strength)}</li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="font-semibold text-neutral-800 dark:text-neutral-200">Their evidence</p>
                      <ul className="mt-1 space-y-1">
                        {insight.evidence.theirs.map((e) => <li key={e.label}>{e.label} · {Math.round(e.strength)}</li>)}
                      </ul>
                    </div>
                  </div>
                  <p className="mt-2 border-t border-neutral-200 pt-2 dark:border-neutral-800">
                    {insight.provenance.calculation} Taxonomy {insight.provenance.taxonomyVersion}.
                  </p>
                </details>
              </article>
            ))}
          </div>
        </section>
      )}

      {!!(data.categoryCompass?.shared.length || data.categoryCompass?.differences.length) && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="font-semibold">Your relationship compass</h2>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            The broader relationship themes underneath your individual answers.
          </p>
          {!!data.categoryCompass.shared.length && (
            <div className="mt-3">
              <h3 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Shared priorities</h3>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {data.categoryCompass.shared.map((row) => (
                  <li
                    key={row.category}
                    className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:text-emerald-300"
                  >
                    {row.category}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!!data.categoryCompass.differences.length && (
            <div className="mt-3">
              <h3 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Worth discussing</h3>
              <ul className="mt-2 flex flex-col gap-2">
                {data.categoryCompass.differences.map((row) => (
                  <li key={row.category}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium">{row.category}</span>
                      <span className="text-neutral-500 dark:text-neutral-400">
                        {Math.round(row.mine)} you · {Math.round(row.theirs)} {partnerName}
                      </span>
                    </div>
                    <div className="mt-1 flex gap-1">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                        <span className="block h-full rounded-full bg-indigo-500" style={{ width: `${row.mine}%` }} />
                      </span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                        <span className="block h-full rounded-full bg-amber-500" style={{ width: `${row.theirs}%` }} />
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {!!data.explainableInsights?.length && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span>🧠</span> Deep Relational Insights &amp; Card Receipts
            </h2>
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              {data.explainableInsights.length} unlocked
            </span>
          </div>

          {data.explainableInsights.map((insight) => (
            <div
              key={insight.id}
              className="rounded-2xl border-2 border-indigo-200/80 bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/40 p-4 shadow-sm dark:border-indigo-800/60 dark:from-neutral-900 dark:via-neutral-900 dark:to-indigo-950/30"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                  {insight.title}
                </span>
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                  ⚡ Confidence: {insight.evidenceTrail.confidence}
                </span>
              </div>

              <h3 className="mt-2 text-base font-bold text-neutral-900 dark:text-neutral-50">
                {insight.headline}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
                {insight.discovery}
              </p>

              {/* Card Evidence Receipts Expander */}
              <div className="mt-3 rounded-xl border border-indigo-200/70 bg-white/80 p-3 dark:border-indigo-900/60 dark:bg-neutral-950/60">
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                  <span>🧾</span> Card Evidence Receipts ({insight.evidenceTrail.cards.length} cards)
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {insight.evidenceTrail.cards.map((c) => (
                    <div key={c.label} className="rounded-lg bg-neutral-50 p-2 text-xs border border-neutral-200/60 dark:bg-neutral-800/50 dark:border-neutral-700/50">
                      <div className="flex justify-between font-semibold">
                        <span>{c.label}</span>
                        <span className="text-amber-800 dark:text-amber-300 font-mono">
                          You: #{c.myPercentile}% · {partnerName}: #{c.theirPercentile}%
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.traits.map((t) => (
                          <span key={t} className="rounded bg-indigo-100/80 px-1.5 py-0.5 text-[9px] font-medium text-indigo-900 dark:bg-indigo-900/70 dark:text-indigo-200">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-neutral-500 dark:text-neutral-400 italic">
                  Mechanism: {insight.evidenceTrail.underlyingMechanism}
                </p>
              </div>

              <div className="mt-3 rounded-xl bg-amber-100/70 p-3 dark:bg-amber-950/40">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                  💡 Actionable Prescription
                </p>
                <p className="mt-0.5 text-xs font-semibold text-amber-950 dark:text-amber-100">
                  {insight.actionablePrescription}
                </p>
              </div>

              {/* Viral Share Action */}
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() =>
                    setActiveShareInsight({
                      title: insight.title,
                      headline: insight.headline,
                      discovery: insight.discovery,
                      alignmentPct:
                        typeof data.fit?.overlap === "number"
                          ? Math.round(data.fit.overlap * 100)
                          : undefined,
                    })
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-700 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-semibold shadow transition"
                >
                  <span>✨</span>
                  <span>Share This Insight</span>
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-2xl border-2 border-amber-300/70 bg-amber-50 p-4 dark:border-amber-400/30 dark:bg-amber-950/30">
        <h2 className="font-bold text-amber-900 dark:text-amber-200">
          What actually makes {partnerName} happy
        </h2>
        <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-300/70">
          Their highest-rated things you can actually do. Start at the top.
        </p>
        {data.makeThemHappy && data.makeThemHappy.length > 0 ? (
          <ol className="mt-3 flex flex-col gap-2">
            {data.makeThemHappy.map((r, i) => (
              <li key={r.label} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-neutral-950">
                  {i + 1}
                </span>
                <span className="font-medium text-amber-900 dark:text-amber-100">{r.label}</span>
              </li>
            ))}
          </ol>
        ) : (
          <Locked
            readiness={data.readiness?.makeThemHappy}
            partnerName={partnerName}
            unlocks="there is anything worth telling you to do"
          />
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold">Matters more to them than to you</h2>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          Not a fault — just where a small effort from you goes further than it would for you.
        </p>
        {data.mattersMoreToThem && data.mattersMoreToThem.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {data.mattersMoreToThem.map((r) => (
              <li key={r.label} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{r.label}</span>
                  <span className="shrink-0 text-[11px] text-neutral-500 dark:text-neutral-400">
                    {describeGap(r.gap)}
                  </span>
                </div>
                <div className="mt-1 flex h-1.5 gap-1">
                  <span className="flex-1 rounded-full bg-neutral-200 dark:bg-neutral-800">
                    <span
                      className="block h-full rounded-full bg-amber-500"
                      style={{ width: `${Math.min(100, Math.max(4, r.gap))}%` }}
                    />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Locked
            readiness={data.readiness?.mattersMoreToThem}
            partnerName={partnerName}
            unlocks="a difference between you means more than a difference in how much you each answered"
          />
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold">What you both want</h2>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          Common ground — the things you&apos;re already aligned on.
        </p>
        {data.shared && data.shared.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {data.shared.map((r) => (
              <li
                key={r.label}
                className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"
              >
                {r.label}
              </li>
            ))}
          </ul>
        ) : (
          <Locked
            readiness={data.readiness?.shared}
            partnerName={partnerName}
            unlocks="common ground can be told apart from coincidence"
          />
        )}
      </section>

      {/* Interactive Partner Quiz Modal Trigger */}
      <section className="rounded-2xl border-2 border-indigo-400/60 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 p-4 dark:border-indigo-500/40">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-indigo-950 dark:text-indigo-100 flex items-center gap-2">
              <span>🎮</span> Partner Preference Quiz
            </h2>
            <p className="mt-0.5 text-xs text-indigo-900/80 dark:text-indigo-200/80">
              Test how well you know {partnerName}&apos;s top priorities in a quick challenge!
            </p>
          </div>
          <button
            onClick={() => {
              setQuizOpen(true);
              setQuizAnswerRevealed(false);
              setSelectedQuizOption(null);
            }}
            className="shrink-0 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition active:scale-95 hover:bg-indigo-700"
          >
            Start Quiz
          </button>
        </div>
      </section>

      {!!data.expressionProfiles?.length && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="font-semibold">Relationship expression profile</h2>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            How your preferences align across four essential dimensions of connection.
          </p>
          <div className="mt-3 flex flex-col gap-3">
            {data.expressionProfiles.map((d) => (
              <div key={d.name} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium flex items-center gap-1.5">
                    <span>{d.glyph}</span> {d.name}
                  </span>
                  <span className="font-bold text-amber-800 dark:text-amber-300">
                    {d.alignmentPct}% alignment
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500"
                    style={{ width: `${Math.max(d.alignmentPct, 4)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!!data.dateNightIdeas?.length && (
        <section className="rounded-2xl border-2 border-emerald-300/70 bg-emerald-50/50 p-4 dark:border-emerald-700/40 dark:bg-emerald-950/30">
          <h2 className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
            <span>💡</span> Date Night &amp; Activity Ideas
          </h2>
          <p className="mt-0.5 text-xs text-emerald-800/80 dark:text-emerald-300/70">
            Concrete things you both love — turned into micro-adventures for you two.
          </p>
          <div className="mt-3 flex flex-col gap-2.5">
            {data.dateNightIdeas.map((idea, idx) => (
              <div key={idea.sharedItem} className="rounded-xl border border-emerald-200/80 bg-white p-3 shadow-sm dark:border-emerald-800/50 dark:bg-neutral-900">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    {idea.title}
                  </p>
                  <button
                    onClick={() => handleCopyIdea(idea.title, idea.description, idx)}
                    className="shrink-0 text-[10px] font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    {copiedIdeaIndex === idx ? "✓ Copied Idea!" : "📋 Copy Idea"}
                  </button>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                  {idea.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {!!data.conversationStarters?.length && (
        <section className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-800/50 dark:bg-indigo-950/30">
          <h2 className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
            <span>💬</span> Spark Conversation Starters
          </h2>
          <p className="mt-0.5 text-xs text-indigo-800/80 dark:text-indigo-300/70">
            Friendly, curious questions to spark meaningful connection tonight.
          </p>
          <div className="mt-3 flex flex-col gap-2.5">
            {data.conversationStarters.map((starter, idx) => (
              <div key={starter.itemLabel} className="rounded-xl border border-indigo-200/70 bg-white p-3 shadow-sm dark:border-indigo-900/60 dark:bg-neutral-900">
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    starter.type === "BLIND_SPOT" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300" : "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300"
                  }`}>
                    {starter.headline}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleShareStarter(starter.prompt, idx)}
                      className="rounded-lg bg-indigo-500 px-2.5 py-1 text-[10px] font-bold text-white shadow-2xs transition active:scale-[0.98] hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-500"
                    >
                      📲 Text Partner
                    </button>
                    <button
                      onClick={() => handleCopyStarter(`Hey! Question for us: "${starter.prompt}"`, idx)}
                      className="shrink-0 text-[10px] font-semibold text-indigo-700 hover:underline dark:text-indigo-400"
                    >
                      {copiedPromptIndex === idx ? "✓ Copied!" : "📋 Copy"}
                    </button>
                  </div>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {starter.prompt}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {!!data.microCommitments?.length && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/40">
          <h2 className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
            <span>🎯</span> Weekly Action Challenge for {partnerName}
          </h2>
          <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-300/70">
            Pick one action item to surprise {partnerName} with this week.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {data.microCommitments.map((mc) => {
              const done = !!completedCommitments[mc.itemLabel];
              return (
                <div
                  key={mc.itemLabel}
                  onClick={() => toggleCommitment(mc.itemLabel)}
                  className={`flex items-start gap-2.5 cursor-pointer rounded-xl border p-3 text-xs transition-all ${
                    done
                      ? "border-emerald-400/80 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40"
                      : "border-amber-200 bg-white dark:border-amber-800 dark:bg-neutral-900"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => toggleCommitment(mc.itemLabel)}
                    className="mt-0.5 h-4 w-4 rounded border-amber-400 accent-amber-700 focus:ring-amber-500"
                  />
                  <div className="flex-1">
                    <span className={`font-bold ${done ? "line-through text-neutral-600 dark:text-neutral-300" : "text-amber-900 dark:text-amber-200"}`}>
                      {mc.itemLabel}:{" "}
                    </span>
                    <span className={done ? "line-through text-neutral-600 dark:text-neutral-300" : "text-neutral-700 dark:text-neutral-300"}>
                      {mc.challenge}
                    </span>
                    {done && (
                      <span className="mt-1 block font-bold text-emerald-700 dark:text-emerald-400">
                        🎉 Planned/Done for {partnerName}!
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Quiz Modal */}
      {quizOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 p-4 backdrop-blur-md">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-[2rem] border border-indigo-300/60 bg-white p-6 shadow-2xl dark:border-indigo-700/60 dark:bg-neutral-900"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                🎮 Quiz Time
              </span>
              <button
                onClick={() => setQuizOpen(false)}
                className="text-xs font-bold text-neutral-600 hover:text-neutral-800 dark:text-neutral-300 dark:hover:text-neutral-100"
              >
                ✕
              </button>
            </div>
            <h3 className="mt-2 text-xl font-bold text-neutral-900 dark:text-neutral-50">
              Guess {partnerName}&apos;s Top Preference!
            </h3>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
              Which of these do you think ranks highest on {partnerName}&apos;s wishlist?
            </p>

            {(() => {
              const realTop = data.makeThemHappy?.[0]?.label ?? data.shared?.[0]?.label ?? "Quality time together";
              const alternatives = [
                realTop,
                "Deep conversations without distractions",
                "Spontaneous weekend trip",
                "Words of affirmation",
              ].sort(() => 0.5 - Math.random());

              return (
                <div className="mt-4 flex flex-col gap-2">
                  {alternatives.map((opt) => {
                    const isSelected = selectedQuizOption === opt;
                    const isCorrect = opt === realTop;
                    let btnStyle = "border-neutral-200 bg-neutral-50 text-neutral-800 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-200";

                    if (quizAnswerRevealed) {
                      if (isCorrect) {
                        btnStyle = "border-emerald-500 bg-emerald-100 font-bold text-emerald-950 dark:bg-emerald-950 dark:text-emerald-200";
                      } else if (isSelected) {
                        btnStyle = "border-rose-400 bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200";
                      }
                    } else if (isSelected) {
                      btnStyle = "border-indigo-500 bg-indigo-50 font-bold text-indigo-950 dark:bg-indigo-950 dark:text-indigo-200";
                    }

                    return (
                      <button
                        key={opt}
                        disabled={quizAnswerRevealed}
                        onClick={() => setSelectedQuizOption(opt)}
                        className={`w-full rounded-xl border p-3 text-left text-xs transition active:scale-[0.98] ${btnStyle}`}
                      >
                        {opt}
                        {quizAnswerRevealed && isCorrect && " ✨ (Actual #1 Choice)"}
                      </button>
                    );
                  })}

                  {!quizAnswerRevealed ? (
                    <button
                      disabled={!selectedQuizOption}
                      onClick={() => setQuizAnswerRevealed(true)}
                      className="mt-3 w-full rounded-xl bg-indigo-600 py-3 text-xs font-bold text-white shadow-sm disabled:opacity-50"
                    >
                      Reveal Answer
                    </button>
                  ) : (
                    <div className="mt-3 text-center">
                      <p className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                        {selectedQuizOption === realTop ? "🎉 Spot on! You know them well!" : `Nice try! Their actual top pick is "${realTop}".`}
                      </p>
                      <button
                        onClick={() => setQuizOpen(false)}
                        className="mt-3 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-neutral-950"
                      >
                        Done
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold">What {partnerName} could do for you</h2>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          Your own top answers — worth saying out loud, since they can&apos;t see this list.
        </p>
        {data.makeYouHappy && data.makeYouHappy.length > 0 ? (
          <ol className="mt-2 flex flex-col gap-1 text-sm">
            {data.makeYouHappy.map((r, i) => (
              <li key={r.label}>
                {i + 1}. {r.label}
              </li>
            ))}
          </ol>
        ) : (
          <Locked
            readiness={data.readiness?.makeYouHappy}
            partnerName={partnerName}
            unlocks="there is anything here worth asking them for"
          />
        )}
      </section>

      {data.topSharedItems && data.topSharedItems.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex items-center gap-2">
            <span className="text-xl">🌟</span>
            <div>
              <h2 className="font-semibold text-amber-950 dark:text-amber-100">Top Shared Answer Favorites</h2>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                Exact options you both placed in your highest percentile tiers.
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {data.topSharedItems.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-xl border border-amber-200/80 bg-white p-3 dark:border-amber-800/50 dark:bg-neutral-900"
              >
                <div>
                  <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{item.label}</p>
                  {item.category && (
                    <span className="inline-block text-[10px] uppercase font-bold tracking-wider text-amber-700 dark:text-amber-400">
                      {item.category}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
                    {item.combined}% Match
                  </span>
                  <p className="mt-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
                    You: {item.myPercentile}% | {partnerName}: {item.theirPercentile}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <Section
        title="Are you what they want?"
        subtitle={`What ${partnerName} wants in a partner vs. what you want for yourself`}
        comparison={data.fit}
        needs={`Needs answers from both of you — you on “for myself”, ${partnerName} on “in a partner”.`}
        alignedLabel="Where you're already aligned"
        divergedLabel="Where you're pulling apart"
      />

      <Section
        title="Your blind spots"
        subtitle={`What you GUESSED ${partnerName} wants vs. what they actually want`}
        comparison={data.blindSpots}
        needs={`Answer a round in “guess what they want” mode to unlock this.`}
        alignedLabel="You read them well here"
        divergedLabel="You were most wrong here"
        highlightDiverged
      />

      <Section
        title={`${partnerName}'s blind spots`}
        subtitle={`What ${partnerName} GUESSED you want vs. what you actually want`}
        comparison={data.theirBlindSpots}
        needs={`${partnerName} needs to answer a round in “guess what they want” mode.`}
        alignedLabel={`${partnerName} read you well here`}
        divergedLabel={`${partnerName} was most wrong here`}
      />

      <Section
        title="Shared taste"
        subtitle={`What you each want in a partner`}
        comparison={data.mirror}
        needs="Both of you need to answer the “in a partner” questions."
        alignedLabel="You agree most on"
        divergedLabel="You disagree most on"
      />

      <Section
        title="Lifestyle & Values Alignment"
        subtitle={`What you value in yourself vs. what ${partnerName} values in themselves`}
        comparison={data.selfAlignment}
        needs="Both of you need to answer the “for myself” questions."
        alignedLabel="Shared personal habits & identity"
        divergedLabel="Different personal priorities"
      />

      {/* Double-Date & Couple-to-Couple Challenge Section */}
      <section className="rounded-2xl border-2 border-purple-300 bg-purple-50 p-5 shadow-sm dark:border-purple-800/60 dark:bg-neutral-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">👥</span>
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-50">Double-Date Challenge</h2>
              <p className="text-xs text-neutral-700 dark:text-neutral-400">Challenge another couple &amp; compare relationship archetypes!</p>
            </div>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-neutral-800 dark:text-neutral-300">
          Send a challenge link to your friends in relationships. Once they complete 8 quick choices, you can see how your couples align on travel, date nights, and life priorities.
        </p>

        {challengeLink ? (
          <div className="mt-4 rounded-xl bg-white p-3 border border-purple-200 dark:bg-neutral-950 dark:border-purple-900/60">
            <p className="text-[11px] font-mono font-semibold text-purple-900 dark:text-purple-300 break-all">{challengeLink}</p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(challengeLink);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="mt-2 w-full py-2 rounded-lg bg-purple-700 hover:bg-purple-800 dark:bg-purple-600 dark:hover:bg-purple-500 text-white font-medium text-xs transition"
            >
              {copied ? "✓ Challenge Link Copied!" : "📋 Copy Challenge Link"}
            </button>
          </div>
        ) : (
          <button
            onClick={handleCreateChallenge}
            disabled={creatingChallenge}
            className="mt-4 w-full py-3 rounded-xl bg-purple-700 hover:bg-purple-800 dark:bg-purple-600 dark:hover:bg-purple-500 text-white font-bold text-sm shadow transition disabled:opacity-50"
          >
            {creatingChallenge ? "Creating Challenge..." : "🔥 Generate Couple Challenge Link"}
          </button>
        )}
      </section>

      <Link
        href="/"
        className="mt-1 rounded-2xl bg-amber-500 px-4 py-4 text-center text-base font-semibold text-neutral-950"
      >
        Answer more to sharpen this
      </Link>

      {activeShareInsight && (
        <ShareInsightModal
          isOpen={!!activeShareInsight}
          onClose={() => setActiveShareInsight(null)}
          title={activeShareInsight.title}
          headline={activeShareInsight.headline}
          discovery={activeShareInsight.discovery}
          alignmentPct={activeShareInsight.alignmentPct}
          coupleNames={{ mine: "You", theirs: partnerName }}
        />
      )}
    </main>
  );
}

function describeGap(gap: number): string {
  if (gap >= 50) return "far higher for them";
  if (gap >= 30) return "much higher for them";
  return "higher for them";
}

function Locked({
  readiness,
  partnerName,
  unlocks,
}: {
  readiness?: Readiness;
  partnerName: string;
  unlocks: string;
}) {
  if (readiness?.ready) {
    return (
      <p className="mt-3 rounded-xl bg-black/5 px-3 py-2.5 text-xs text-neutral-600 dark:bg-white/10 dark:text-neutral-300">
        Nothing stands out here yet. More answers will sharpen it.
      </p>
    );
  }

  const waitingOn = readiness?.waitingOn ?? "both";
  const who =
    waitingOn === "both"
      ? `You and ${partnerName} both need`
      : waitingOn === "them"
        ? `${partnerName} needs`
        : "You need";

  return (
    <div className="mt-3 rounded-xl bg-black/5 px-3 py-2.5 dark:bg-white/10">
      <p className="text-xs text-neutral-600 dark:text-neutral-300">
        <span aria-hidden="true">🔒 </span>
        {who} to answer more before {unlocks}.
      </p>
      {readiness && (
        <div className="mt-2 flex flex-col gap-1.5">
          {readiness.mine !== null && (
            <ReadinessBar label="You" value={readiness.mine} needed={readiness.needed} />
          )}
          {readiness.theirs !== null && (
            <ReadinessBar label={partnerName} value={readiness.theirs} needed={readiness.needed} />
          )}
        </div>
      )}
    </div>
  );
}

function ReadinessBar({ label, value, needed }: { label: string; value: number; needed: number }) {
  const done = Math.min(value, needed);
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px] text-neutral-600 dark:text-neutral-400">
        <span>{label}</span>
        <span>
          {done} of {needed} settled
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label}: ${done} of ${needed} answers settled enough to use`}
        aria-valuemin={0}
        aria-valuemax={needed}
        aria-valuenow={done}
        className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
      >
        <div
          className="h-full rounded-full bg-amber-500"
          style={{ width: `${Math.max((done / needed) * 100, 3)}%` }}
        />
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  comparison,
  needs,
  alignedLabel,
  divergedLabel,
  highlightDiverged,
}: {
  title: string;
  subtitle: string;
  comparison?: Comparison;
  needs: string;
  alignedLabel: string;
  divergedLabel: string;
  highlightDiverged?: boolean;
}) {
  const enough = comparison && comparison.overlap >= 5;
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</p>

      {!enough ? (
        <p className="mt-3 rounded-xl bg-neutral-100 px-3 py-2 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
          🔒 {needs}
        </p>
      ) : (
        <>
          {comparison.agreement === null ? (
            <p className="mt-3 text-[11px] text-neutral-500 dark:text-neutral-400">
              Early days — an overall score would mostly be measuring how much you have both
              answered, not how well your preferences match.
            </p>
          ) : (
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-neutral-600 dark:text-neutral-400">Overall match</span>
                <span className="font-bold">{Math.round(((comparison.agreement + 1) / 2) * 100)}%</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500"
                  style={{ width: `${Math.max(((comparison.agreement + 1) / 2) * 100, 3)}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">Across {comparison.overlap} shared items</p>
            </div>
          )}

          <RowList
            label={alignedLabel}
            rows={comparison.aligned}
            tone="good"
            empty="Nothing is measured finely enough yet to say the two of you agree on it."
          />
          <RowList
            label={divergedLabel}
            rows={comparison.diverged}
            tone={highlightDiverged ? "alert" : "muted"}
            empty="No difference here is bigger than the uncertainty around it yet."
          />
        </>
      )}
    </section>
  );
}

function RowList({
  label,
  rows,
  tone,
  empty,
}: {
  label: string;
  rows: Row[];
  tone: "good" | "muted" | "alert";
  empty: string;
}) {
  const dot = tone === "good" ? "bg-emerald-500" : tone === "alert" ? "bg-rose-500" : "bg-neutral-400";
  if (!rows.length) {
    return (
      <div className="mt-3">
        <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">{label}</p>
        <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">{empty}</p>
      </div>
    );
  }
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">{label}</p>
      <ul className="mt-1 flex flex-col gap-1">
        {rows.slice(0, 4).map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-sm">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            <span className="flex-1 truncate">{r.label}</span>
            <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
              #{r.a} vs #{r.b}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-5 py-10 text-center">
      {children}
    </main>
  );
}
