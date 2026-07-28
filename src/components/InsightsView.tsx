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
  }, [bundle]);

  if (state === "loading") {
    return <Shell><p className="text-neutral-500">Working out what we know so far…</p></Shell>;
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
        <p className="text-red-500">Couldn&apos;t load your insights.</p>
        <StartLink label="Back" />
      </Shell>
    );
  }

  const intoLevel = data.totalAnswers % SWIPES_PER_LEVEL;
  // At an exact level boundary the bar would sit at 0% right after levelling
  // up, which reads as "stuck". Show it full instead — the level number
  // already ticked over, so a full bar is the honest picture of that moment.
  const justLevelled = intoLevel === 0 && data.totalAnswers > 0;
  const pct = justLevelled ? 100 : Math.round((intoLevel / SWIPES_PER_LEVEL) * 100);
  const readyCount = data.ready?.length ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold">Your insights</h1>
          <Link href="/" className="text-sm font-semibold text-amber-600 underline underline-offset-2 dark:text-amber-400">
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
      </header>

      <ul className="flex flex-col gap-3">
        {INSIGHTS.map((def) => {
          const body = renderInsight(def.key, data.content);
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
              <h2
                className={`font-semibold ${isReady ? "" : "text-neutral-500 dark:text-neutral-400"}`}
              >
                {def.title}
              </h2>
              {isReady ? (
                <>
                  {body}
                  <InsightFeedback subject={def.key} />
                </>
              ) : (
                <>
                  <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{def.teaser}</p>
                  <p className="mt-1.5 text-[11px] text-neutral-400">Not yet — {def.needs.toLowerCase()}</p>
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

function renderInsight(key: string, content: Record<string, unknown>): React.ReactNode | null {
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
          <p className="mt-1.5 rounded-lg bg-neutral-100 px-2 py-1 text-[11px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            Still too close to call — it&apos;s between {r.rivals.slice(0, 3).join(", ")}.
          </p>
        )}
      </div>
    );
  }

  if (key === "top-three") {
    const rows = value as RankedItem[];
    const max = Math.max(...rows.map((r) => r.rating));
    const min = Math.min(...rows.map((r) => r.rating));
    return (
      <ol className="mt-2 flex flex-col gap-2">
        {rows.map((r, i) => (
          <li key={r.label} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">
                {i + 1}. {r.label}
              </span>
              <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">{Math.round(r.rating)}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div
                className="h-full rounded-full bg-amber-500"
                style={{ width: `${max === min ? 100 : 20 + (80 * (r.rating - min)) / (max - min)}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    );
  }

  if (key === "category-lean") {
    const cats = value as { name: string; avg: number; n: number }[];
    return (
      <ol className="mt-2 flex flex-col gap-1.5">
        {cats.slice(0, 4).map((c, i) => (
          <li key={c.name} className="flex items-baseline justify-between gap-2 text-sm">
            <span className={i === 0 ? "font-semibold" : ""}>
              {i + 1}. {c.name}
            </span>
            <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">{Math.round(c.avg)}</span>
          </li>
        ))}
      </ol>
    );
  }

  if (key === "value-profile") {
    const v = value as {
      scores: { key: string; label: string; score: number; delta: number; n: number; se: number }[];
      summary: string | null;
    };
    const solid = v.scores.filter((s) => s.n >= 2);
    if (!solid.length) return null;
    const maxAbs = Math.max(...solid.map((s) => Math.abs(s.delta)), 1);
    return (
      <div className="mt-2">
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
                <span className="w-8 shrink-0 text-right tabular-nums text-neutral-400">
                  {s.delta >= 0 ? "+" : ""}
                  {Math.round(s.delta)}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-neutral-400">
          Relative to your own average. Bars right = you value it more.
        </p>
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
                  <span className="shrink-0 text-neutral-400">vs</span>
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
                <span className="text-[10px] text-neutral-400">
                  {t.winnerWins}–{t.loserWins}
                  {t.ties > 0 ? ` (${t.ties} too close)` : ""} across {t.n} head-to-heads
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-neutral-400">
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
    return (
      <ol className="mt-2 flex flex-col gap-1 text-sm">
        {rows.map((r, i) => (
          <li key={r.label} className="flex items-baseline justify-between gap-2">
            <span>
              {i + 1}. {r.label}
            </span>
            <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
              {Math.round(r.rating)} ±{Math.round(1.96 * r.rd)}
            </span>
          </li>
        ))}
      </ol>
    );
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
