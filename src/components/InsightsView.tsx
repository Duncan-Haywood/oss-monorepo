"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { INSIGHTS, InsightDef, SWIPES_PER_LEVEL } from "@/lib/insights";

const LS_KEY = "survey:unified:session";

type RankedItem = { label: string; category: string | null; rating: number; rd: number; lo: number; hi: number };

type InsightsData = {
  level: number;
  totalAnswers: number;
  swipesUntilNext: number | null;
  next: InsightDef | null;
  unlocked: string[];
  content: Record<string, unknown>;
  itemsRated: number;
};

export function InsightsView() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");

  useEffect(() => {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      setState("empty");
      return;
    }
    let participants: Record<string, string> | null = null;
    try {
      participants = JSON.parse(raw).participants ?? null;
    } catch {
      setState("empty");
      return;
    }
    if (!participants || Object.keys(participants).length === 0) {
      setState("empty");
      return;
    }
    fetch("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participants }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setData(d);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

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
  const pct = Math.round((intoLevel / SWIPES_PER_LEVEL) * 100);

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
              {data.totalAnswers} answered
            </span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-amber-200/70 dark:bg-amber-900/50">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500"
              style={{ width: `${Math.max(pct, 4)}%` }}
            />
          </div>
          {data.next && data.swipesUntilNext !== null ? (
            <p className="mt-2 text-sm font-medium text-amber-900 dark:text-amber-200">
              {data.swipesUntilNext === 0
                ? `“${data.next.title}” is ready to unlock!`
                : `${data.swipesUntilNext} more to unlock “${data.next.title}”`}
            </p>
          ) : (
            <p className="mt-2 text-sm font-medium text-amber-900 dark:text-amber-200">
              Everything unlocked 💛 keep going to sharpen it.
            </p>
          )}
        </div>
      </header>

      <ul className="flex flex-col gap-3">
        {INSIGHTS.map((def, idx) => {
          const isUnlocked = def.level <= data.level;
          const body = renderInsight(def.key, data.content);
          return (
            <li
              key={`${def.key}-${idx}`}
              className={`rounded-2xl border p-4 ${
                isUnlocked
                  ? "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
                  : "border-dashed border-neutral-300 bg-neutral-100/60 dark:border-neutral-700 dark:bg-neutral-900/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className={`font-semibold ${isUnlocked ? "" : "text-neutral-500 dark:text-neutral-400"}`}>
                  {isUnlocked ? "" : "🔒 "}
                  {def.title}
                </h2>
                {!isUnlocked && (
                  <span className="shrink-0 rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    Level {def.level}
                  </span>
                )}
              </div>
              {isUnlocked ? (
                body ?? (
                  <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                    Unlocked — needs a few more answers in this area to say anything solid.
                  </p>
                )
              ) : (
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{def.teaser}</p>
              )}
            </li>
          );
        })}
      </ul>

      <Link
        href="/"
        className="mt-1 rounded-2xl bg-amber-500 px-4 py-4 text-center text-base font-semibold text-neutral-950 shadow-sm active:scale-[0.98]"
      >
        {data.next ? `Swipe ${data.swipesUntilNext ?? ""} more to unlock the next one` : "Keep swiping"}
      </Link>
    </main>
  );
}

function renderInsight(key: string, content: Record<string, unknown>): React.ReactNode | null {
  const value = content[key];
  if (!value) return null;

  if (key === "top-pick" || key === "bottom-pick") {
    const r = value as RankedItem;
    return (
      <div className="mt-1">
        <p className="text-lg font-bold">{r.label}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {Math.round(r.rating)} ± {Math.round(1.96 * r.rd)}
        </p>
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
