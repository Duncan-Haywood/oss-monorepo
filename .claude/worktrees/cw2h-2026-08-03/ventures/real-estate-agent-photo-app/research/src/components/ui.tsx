import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type SectionProps = {
  id?: string;
  eyebrow?: string;
  title: string;
  intro?: string;
  children: ReactNode;
};

type StatCardProps = {
  value: string;
  label: string;
  source?: string;
};

type AudienceIconProps = {
  icon: LucideIcon;
};

type FitBadgeProps = {
  fit: string;
};

type SeverityBarProps = {
  severity: string;
};

export function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
}: SectionProps) {
  return (
    <section id={id} className="scroll-mt-24 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-10 max-w-3xl">
          {eyebrow ? (
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-brand-300">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-5xl">
            {title}
          </h2>
          {intro ? (
            <p className="mt-4 text-lg leading-8 text-slate-300">{intro}</p>
          ) : null}
        </div>
        {children}
      </div>
    </section>
  );
}

export function StatCard({ value, label, source }: StatCardProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-glow backdrop-blur">
      <p className="font-display text-4xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm font-medium text-slate-200">{label}</p>
      {source ? <p className="mt-3 text-xs text-slate-500">{source}</p> : null}
    </div>
  );
}

export function AudienceIcon({ icon: Icon }: AudienceIconProps) {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-200 ring-1 ring-brand-400/30">
      <Icon className="h-6 w-6" aria-hidden="true" />
    </div>
  );
}

export function FitBadge({ fit }: FitBadgeProps) {
  const normalized = fit.toLowerCase();
  const color =
    normalized === "excellent"
      ? "bg-brand-400/15 text-brand-100 ring-brand-300/30"
      : normalized === "good"
        ? "bg-sky-400/15 text-sky-100 ring-sky-300/30"
        : normalized === "poor"
          ? "bg-rose-400/15 text-rose-100 ring-rose-300/30"
          : "bg-amber-400/15 text-amber-100 ring-amber-300/30";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ${color}`}
    >
      {fit}
    </span>
  );
}

export function SeverityBar({ severity }: SeverityBarProps) {
  const normalized = severity.toLowerCase();
  const width = normalized === "high" ? "w-full" : "w-2/3";
  const color = normalized === "high" ? "bg-rose-400" : "bg-amber-300";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400">
        <span>Severity</span>
        <span>{severity}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${width} ${color}`} />
      </div>
    </div>
  );
}
