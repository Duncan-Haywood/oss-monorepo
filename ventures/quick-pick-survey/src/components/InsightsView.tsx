"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { INSIGHTS, SWIPES_PER_LEVEL } from "@/lib/insights";
import { InsightFeedback } from "@/components/FeedbackWidget";
import { useSessionBundle } from "@/lib/sessionStore";

type RankedItem = { label: string; category: string | null; rating: number; rd: number; lo: number; hi: number };

type InsightsData = {
  level: number;
  totalAnswers: number;
  answersUntilNextLevel: number;
  ready: string[];
  content: Record<string, unknown>;
  itemsRated: number;
};

export function InsightsView() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [fetchState, setFetchState] = useState<"loading" | "ready" | "error">("loading");
  // Bumped by the retry button; the load effect depends on it, so a bump is
  // how the request is made again without duplicating it here.
  const [reloadTick, setReloadTick] = useState(0);

  const [selectedTab, setSelectedTab] = useState<"ALL" | "COUPLE" | "PICKS" | "CATEGORIES" | "FINANCIAL">("ALL");
  const [leaderboardSearch, setLeaderboardSearch] = useState("");
  const [copiedInsightKey, setCopiedInsightKey] = useState<string | null>(null);

  const bundle = useSessionBundle();
  // `undefined` is "we don't know yet" (server render / hydration) and must
  // not be shown as "you haven't started" — that flashed the empty state on
  // every load for someone who had answers.
  const state = bundle === undefined ? "loading" : bundle === null ? "empty" : fetchState;

  useEffect(() => {
    if (!bundle) return;
    let cancelled = false;
    fetch("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participants: bundle.participants }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setFetchState("ready");
      })
      .catch(() => {
        if (!cancelled) setFetchState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [bundle, reloadTick]);

  if (state === "loading") {
    return <Shell><p className="text-neutral-500 dark:text-neutral-400">Working out what we know so far…</p></Shell>;
  }
  if (state === "empty") {
    return (
      <Shell>
        <p className="text-neutral-600 dark:text-neutral-400">Nothing here yet — answer a few first 💛</p>
        <StartLink label="Start swiping" />
      </Shell>
    );
  }
  if (state === "error" || !data) {
    return (
      <Shell>
        <p role="alert" className="text-red-600 dark:text-red-400">Couldn&apos;t load your insights.</p>
        {/* The same failure the couple screen and the runner both recover
            from: one dropped request on a phone. Offer the retry rather than
            sending someone back to the cards to try the whole trip again. */}
        <button
          onClick={() => {
            setFetchState("loading");
            setReloadTick((t) => t + 1);
          }}
          className="rounded-xl border-2 border-neutral-300 px-4 py-2 text-sm font-semibold dark:border-neutral-700"
        >
          Try again
        </button>
        <StartLink label="Back" />
      </Shell>
    );
  }

  const intoLevel = data.totalAnswers % SWIPES_PER_LEVEL;
  const justLevelled = intoLevel === 0 && data.totalAnswers > 0;
  const pct = justLevelled ? 100 : Math.round((intoLevel / SWIPES_PER_LEVEL) * 100);
  const readyCount = data.ready?.length ?? 0;

  const filteredInsights = INSIGHTS.filter((def) => {
    if (selectedTab === "ALL") return true;
    if (selectedTab === "COUPLE") return ["couple-prompt", "value-profile", "deep-profile"].includes(def.key);
    if (selectedTab === "PICKS") return ["top-pick", "bottom-pick", "top-three", "disfavored-items", "confidence-map", "full-ranking"].includes(def.key);
    if (selectedTab === "CATEGORIES") return def.key === "category-lean" || def.key === "disfavored-categories";
    if (selectedTab === "FINANCIAL") return ["tradeoffs", "hours-price", "money-vs-identity"].includes(def.key);
    return true;
  });

  async function handleCopyInsight(key: string, title: string) {
    const text = `Check out my Pairwise insight: "${title}" — https://pairwise.marisstella.dev/insights`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedInsightKey(key);
      setTimeout(() => setCopiedInsightKey(null), 2500);
    } catch {
      // Swallowed
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold">Your insights</h1>
          <Link href="/" className="text-sm font-semibold text-amber-700 underline underline-offset-2 dark:text-amber-400">
            Keep swiping →
          </Link>
        </div>

        <div className="rounded-2xl border-2 border-amber-300/70 bg-amber-50 p-4 dark:border-amber-400/30 dark:bg-amber-950/40">
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold text-amber-700 dark:text-amber-300">⭐ Level {data.level}</span>
            <span className="text-xs font-medium text-amber-800/80 dark:text-amber-300/70">
              {readyCount} of {INSIGHTS.length} insights ready
            </span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-amber-200/70 dark:bg-amber-900/50">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500"
              style={{ width: `${Math.max(pct, 4)}%` }}
            />
          </div>
          <p className="mt-2 text-sm font-medium text-amber-900 dark:text-amber-200">
            {data.totalAnswers} answered · {data.answersUntilNextLevel} to level {data.level + 1}
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs font-semibold">
          {[
            { id: "ALL", label: `All (${INSIGHTS.length})` },
            { id: "COUPLE", label: "Couples & Values" },
            { id: "PICKS", label: "Picks & Ranking" },
            { id: "CATEGORIES", label: "Categories" },
            { id: "FINANCIAL", label: "Trade-offs" },
          ].map((tab) => {
            const active = selectedTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedTab(tab.id as typeof selectedTab)}
                className={`shrink-0 rounded-full px-3 py-1.5 transition-all ${
                  active
                    ? "bg-amber-500 text-neutral-950 font-bold shadow-sm"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      <ul className="flex flex-col gap-3">
        {filteredInsights.map((def) => {
          const body = renderInsight(def.key, data.content, leaderboardSearch, setLeaderboardSearch);
          const isReady = !!body;
          return (
            <li
              key={def.key}
              className={`rounded-2xl border p-4 ${
                isReady
                  ? "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
                  : "border-dashed border-neutral-300 bg-neutral-100/60 dark:border-neutral-700 dark:bg-neutral-900/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2
                  className={`font-semibold ${isReady ? "" : "text-neutral-500 dark:text-neutral-400"}`}
                >
                  {def.title}
                </h2>
                {isReady && (
                  <button
                    onClick={() => handleCopyInsight(def.key, def.title)}
                    className="shrink-0 text-[11px] font-semibold text-amber-700 hover:underline dark:text-amber-400"
                  >
                    {copiedInsightKey === def.key ? "✓ Copied!" : "📋 Share"}
                  </button>
                )}
              </div>
              {isReady ? (
                <>
                  {body}
                  <InsightFeedback subject={def.key} />
                </>
              ) : (
                <>
                  <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{def.teaser}</p>
                  <p className="mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">Not yet — {def.needs.toLowerCase()}</p>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <Link
        href="/"
        className="mt-1 rounded-2xl bg-amber-500 px-4 py-4 text-center text-base font-semibold text-neutral-950 shadow-sm active:scale-[0.98]"
      >
{readyCount === INSIGHTS.length ? "Keep swiping to sharpen these" : "Keep swiping — more will open up"}
      </Link>
    </main>
  );
}

function renderInsight(
  key: string,
  content: Record<string, unknown>,
  search = "",
  onSearchChange?: (val: string) => void
): React.ReactNode | null {
  const value = content[key];
  if (!value) return null;

  if (key === "top-pick" || key === "bottom-pick") {
    const r = value as RankedItem & { contested?: boolean; rivals?: string[] };
    return (
      <div className="mt-1">
        <p className="text-lg font-bold">{r.label}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {Math.round(r.rating)} ± {Math.round(1.96 * r.rd)}
        </p>
        {r.contested && r.rivals && r.rivals.length > 1 && (
          <p className="mt-1.5 rounded-lg bg-neutral-100 px-2 py-1 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
            Still too close to call — it&apos;s between {r.rivals.slice(0, 3).join(", ")}.
          </p>
        )}
      </div>
    );
  }

  if (key === "couple-prompt") {
    const prompt = value as { label: string; category: string; contrast?: string };
    const promptText = `Which one did you think I would choose: ${prompt.label}${prompt.contrast ? ` or ${prompt.contrast}` : ""}?`;
    const partnerText = `Hey! Quick question for us:\n\n“${promptText}”`;

    const copyPrompt = async () => {
      try {
        await navigator.clipboard.writeText(partnerText);
      } catch {}
    };

    const handleSharePartnerPrompt = async () => {
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({
            title: "Question for Us",
            text: partnerText,
          });
          return;
        } catch {}
      }
      await copyPrompt();
    };

    return (
      <div className="mt-2 rounded-xl bg-amber-50 p-3.5 border border-amber-200/70 dark:bg-amber-950/40 dark:border-amber-800/60">
        <p className="text-base font-bold text-neutral-900 dark:text-neutral-100">{prompt.label}</p>
        {prompt.contrast && (
          <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
            This currently sits clearly ahead of “{prompt.contrast}.”
          </p>
        )}
        <div className="mt-3 rounded-lg bg-amber-100/70 p-2.5 dark:bg-amber-900/40">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
            💬 Text for your partner
          </p>
          <p className="mt-1 text-xs font-semibold text-amber-950 dark:text-amber-100">
            &ldquo;{promptText}&rdquo;
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => void handleSharePartnerPrompt()}
            className="flex-1 rounded-lg bg-amber-500 py-1.5 px-3 text-xs font-bold text-neutral-950 shadow-2xs transition active:scale-[0.98] hover:bg-amber-400"
          >
            📲 Text your partner
          </button>
          <button
            onClick={() => void copyPrompt()}
            className="rounded-lg border border-amber-300 bg-amber-100/60 px-3 py-1.5 text-xs font-bold text-amber-900 transition dark:border-amber-700 dark:bg-amber-900/50 dark:text-amber-200"
          >
            📋 Copy
          </button>
        </div>
      </div>
    );
  }

  if (key === "top-three" || key === "disfavored-items") {
    const rows = value as RankedItem[];
    const max = Math.max(...rows.map((r) => r.rating));
    const min = Math.min(...rows.map((r) => r.rating));
    const isDisfavored = key === "disfavored-items";
    return (
      <ol className="mt-2 flex flex-col gap-2">
        {rows.map((r, i) => (
          <li key={r.label} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className={`text-sm font-semibold ${isDisfavored ? "text-rose-700 dark:text-rose-400" : ""}`}>
                {i + 1}. {r.label}
              </span>
              <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">{Math.round(r.rating)}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div
                className={`h-full rounded-full ${isDisfavored ? "bg-rose-500" : "bg-amber-500"}`}
                style={{ width: `${max === min ? 100 : 20 + (80 * (r.rating - min)) / (max - min)}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    );
  }

  if (key === "category-lean" || key === "disfavored-categories") {
    const cats = value as { name: string; avg: number; n: number; strongestItems?: string[] }[];
    const isDisfavored = key === "disfavored-categories";
    const shown = cats.slice(0, 5);
    const max = Math.max(...shown.map((c) => c.avg));
    const min = Math.min(...shown.map((c) => c.avg));
    return (
      <ol className="mt-3 flex flex-col gap-3">
        {shown.map((c, i) => (
          <li key={c.name} className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800/60">
            <div className="flex items-baseline justify-between gap-2">
              <span className={`text-sm font-semibold ${i === 0 && isDisfavored ? "text-rose-700 dark:text-rose-400" : ""}`}>
                {i + 1}. {c.name}
              </span>
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400">{c.n} measured</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
              <div
                className={`h-full rounded-full ${isDisfavored ? "bg-rose-500" : "bg-amber-500"}`}
                style={{ width: `${max === min ? 100 : 25 + (75 * (c.avg - min)) / (max - min)}%` }}
              />
            </div>
            {!!c.strongestItems?.length && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400">
                Driven by {c.strongestItems.join(", ")}
              </p>
            )}
          </li>
        ))}
      </ol>
    );
  }

  if (key === "value-profile") {
    const v = value as {
      scores: { key: string; label: string; score: number; delta: number; n: number; se: number }[];
      summary: string | null;
      archetype?: { name: string; tagline: string; traits: string[]; description: string } | null;
    };
    const solid = v.scores.filter((s) => s.n >= 2);
    if (!solid.length) return null;
    const maxAbs = Math.max(...solid.map((s) => Math.abs(s.delta)), 1);
    return (
      <div className="mt-2">
        {v.archetype && (
          <div className="mb-4 rounded-xl border border-amber-300/70 bg-gradient-to-br from-amber-50 to-amber-100/50 p-3.5 dark:border-amber-400/30 dark:from-amber-950/50 dark:to-amber-900/20">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">Personality Archetype</span>
            <h3 className="mt-0.5 text-base font-bold text-amber-950 dark:text-amber-100">{v.archetype.name}</h3>
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{v.archetype.tagline}</p>
            <p className="mt-1.5 text-xs text-amber-900/90 dark:text-amber-200">{v.archetype.description}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {v.archetype.traits.map((t) => (
                <span key={t} className="rounded-md bg-amber-200/80 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
        {v.summary && <p className="mb-3 text-sm font-medium">{v.summary}</p>}
        <ul className="flex flex-col gap-2">
          {solid.map((s) => {
            const pct = (Math.abs(s.delta) / maxAbs) * 50;
            const positive = s.delta >= 0;
            return (
              <li key={s.key} className="flex items-center gap-2 text-xs">
                <span className="w-28 shrink-0 truncate text-neutral-600 dark:text-neutral-400">{s.label}</span>
                <span className="relative h-3 flex-1 rounded-full bg-neutral-200 dark:bg-neutral-800">
                  <span className="absolute inset-y-0 left-1/2 w-px bg-neutral-400 dark:bg-neutral-600" />
                  <span
                    className={`absolute inset-y-0 rounded-full ${positive ? "bg-amber-500" : "bg-neutral-400 dark:bg-neutral-500"}`}
                    style={
                      positive
                        ? { left: "50%", width: `${pct}%` }
                        : { right: "50%", width: `${pct}%` }
                    }
                  />
                </span>
                <span className="w-8 shrink-0 text-right tabular-nums text-neutral-500 dark:text-neutral-400">
                  {s.delta >= 0 ? "+" : ""}
                  {Math.round(s.delta)}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
          Relative to your own average. Bars right = you value it more.
        </p>
      </div>
    );
  }

  if (key === "deep-profile") {
    const profile = value as {
      version: string;
      coverage: number;
      signals: {
        key: string;
        label: string;
        family: "need" | "bond" | "style" | "future" | "tension";
        evidenceCount: number;
        confidence: "early" | "developing" | "strong";
        explanation: string;
        evidence: {
          label: string;
          direction: "supports" | "pushes-against";
          rationale: string;
        }[];
      }[];
    };
    const familyLabel = {
      need: "What helps you thrive",
      bond: "How connection forms",
      style: "How care is expressed",
      future: "The life you are building toward",
      tension: "A trade-off worth discussing",
    };
    return (
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          Built from {profile.coverage} rated cards. Open any pattern to see exactly which choices produced it.
        </p>
        {profile.signals.slice(0, 8).map((signal) => (
          <details key={signal.key} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/60">
            <summary className="cursor-pointer list-none">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    {familyLabel[signal.family]}
                  </p>
                  <p className="mt-0.5 text-sm font-bold">{signal.label}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-neutral-600 shadow-sm dark:bg-neutral-900 dark:text-neutral-300">
                  {signal.confidence} · {signal.evidenceCount} cards
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">{signal.explanation}</p>
            </summary>
            <div className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-700">
              <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Where this came from</p>
              <ul className="mt-2 flex flex-col gap-2">
                {signal.evidence.map((row) => (
                  <li key={`${signal.key}-${row.label}`} className="text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{row.label}</span>
                      <span className={row.direction === "supports" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}>
                        {row.direction === "supports" ? "supports" : "counter-signal"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">{row.rationale}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[10px] text-neutral-500 dark:text-neutral-400">
                Relative pattern, not a diagnosis. Taxonomy {profile.version}.
              </p>
            </div>
          </details>
        ))}
      </div>
    );
  }

  if (key === "tradeoffs") {
    const v = value as {
      tradeoffs: {
        winnerLabel: string; loserLabel: string; winnerWins: number;
        loserWins: number; ties: number; n: number; rate: number;
      }[];
      summary: string | null;
    };
    if (!v.tradeoffs?.length) return null;
    return (
      <div className="mt-2">
        {v.summary && <p className="mb-3 text-sm font-medium">{v.summary}</p>}
        <ul className="flex flex-col gap-2.5">
          {v.tradeoffs.map((t, i) => {
            const pct = Math.round(t.rate * 100);
            return (
              <li key={i} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-semibold">{t.winnerLabel}</span>
                  <span className="shrink-0 text-neutral-500 dark:text-neutral-400">vs</span>
                  <span className="text-neutral-500 dark:text-neutral-400">{t.loserLabel}</span>
                </div>
                <div className="flex h-4 w-full overflow-hidden rounded-md">
                  <div
                    className="flex items-center justify-start bg-amber-500 pl-1.5 text-[10px] font-bold text-neutral-950"
                    style={{ width: `${pct}%` }}
                  >
                    {pct >= 25 ? `${pct}%` : ""}
                  </div>
                  <div className="flex-1 bg-neutral-300 dark:bg-neutral-700" />
                </div>
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                  {t.winnerWins}–{t.loserWins}
                  {t.ties > 0 ? ` (${t.ties} too close)` : ""} across {t.n} head-to-heads
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
          Only counts times these two actually went head to head.
        </p>
      </div>
    );
  }

  if (key === "confidence-map") {
    const rows = value as RankedItem[];
    return (
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {rows.map((r) => (
          <li key={r.label} className="flex items-baseline justify-between gap-2">
            <span>{r.label}</span>
            <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">±{Math.round(1.96 * r.rd)}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (key === "full-ranking") {
    const rows = value as RankedItem[];
    if (!rows.length) return null;
    const max = Math.max(...rows.map((r) => r.rating));
    const min = Math.min(...rows.map((r) => r.rating));
    const filteredRows = search.trim()
      ? rows.filter((r) => r.label.toLowerCase().includes(search.toLowerCase()))
      : rows;

    return (
      <div className="mt-2 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
            Visual Leaderboard across all {rows.length} rated items:
          </p>
        </div>
        {rows.length > 5 && onSearchChange && (
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search rated items…"
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs outline-none focus:border-amber-500 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-100"
          />
        )}
        <ol className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
          {filteredRows.map((r) => {
            const originalIndex = rows.findIndex((item) => item.label === r.label);
            const i = originalIndex >= 0 ? originalIndex : 0;
            const pct = max === min ? 100 : Math.round(12 + (88 * (r.rating - min)) / (max - min));
            const tier = i < 3 ? "S-TIER" : i < 8 ? "A-TIER" : i >= rows.length - 3 ? "DISFAVORED" : "B-TIER";
            const tierBg = i < 3 ? "bg-amber-500 text-neutral-950 font-bold" : i < 8 ? "bg-emerald-700 text-white font-semibold" : i >= rows.length - 3 ? "bg-rose-700 text-white font-semibold" : "bg-neutral-300 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200";
            return (
              <li key={r.label} className="flex items-center gap-2.5 rounded-xl border border-neutral-200 bg-white p-2.5 text-xs dark:border-neutral-800 dark:bg-neutral-900">
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] ${tierBg}`}>
                  #{i + 1} &bull; {tier}
                </span>
                <div className="flex flex-1 flex-col gap-1 min-w-0">
                  <div className="flex justify-between gap-1">
                    <span className="truncate font-bold text-neutral-900 dark:text-neutral-100">{r.label}</span>
                    <span className="shrink-0 font-mono font-semibold text-neutral-500 dark:text-neutral-400">{Math.round(r.rating)}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                    <div
                      className={`h-full rounded-full ${i >= rows.length - 3 ? "bg-rose-500" : "bg-gradient-to-r from-amber-400 to-amber-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  if (key === "trait-profile") {
    const p = value as {
      topLoveLanguages: { trait: string; score: number }[];
      topRelationalDrivers: { trait: string; score: number }[];
      stressResponseProfile: { trait: string; score: number }[];
    };
    return (
      <div className="mt-2.5 flex flex-col gap-3 text-xs">
        {p.topLoveLanguages?.length > 0 && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">Primary Love Languages</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {p.topLoveLanguages.slice(0, 3).map((ll) => (
                <span key={ll.trait} className="rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                  💖 {ll.trait} ({ll.score})
                </span>
              ))}
            </div>
          </div>
        )}

        {p.topRelationalDrivers?.length > 0 && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">Core Relational Drivers</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {p.topRelationalDrivers.slice(0, 4).map((rd) => (
                <span key={rd.trait} className="rounded-lg bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-medium text-amber-950 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200">
                  🧭 {rd.trait}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (key === "emotional-harmony" || key === "stress-dynamics" || key === "energy-pace" || key === "vulnerability-bridge" || key === "growth-ambition") {
    return <ExplainableInsightCard insight={value as ExplainableInsightValue} />;
  }

  if (key === "hours-price") {
    const v = value as { pctPerHour: number; hoursSe: number };
    const pct = v.pctPerHour;
    return (
      <p className="mt-1 text-sm">
        <span className="text-lg font-bold">
          {pct > 0 ? "+" : ""}
          {pct.toFixed(1)}%
        </span>{" "}
        income per extra hour/week — that&apos;s the raise it takes to make one more hour worth it.
      </p>
    );
  }

  if (key === "money-vs-identity") {
    const v = value as { identity: number; money: number };
    const total = v.identity + v.money;
    const identityPct = total > 0 ? Math.round((100 * v.identity) / total) : 50;
    return (
      <div className="mt-2">
        <div className="flex h-6 w-full overflow-hidden rounded-lg">
          <div
            className="flex items-center justify-center bg-amber-500 text-xs font-bold text-neutral-950"
            style={{ width: `${identityPct}%` }}
          >
            {identityPct >= 20 ? `${identityPct}%` : ""}
          </div>
          <div
            className="flex items-center justify-center bg-neutral-400 text-xs font-bold text-neutral-950 dark:bg-neutral-600 dark:text-neutral-50"
            style={{ width: `${100 - identityPct}%` }}
          >
            {100 - identityPct >= 20 ? `${100 - identityPct}%` : ""}
          </div>
        </div>
        <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          Who they are vs. what they have
        </p>
      </div>
    );
  }

  return null;
}

type ExplainableInsightValue = {
  headline: string;
  discovery: string;
  actionablePrescription?: string;
  relationalImpact?: string;
  evidenceTrail?: {
    underlyingMechanism: string;
    cards?: {
      label: string;
      traits?: string[];
      myPercentile: number;
      theirPercentile: number;
    }[];
  };
};

function ExplainableInsightCard({ insight }: { insight?: ExplainableInsightValue }) {
  const [showEvidence, setShowEvidence] = useState(false);
  if (!insight) return null;

  return (
    <div className="mt-2.5 rounded-xl border border-amber-300/60 bg-amber-50/70 p-3.5 dark:border-amber-700/50 dark:bg-amber-950/40">
      <h3 className="text-sm font-bold text-amber-950 dark:text-amber-100">{insight.headline}</h3>
      <p className="mt-1 text-xs text-neutral-800 dark:text-neutral-200">{insight.discovery}</p>

      {/* Prescription */}
      {insight.actionablePrescription && (
        <div className="mt-3 rounded-lg bg-amber-100/80 p-2.5 dark:bg-amber-900/50">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
            🎯 Prescribed Micro-Step for Couple
          </span>
          <p className="mt-0.5 text-xs font-semibold text-amber-950 dark:text-amber-100">
            {insight.actionablePrescription}
          </p>
        </div>
      )}

      {/* Relational Impact */}
      {insight.relationalImpact && (
        <p className="mt-2 text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
          💡 {insight.relationalImpact}
        </p>
      )}

      {/* Evidence Drawer */}
      {insight.evidenceTrail && (
        <div className="mt-3 border-t border-amber-200/60 pt-2 dark:border-amber-800/60">
          <button
            onClick={() => setShowEvidence(!showEvidence)}
            className="flex items-center justify-between text-[11px] font-bold text-amber-800 hover:underline dark:text-amber-300 w-full"
          >
            <span>🔍 {showEvidence ? "Hide Evidence & Trait Analysis" : "Where did this insight come from? (Evidence Trail)"}</span>
            <span>{showEvidence ? "▲" : "▼"}</span>
          </button>

          {showEvidence && (
            <div className="mt-2 flex flex-col gap-2 text-xs">
              <p className="text-[11px] italic text-neutral-600 dark:text-neutral-400">
                {insight.evidenceTrail.underlyingMechanism}
              </p>
              <div className="flex flex-col gap-1.5">
                {insight.evidenceTrail.cards?.map((c, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md bg-white p-2 border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800">
                    <div>
                      <p className="font-semibold text-neutral-900 dark:text-neutral-100">{c.label}</p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {c.traits?.map((t: string) => (
                          <span key={t} className="rounded bg-amber-100 px-1.5 py-0.2 text-[9px] font-bold text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right text-[10px] font-mono text-neutral-600 dark:text-neutral-400 shrink-0">
                      <div>Mine: {c.myPercentile}%ile</div>
                      <div>Theirs: {c.theirPercentile}%ile</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
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

function StartLink({ label }: { label: string }) {
  return (
    <Link href="/" className="rounded-2xl bg-amber-500 px-5 py-3 text-sm font-semibold text-neutral-950">
      {label}
    </Link>
  );
}
