// Product wordmark.
import { cn } from "../../lib/cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} aria-hidden focusable="false">
      <rect width="32" height="32" rx="8" className="fill-brand-700" />
      <path
        d="M9 21.5 15.2 9.6a1 1 0 0 1 1.78 0L23 21.5"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 17.5h8" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="23.5" cy="9" r="2.5" className="fill-accent-500" />
    </svg>
  );
}

export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span
        className={cn(
          "whitespace-nowrap text-[0.95rem] font-semibold tracking-tight",
          inverted ? "text-white" : "text-strong",
        )}
      >
        Grant Autopilot
      </span>
    </span>
  );
}
