interface ScoreBarProps {
  label: string;
  score: number;
  maxScore: number;
  rationale?: string;
}

export function ScoreBar({ label, score, maxScore, rationale }: ScoreBarProps) {
  const percentage = Math.round((score / maxScore) * 100);

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-300">{label}</span>
        <span className="font-mono text-zinc-400">
          {score}/{maxScore}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {rationale && (
        <p className="mt-1.5 text-xs text-zinc-500">{rationale}</p>
      )}
    </div>
  );
}
