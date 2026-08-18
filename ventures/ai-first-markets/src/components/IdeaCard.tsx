import Link from "next/link";
import type { BusinessIdea } from "@/lib/types";
import {
  averageScore,
  categoryLabel,
  formatArr,
  liabilityColor,
  liabilityLabel,
  verdictColor,
  verdictLabel,
} from "@/lib/utils";

interface IdeaCardProps {
  idea: BusinessIdea;
  milestone?: "100k" | "1m";
}

export function IdeaCard({ idea, milestone = "100k" }: IdeaCardProps) {
  const plan = idea.plans.find((p) => p.milestone === milestone);
  const score = averageScore(idea.dimensions);
  const rank = milestone === "100k" ? idea.rank100k : idea.rank1m;

  return (
    <Link
      href={`/ideas/${idea.slug}`}
      className="group block rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition hover:border-zinc-700 hover:bg-zinc-900"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-400">
              #{rank}
            </span>
            <span className="text-xs text-zinc-500">
              {categoryLabel(idea.category)}
            </span>
            <span
              className={`text-xs ${liabilityColor(idea.liability.level)}`}
              title="Legal and financial exposure after the stated controls"
            >
              {liabilityLabel(idea.liability.level)}
            </span>
          </div>
          <h3 className="mt-2 text-lg font-semibold text-zinc-50 group-hover:text-emerald-400">
            {idea.name}
          </h3>
          <p className="mt-1 text-sm text-zinc-400">{idea.tagline}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold text-zinc-100">{score}</p>
          <p className="text-xs text-zinc-500">score</p>
        </div>
      </div>

      {plan && (
        <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-4">
          <div>
            <p className="text-xs text-zinc-500">Path to {formatArr(plan.targetArr)}</p>
            <p className="text-sm text-zinc-300">
              {plan.timelineMonths.realistic} months realistic
            </p>
          </div>
          <span className={`text-sm font-medium ${verdictColor(plan.verdict)}`}>
            {verdictLabel(plan.verdict)}
          </span>
        </div>
      )}
    </Link>
  );
}
