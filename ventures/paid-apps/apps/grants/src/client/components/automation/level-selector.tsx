// Five-stop automation level selector (native radios styled as a segmented control) plus a card
// saying what the AI does, what you do and an example for the selected level.
import { Badge } from "@client/components/ui";
import { cn } from "@client/lib/cn";
import { Bot, Lightbulb, UserRound } from "lucide-react";
import { useId } from "react";
import { AUTOMATION_LEVELS, type AutomationLevel, LEVEL_META, levelRank } from "./levels";

export function AutomationLevelSelector({
  value,
  onChange,
  disabled,
  compact = false,
  legend = "Automation level",
}: {
  value: AutomationLevel;
  /** Called with the level the person picked (the parent may ask for consent before applying). */
  onChange: (level: AutomationLevel) => void;
  disabled?: boolean;
  /** Onboarding: smaller card, no example. */
  compact?: boolean;
  legend?: string;
}) {
  const name = useId();
  const meta = LEVEL_META[value];
  const rank = levelRank(value);
  return (
    <div className="space-y-3">
      <fieldset disabled={disabled} className="min-w-0">
        <legend className="mb-2 text-sm font-medium text-neutral-900">{legend}</legend>
        <div className="grid grid-cols-5 gap-1 rounded-lg bg-neutral-100 p-1">
          {AUTOMATION_LEVELS.map((level, i) => {
            const checked = level === value;
            const m = LEVEL_META[level];
            return (
              <label
                key={level}
                data-level={level}
                className={cn(
                  "relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-2 text-center text-xs font-medium transition-colors sm:text-sm",
                  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                  checked
                    ? "bg-white text-brand-800 shadow-sm ring-1 ring-brand-200"
                    : "text-neutral-600 hover:bg-white/60 hover:text-neutral-900",
                  disabled ? "cursor-not-allowed" : "cursor-pointer",
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={level}
                  checked={checked}
                  onChange={() => onChange(level)}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className={cn(
                    "h-1.5 w-full max-w-10 rounded-full",
                    i <= rank ? "bg-brand-500" : "bg-neutral-300",
                  )}
                />
                <span className="break-words leading-tight">{m.label}</span>
                {m.recommended && (
                  <span className="hidden text-[11px] font-normal text-brand-700 sm:block">
                    Recommended
                  </span>
                )}
              </label>
            );
          })}
        </div>
        <div aria-hidden className="mt-1 flex justify-between text-xs text-neutral-500">
          <span>More control</span>
          <span>More automation</span>
        </div>
      </fieldset>

      <div
        className="rounded-lg border border-neutral-200 bg-white p-4"
        aria-live="polite"
        data-testid="level-card"
      >
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-neutral-900">{meta.label}</p>
          {meta.recommended && <Badge tone="brand">Recommended</Badge>}
          <p className="text-sm text-neutral-500">· {meta.short}</p>
        </div>
        <dl
          className={cn("mt-3 grid gap-3 text-sm", compact ? "sm:grid-cols-2" : "md:grid-cols-3")}
        >
          <div>
            <dt className="flex items-center gap-1.5 font-medium text-neutral-900">
              <Bot className="h-4 w-4 text-brand-600" aria-hidden />
              What the AI does
            </dt>
            <dd className="mt-1 text-neutral-600">{meta.aiDoes}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 font-medium text-neutral-900">
              <UserRound className="h-4 w-4 text-brand-600" aria-hidden />
              What you do
            </dt>
            <dd className="mt-1 text-neutral-600">{meta.youDo}</dd>
          </div>
          {!compact && (
            <div>
              <dt className="flex items-center gap-1.5 font-medium text-neutral-900">
                <Lightbulb className="h-4 w-4 text-brand-600" aria-hidden />
                For example
              </dt>
              <dd className="mt-1 text-neutral-600">{meta.example}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
