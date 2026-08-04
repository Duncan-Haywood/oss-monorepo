"use client";

import Link from "next/link";
import { useState } from "react";

export type InsightMoment = {
  key: string;
  eyebrow: string;
  title: string;
  body: string;
  details: string[];
  conversationPrompt: string;
  experiment?: string;
};

export function buildPartnerPromptText(prompt: string): string {
  return `Pairwise gave me a question for us:\n\n“${prompt}”\n\nWhat do you think?`;
}

export function buildInsightMoment(key: string, content: Record<string, unknown>): InsightMoment | null {
  if (key === "tradeoffs") {
    const value = content[key] as {
      summary?: string | null;
      tradeoffs?: { winnerLabel: string; loserLabel: string; rate: number }[];
    };
    const first = value.tradeoffs?.[0];
    if (!first) return null;
    return {
      key,
      eyebrow: "A real trade-off is emerging",
      title: `${first.winnerLabel} tends to beat ${first.loserLabel}`,
      body: value.summary ?? `When those qualities conflict, you choose ${first.winnerLabel.toLowerCase()} more often.`,
      details: [`Chosen in ${Math.round(first.rate * 100)}% of direct comparisons`],
      conversationPrompt: `Would your partner have predicted that ${first.winnerLabel.toLowerCase()} wins for you?`,
    };
  }

  if (key === "value-profile") {
    const value = content[key] as {
      summary?: string | null;
      scores?: { label: string; delta: number; n: number }[];
      archetype?: { name: string; description: string } | null;
    };
    const solid = value.scores?.filter((score) => score.n >= 2).slice(0, 3) ?? [];
    if (solid.length < 2) return null;
    return {
      key,
      eyebrow: "Your priorities are taking shape",
      title: value.archetype?.name ?? `${solid[0].label} is rising`,
      body: value.summary ?? value.archetype?.description ?? "Several choices now point in the same direction.",
      details: solid.map((score) => score.label),
      conversationPrompt: `Which would your partner say matters most to you: ${solid.map((s) => s.label).join(", ")}?`,
    };
  }

  if (key === "category-lean" || key === "disfavored-categories") {
    const categories = content[key] as { name: string; strongestItems?: string[] }[];
    const first = categories?.[0];
    if (!first) return null;
    const lower = key === "disfavored-categories";
    return {
      key,
      eyebrow: lower ? "A lower-priority pattern appeared" : "A pattern is emerging",
      title: lower ? `${first.name} tends to matter less` : `You keep leaning toward ${first.name}`,
      body: lower
        ? "This does not mean you dislike it—only that it tends to lose when other qualities compete with it."
        : "Several separate choices are now reinforcing the same theme.",
      details: first.strongestItems?.slice(0, 3) ?? [],
      conversationPrompt: lower
        ? "Is this truly less important, or something you already take for granted?"
        : `Where does ${first.name.toLowerCase()} show up in your relationship today?`,
    };
  }

  if (key === "top-three") {
    const rows = content[key] as { label: string }[];
    if (!rows?.length) return null;
    return {
      key,
      eyebrow: "Your current front-runners",
      title: rows[0].label,
      body: "These qualities keep surviving direct comparisons, although their exact order can still change.",
      details: rows.slice(0, 3).map((row) => row.label),
      conversationPrompt: "Which one would your partner guess you chose most often?",
    };
  }

  return null;
}

export function InsightInterrupt({ moment, onContinue }: { moment: InsightMoment; onContinue: () => void }) {
  const [copied, setCopied] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState<"up" | "down" | null>(null);

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(buildPartnerPromptText(moment.conversationPrompt));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignore clipboard error
    }
  }

  async function handleSharePrompt() {
    const text = buildPartnerPromptText(moment.conversationPrompt);
    if (!navigator.share) {
      await handleCopyPrompt();
      return;
    }

    try {
      await navigator.share({
        title: "A Pairwise question for us",
        text,
      });
    } catch {
      // The native share sheet also rejects when the person cancels it.
    }
  }

  async function handleFeedback(rating: "UP" | "DOWN") {
    setFeedbackSent(rating === "UP" ? "up" : "down");
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: moment.key,
          usefulness: rating === "UP" ? 5 : 1,
          path: "/app",
        }),
      });
    } catch {
      // Swallowed on purpose — non-critical metrics
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 p-4 backdrop-blur-md">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="insight-moment-title"
        className="w-full max-w-sm rounded-[2rem] border border-amber-300/60 bg-white p-6 shadow-2xl transition-all dark:border-amber-700/60 dark:bg-neutral-900"
      >
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-400">
            ✨ {moment.eyebrow}
          </p>
          <div className="flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400">
            {feedbackSent ? (
              <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">Thanks for feedback!</span>
            ) : (
              <>
                <button
                  onClick={() => handleFeedback("UP")}
                  title="Spot on"
                  aria-label="This insight was accurate"
                  className="rounded-full p-1 transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  👍
                </button>
                <button
                  onClick={() => handleFeedback("DOWN")}
                  title="Missed the mark"
                  aria-label="This insight was inaccurate"
                  className="rounded-full p-1 transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  👎
                </button>
              </>
            )}
          </div>
        </div>

        <h2 id="insight-moment-title" className="mt-2 text-2xl font-bold leading-tight text-neutral-900 dark:text-neutral-50">
          {moment.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          {moment.body}
        </p>

        {moment.details.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {moment.details.map((detail) => (
              <span
                key={detail}
                className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-950 dark:bg-amber-950/80 dark:text-amber-200"
              >
                {detail}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 rounded-2xl bg-amber-50/80 p-3.5 border border-amber-200/50 dark:bg-neutral-800/80 dark:border-neutral-700/50">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
            💬 Conversation prompt for your partner
          </p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-neutral-800 dark:text-neutral-200">
            &ldquo;{moment.conversationPrompt}&rdquo;
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleSharePrompt}
              className="flex-1 rounded-xl bg-amber-500 py-2 text-[11px] font-bold text-neutral-950 transition active:scale-[0.98]"
            >
              💬 Text your partner
            </button>
            <button
              onClick={handleCopyPrompt}
              className="rounded-xl bg-amber-200/60 px-3 py-2 text-[11px] font-bold text-amber-950 transition active:scale-[0.98] dark:bg-amber-900/60 dark:text-amber-200"
            >
              {copied ? "✓ Copied!" : "📋 Copy"}
            </button>
          </div>
        </div>

        {moment.experiment && (
          <div className="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50/80 p-3.5 dark:border-indigo-900 dark:bg-indigo-950/30">
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
              Try this together
            </p>
            <p className="mt-1 text-xs font-medium leading-relaxed text-neutral-800 dark:text-neutral-200">
              {moment.experiment}
            </p>
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onContinue}
            autoFocus
            className="flex-1 rounded-2xl bg-amber-500 py-3 text-sm font-bold text-neutral-950 shadow-sm transition active:scale-[0.98]"
          >
            Keep swiping
          </button>
          <Link
            href="/insights"
            className="rounded-2xl border-2 border-neutral-300 px-4 py-3 text-center text-sm font-semibold transition active:scale-[0.98] dark:border-neutral-700"
          >
            Full insights
          </Link>
        </div>
      </section>
    </div>
  );
}
