interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  accent?: "emerald" | "sky" | "amber" | "zinc";
}

const accentClasses = {
  emerald: "text-emerald-400",
  sky: "text-sky-400",
  amber: "text-amber-400",
  zinc: "text-zinc-300",
};

export function StatCard({
  label,
  value,
  subtext,
  accent = "zinc",
}: StatCardProps) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className={`mt-2 text-3xl font-semibold ${accentClasses[accent]}`}>
        {value}
      </p>
      {subtext && <p className="mt-1 text-sm text-zinc-500">{subtext}</p>}
    </div>
  );
}
