"use client";

import { useState } from "react";
import Link from "next/link";

interface SamplePair {
  id: number;
  category: string;
  optionA: { label: string; desc: string; icon: string; bg: string };
  optionB: { label: string; desc: string; icon: string; bg: string };
  insight: string;
}

const SAMPLE_PAIRS: SamplePair[] = [
  {
    id: 1,
    category: "Weekend Vibe",
    optionA: {
      label: "Spontaneous Getaway",
      desc: "Pack a bag and drive with no destination in mind",
      icon: "🚗",
      bg: "bg-gradient-to-br from-amber-500/20 to-orange-500/20 border-amber-500/30",
    },
    optionB: {
      label: "Cozy Unplugged Sanctuary",
      desc: "Blankets, good coffee, slow morning with zero agenda",
      icon: "☕",
      bg: "bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border-emerald-500/30",
    },
    insight: "Your gut leans toward unhurried grounding moments.",
  },
  {
    id: 2,
    category: "Connection Focus",
    optionA: {
      label: "Deep Late-Night Talks",
      desc: "Exploring core philosophies, dreams, and hidden fears",
      icon: "🌙",
      bg: "bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border-indigo-500/30",
    },
    optionB: {
      label: "Shared Projects & Hobbies",
      desc: "Building, cooking, or learning a skill side-by-side",
      icon: "🎨",
      bg: "bg-gradient-to-br from-rose-500/20 to-pink-500/20 border-rose-500/30",
    },
    insight: "Emotional vulnerability is your primary intimacy language.",
  },
  {
    id: 3,
    category: "Life Alignment",
    optionA: {
      label: "High Growth & Ambition",
      desc: "Scaling big career goals and financial upside",
      icon: "🚀",
      bg: "bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border-blue-500/30",
    },
    optionB: {
      label: "Peaceful Work-Life Balance",
      desc: "Sustained daily wellness, rich personal free time",
      icon: "🌿",
      bg: "bg-gradient-to-br from-emerald-500/20 to-lime-500/20 border-emerald-500/30",
    },
    insight: "Pattern confirmed: Steadiness wins over sheer intensity.",
  },
];

