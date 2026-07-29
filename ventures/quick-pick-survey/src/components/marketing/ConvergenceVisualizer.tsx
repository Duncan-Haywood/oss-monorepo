"use client";

import { useState } from "react";

export function ConvergenceVisualizer() {
  const [pickCount, setPickCount] = useState(12);

  const ratingDeviation = Math.round(350 / Math.sqrt(1 + pickCount * 0.42));
  const confidencePercent = Math.min(99, Math.round(15 + pickCount * 2.8));

  const getStageInfo = (picks: number) => {
    if (picks < 5) {
      return {
        stage: "Stage 1: Coarse Screening",
        title: "Establishing Broad Category Boundaries",
        desc: "Pairwise tests wide trade-offs across distinct categories to find the outer shape of your preferences.",
        badgeBg: "bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300",
        insight: "Initial signal: Strong aversion to high-stress routines.",
      };
    }
    if (picks < 15) {
      return {
        stage: "Stage 2: Adaptive Fine-Tuning",
        title: "Pitting Close Contenders",
        desc: "Near-toss-ups yield the highest mathematical information. Pairwise pairs items with similar ratings.",
        badgeBg: "bg-blue-100 text-blue-900 dark:bg-blue-950/80 dark:text-blue-300",
        insight: "Emerging Pattern: Work-life balance is prioritized over pure income upside.",
      };
    }
    if (picks < 25) {
      return {
        stage: "Stage 3: Deep Convergence",
        title: "High Statistical Certainty",
        desc: "Glicko-2 rating deviations fall below ±50. Your preference ordering is robust and resistant to noise.",
        badgeBg: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-300",
        insight: "Firm Insight: Emotional availability is non-negotiable in partner matching.",
      };
    }
    return {
      stage: "Stage 4: Dual Perspective Synergy",
      title: "Self vs. Partner Alignment Matrix",
      desc: "Comparing your self-preferences against what you want in a partner reveals hidden relationship dynamics.",
      badgeBg: "bg-purple-100 text-purple-900 dark:bg-purple-950/80 dark:text-purple-300",
      insight: "Shared Ground: 94% alignment on long-term lifestyle & family stability.",
    };
  };

  const stageInfo = getStageInfo(pickCount);

  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xl dark:border-stone-800 dark:bg-stone-900/80 sm:p-8">
      <div className="flex flex-col justify-between gap-4 border-b border-stone-200 pb-6 dark:border-stone-800 md:flex-row md:items-center">
        <div>
          <span className={`inline-block rounded-full px-3.5 py-1 text-xs font-black uppercase tracking-wider ${stageInfo.badgeBg}`}>
            {stageInfo.stage}
          </span>
          <h3 className="mt-2 text-xl font-black text-stone-900 dark:text-white">
            {stageInfo.title}
          </h3>
        </div>

        <div className="flex items-center gap-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400">
              Rating Uncertainty (RD)
            </p>
            <p className="text-2xl font-black text-amber-700 dark:text-amber-400">
              ±{ratingDeviation} <span className="text-xs font-normal text-stone-600 dark:text-stone-400">pts</span>
            </p>
          </div>
          <div className="h-8 w-px bg-stone-200 dark:bg-stone-800" />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400">
              Model Certainty
            </p>
            <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{confidencePercent}%</p>
          </div>
        </div>
      </div>

      {/* Interactive Slider Control */}
      <div className="my-6 rounded-2xl bg-stone-100/80 p-4 dark:bg-stone-950/80">
        <div className="mb-2 flex items-center justify-between text-xs font-bold">
          <label htmlFor="pick-count-slider" className="text-stone-800 dark:text-stone-200">
            Simulate Pairwise Choices Made:
          </label>
          <span className="rounded-lg bg-amber-500/20 px-2.5 py-1 text-amber-900 dark:text-amber-300">
            {pickCount} picks
          </span>
        </div>
        <input
          id="pick-count-slider"
          type="range"
          min="1"
          max="30"
          value={pickCount}
          onChange={(e) => setPickCount(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-stone-300 accent-amber-500 dark:bg-stone-700"
        />
        <div className="mt-2 flex justify-between text-[10px] font-bold text-stone-600 dark:text-stone-400">
          <span>1 pick (Broad Screening)</span>
          <span>15 picks (High Accuracy)</span>
          <span>30 picks (Full Convergence)</span>
        </div>
      </div>

      {/* Confidence Bell Curve Visualization */}
      <div className="relative mb-6 flex h-36 items-end justify-center rounded-2xl bg-stone-950 p-4 overflow-hidden border border-stone-800">
        <div className="absolute top-3 left-4 text-[10px] font-mono font-bold text-stone-300">
          Glicko-2 Probability Distribution
        </div>

        <svg className="h-full w-full overflow-visible" viewBox="0 0 400 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="bellGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          <line x1="0" y1="90" x2="400" y2="90" stroke="#475569" strokeDasharray="3 3" />
          <line x1="200" y1="10" x2="200" y2="90" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="2 2" />

          {(() => {
            const spread = Math.max(12, ratingDeviation * 0.45);
            const peakHeight = Math.min(80, 20 + (350 - ratingDeviation) * 0.18);
            const pathData = `
              M ${200 - spread * 2.5} 90 
              C ${200 - spread} 90, ${200 - spread * 0.5} ${90 - peakHeight}, 200 ${90 - peakHeight}
              C ${200 + spread * 0.5} ${90 - peakHeight}, ${200 + spread} 90, ${200 + spread * 2.5} 90
            `;
            return (
              <>
                <path d={pathData + " Z"} fill="url(#bellGrad)" />
                <path d={pathData} fill="none" stroke="#f59e0b" strokeWidth="3" />
              </>
            );
          })()}
        </svg>

        <div className="absolute bottom-2 text-center text-[11px] font-black text-amber-300">
          True Preference Mean Location
        </div>
      </div>

      {/* Insight Output Box */}
      <div className="rounded-2xl border border-stone-200/80 bg-amber-50/70 p-4 dark:border-stone-800/80 dark:bg-amber-950/30">
        <p className="text-xs font-semibold text-stone-700 dark:text-stone-300">
          {stageInfo.desc}
        </p>
        <div className="mt-2.5 flex items-start gap-2 text-sm font-bold text-stone-900 dark:text-stone-100">
          <span className="text-base">💡</span>
          <span>{stageInfo.insight}</span>
        </div>
      </div>
    </div>
  );
}
