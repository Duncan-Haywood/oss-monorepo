"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSessionBundle } from "@/lib/sessionStore";

type DomainProgress = {
  answeredCount: number;
  confidence: number;
};

type UsageStats = {
  choices: number;
  topics: number;
  strength: number;
};

const EMPTY_STATS: UsageStats = { choices: 0, topics: 0, strength: 0 };

function parseProgress(value: unknown): DomainProgress[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const rows: DomainProgress[] = [];
  for (const progress of Object.values(value)) {
    if (!progress || typeof progress !== "object" || Array.isArray(progress)) return null;
    const { answeredCount, confidence } = progress as Record<string, unknown>;
    if (
      typeof answeredCount !== "number" ||
      !Number.isInteger(answeredCount) ||
      answeredCount < 0 ||
      typeof confidence !== "number" ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1
    ) {
      return null;
    }
    rows.push({ answeredCount, confidence });
  }
  return rows;
}

function summarizeProgress(progress: DomainProgress[]): UsageStats {
  if (progress.length === 0) return EMPTY_STATS;

  return {
    choices: progress.reduce((sum, row) => sum + row.answeredCount, 0),
    topics: progress.filter((row) => row.answeredCount > 0).length,
    strength: Math.round(
      (progress.reduce((sum, row) => sum + row.confidence, 0) / progress.length) * 100,
    ),
  };
}

export function ProfileView() {
  const bundle = useSessionBundle();
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!bundle) return;

    const controller = new AbortController();
    async function loadStats() {
      try {
        const response = await fetch("/api/session/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participants: bundle?.participants }),
          signal: controller.signal,
        });
        const data = await response.json().catch(() => null);
        const progress = response.ok ? parseProgress(data?.status) : null;
        if (!progress) throw new Error("Invalid progress response");
        setStats(summarizeProgress(progress));
        setError(false);
      } catch (loadError) {
        if ((loadError as Error).name !== "AbortError") {
          setError(true);
          setStats(null);
        }
      }
    }

    loadStats();
    return () => controller.abort();
  }, [bundle]);

  const displayedStats = bundle === null ? EMPTY_STATS : stats;
  const cards = [
    { label: "Choices made", value: displayedStats?.choices ?? "—", glyph: "✓" },
    { label: "Topics explored", value: displayedStats?.topics ?? "—", glyph: "◫" },
    { label: "Ranking strength", value: displayedStats ? `${displayedStats.strength}%` : "—", glyph: "↗" },
  ];

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-6">
      <h1 className="text-2xl font-bold">You</h1>

      <section className="flex flex-col gap-3" aria-labelledby="usage-heading">
        <div>
          <h2 id="usage-heading" className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
            Your activity
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            A snapshot of the ranking you&apos;re currently building.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-3">
          {cards.map((card, index) => (
            <div
              key={card.label}
              className={`rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 ${
                index === 0 ? "col-span-2" : ""
              }`}
            >
              <dt className="flex items-center gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                <span aria-hidden="true">{card.glyph}</span>
                {card.label}
              </dt>
              <dd className="mt-2 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-100">
                {card.value}
              </dd>
            </div>
          ))}
        </dl>

        {error ? (
          <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
            Couldn&apos;t load your activity. Try again later.
          </p>
        ) : null}
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
