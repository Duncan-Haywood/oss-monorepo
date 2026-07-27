export function ProgressBar({ confidence, answeredCount }: { confidence: number; answeredCount: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500"
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>
      <div className="flex justify-between text-xs font-medium text-neutral-500 dark:text-neutral-400">
        <span>{answeredCount} answered</span>
        <span>{pct}% confident</span>
      </div>
    </div>
  );
}