export function MarketingDemoWidget() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [picks, setPicks] = useState<Record<number, "A" | "B">>({});
  const [animating, setAnimating] = useState(false);
  const [completed, setCompleted] = useState(false);

  const currentPair = SAMPLE_PAIRS[currentIndex];
  const progressPercent = Math.round(((currentIndex + (completed ? 1 : 0)) / SAMPLE_PAIRS.length) * 100);

  const handlePick = (choice: "A" | "B") => {
    if (animating || completed) return;
    setAnimating(true);

    const updatedPicks = { ...picks, [currentPair.id]: choice };
    setPicks(updatedPicks);

    setTimeout(() => {
      if (currentIndex < SAMPLE_PAIRS.length - 1) {
        setCurrentIndex((prev) => prev + 1);
        setAnimating(false);
      } else {
        setCompleted(true);
        setAnimating(false);
      }
    }, 450);
  };

  const handleReset = () => {
    setCurrentIndex(0);
    setPicks({});
    setCompleted(false);
  };

  return (
    <div className="relative mx-auto w-full max-w-[34rem] lg:ml-auto">
      {/* Glow Backdrop */}
      <div className="absolute -inset-1 rounded-[2.5rem] bg-gradient-to-r from-amber-500/30 via-orange-500/20 to-rose-500/30 opacity-70 blur-xl dark:opacity-40" />

      <div className="relative overflow-hidden rounded-[2.2rem] border border-stone-200/90 bg-white/90 p-5 shadow-[0_25px_60px_rgba(40,25,0,0.12)] backdrop-blur-2xl dark:border-stone-800/90 dark:bg-stone-900/90 sm:p-7">
        {/* Header bar */}
        <div className="mb-5 flex items-center justify-between border-b border-stone-200/70 pb-4 dark:border-stone-800/70">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/20 text-xs font-black text-amber-800 dark:bg-amber-500/30 dark:text-amber-300">
              ⚡
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-400">
                Interactive Live Demo
              </p>
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                {completed ? "Pattern Discovered!" : `Choice ${currentIndex + 1} of ${SAMPLE_PAIRS.length}`}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-stone-600 dark:text-stone-300">
              {progressPercent}% confidence
            </span>
            <div className="h-2 w-16 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {!completed ? (
          <div>
            {/* Category tag */}
            <div className="mb-4 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900 dark:bg-amber-950/80 dark:text-amber-300">
                Category: {currentPair.category}
              </span>
              <span className="text-xs font-semibold text-stone-600 dark:text-stone-400">
                Tap your gut pick
              </span>
            </div>

            {/* Cards Grid */}
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              {/* Option A */}
              <button
                type="button"
                onClick={() => handlePick("A")}
                disabled={animating}
                className={`group relative flex min-h-[170px] flex-col justify-between overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-lg active:scale-[0.98] ${currentPair.optionA.bg} ${
                  picks[currentPair.id] === "A"
                    ? "ring-2 ring-amber-500 ring-offset-2 dark:ring-offset-stone-900"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-3xl transition-transform duration-300 group-hover:scale-125">
                    {currentPair.optionA.icon}
                  </span>
                  <span className="rounded-full bg-stone-900/10 px-2 py-0.5 text-[10px] font-black uppercase text-stone-900 dark:bg-white/10 dark:text-stone-100">
                    Option A
                  </span>
                </div>
                <div>
                  <h4 className="text-base font-black tracking-tight text-stone-900 dark:text-white">
                    {currentPair.optionA.label}
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-stone-700 dark:text-stone-200">
                    {currentPair.optionA.desc}
                  </p>
                </div>
              </button>

              {/* Option B */}
              <button
                type="button"
                onClick={() => handlePick("B")}
                disabled={animating}
                className={`group relative flex min-h-[170px] flex-col justify-between overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-lg active:scale-[0.98] ${currentPair.optionB.bg} ${
                  picks[currentPair.id] === "B"
                    ? "ring-2 ring-amber-500 ring-offset-2 dark:ring-offset-stone-900"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-3xl transition-transform duration-300 group-hover:scale-125">
                    {currentPair.optionB.icon}
                  </span>
                  <span className="rounded-full bg-stone-900/10 px-2 py-0.5 text-[10px] font-black uppercase text-stone-900 dark:bg-white/10 dark:text-stone-100">
                    Option B
                  </span>
                </div>
                <div>
                  <h4 className="text-base font-black tracking-tight text-stone-900 dark:text-white">
                    {currentPair.optionB.label}
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-stone-700 dark:text-stone-200">
                    {currentPair.optionB.desc}
                  </p>
                </div>
              </button>
            </div>

            <p className="mt-4 text-center text-xs font-semibold text-stone-600 dark:text-stone-400">
              No login needed • Ratings update with Glicko-2 precision
            </p>
          </div>
        ) : (
          /* Completion & Insight View */
          <div className="py-2 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/20 text-2xl text-amber-600 dark:text-amber-400 shadow-inner">
              ✨
            </div>
            <span className="inline-block rounded-full bg-amber-500/20 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-amber-900 dark:text-amber-300">
              First Micro-Insight Synthesized
            </span>
            <h4 className="mt-3 text-xl font-black tracking-tight text-stone-900 dark:text-white">
              “You value grounded warmth & authentic emotional safety over fast noise.”
            </h4>
            <p className="mt-2.5 text-xs leading-relaxed text-stone-700 dark:text-stone-300">
              In just 3 choices, Pairwise established your initial Glicko-2 rating baseline and identified key trade-off boundaries. Imagine what 20 picks will reveal.
            </p>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
              <Link
                href="/app"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-sm font-black text-stone-950 shadow-md transition-all hover:bg-amber-400 hover:shadow-amber-500/20"
              >
                Start Full Free Survey
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center justify-center rounded-xl border border-stone-300 bg-stone-100 px-4 py-3 text-sm font-bold text-stone-800 transition hover:bg-stone-200 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
              >
                Try Demo Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
