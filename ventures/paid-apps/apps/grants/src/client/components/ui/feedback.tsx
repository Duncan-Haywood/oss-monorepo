// Progress, Meter, Stat (KPI tile), Skeleton.
import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import type * as React from "react";
import { cn } from "../../lib/cn";
import type { Tone } from "./base";

const barTone: Record<Tone, string> = {
  neutral: "bg-neutral-500",
  brand: "bg-brand-600",
  success: "bg-success-600",
  warning: "bg-warning-500",
  danger: "bg-danger-600",
  info: "bg-info-600",
  accent: "bg-accent-500",
};

/** Task progress. Omit `value` for an indeterminate bar. */
export function Progress({
  value,
  max = 100,
  label,
  showValue = false,
  tone = "brand",
  size = "md",
  className,
}: {
  value?: number | null;
  max?: number;
  /** Accessible (and visible) label. */
  label?: string;
  showValue?: boolean;
  tone?: Tone;
  size?: "sm" | "md";
  className?: string;
}) {
  const indeterminate = value == null;
  const pct = indeterminate ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn("w-full", className)}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
          {label && <span className="font-medium text-default">{label}</span>}
          {showValue && !indeterminate && (
            <span className="tabular-nums text-subtle">{Math.round(pct)}%</span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label ?? "Progress"}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={indeterminate ? undefined : value}
        className={cn(
          "w-full overflow-hidden rounded-full bg-muted",
          size === "sm" ? "h-1.5" : "h-2.5",
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            barTone[tone],
            indeterminate && "w-1/3 animate-shimmer",
          )}
          style={indeterminate ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * A scalar measurement within a known range (fit score, grounding coverage). Tone is derived from
 * thresholds unless given: value >= high → success, >= low → warning, else danger.
 */
export function Meter({
  value,
  min = 0,
  max = 1,
  low = min + (max - min) * 0.4,
  high = min + (max - min) * 0.7,
  label,
  valueText,
  tone,
  size = "md",
  className,
}: {
  value: number;
  min?: number;
  max?: number;
  low?: number;
  high?: number;
  label: string;
  /** Human-readable value, e.g. "82% fit". Defaults to a percentage. */
  valueText?: string;
  tone?: Tone;
  size?: "sm" | "md";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min || 1)) * 100));
  const t: Tone = tone ?? (value >= high ? "success" : value >= low ? "warning" : "danger");
  const text = valueText ?? `${Math.round(pct)}%`;
  return (
    <div className={cn("w-full", className)}>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-muted">{label}</span>
        <span className="font-semibold tabular-nums text-strong">{text}</span>
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: native <meter> cannot be styled consistently */}
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={text}
        className={cn(
          "w-full overflow-hidden rounded-full bg-muted",
          size === "sm" ? "h-1.5" : "h-2",
        )}
      >
        <div className={cn("h-full rounded-full", barTone[t])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const iconTone: Record<Tone, string> = {
  neutral: "bg-muted text-muted",
  brand: "bg-brand-50 text-brand-700",
  success: "bg-success-50 text-success-700",
  warning: "bg-warning-50 text-warning-700",
  danger: "bg-danger-50 text-danger-700",
  info: "bg-info-50 text-info-700",
  accent: "bg-accent-50 text-accent-700",
};

/** KPI tile. */
export function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
  trend,
  loading = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  trend?: { direction: "up" | "down"; label: string; good?: boolean };
  loading?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-xl border border-line bg-surface p-5 shadow-card",
        className,
      )}
    >
      {Icon && (
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            iconTone[tone],
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-muted">{label}</p>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-20" />
        ) : (
          <p className="mt-1 text-2xl font-semibold tracking-tight text-strong tabular-nums">
            {value}
          </p>
        )}
        {(hint || trend) && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-subtle">
            {trend && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 font-medium",
                  (trend.good ?? trend.direction === "up") ? "text-success-700" : "text-danger-700",
                )}
              >
                {trend.direction === "up" ? (
                  <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                )}
                {trend.label}
              </span>
            )}
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}

/** Loading placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("animate-shimmer rounded-md bg-neutral-200/80", className)} />
  );
}

/** Several skeleton lines of text with a screen-reader loading label. */
export function SkeletonText({
  lines = 3,
  className,
  label = "Loading",
}: {
  lines?: number;
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} role="status" aria-label={label}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          key={i}
          className={cn("h-4", i === lines - 1 && lines > 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/** Card-shaped loading placeholder for list pages. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn("rounded-xl border border-line bg-surface p-5 shadow-card", className)}
      role="status"
      aria-label="Loading"
    >
      <Skeleton className="mb-3 h-5 w-1/3" />
      <SkeletonText lines={2} />
    </div>
  );
}
