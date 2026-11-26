// "What the AI will do for you": Find → Score → Draft → Check → Submit → Follow up, each step
// marked Automatic / You approve / You do it for the current settings.
import { Badge, type Tone } from "@client/components/ui";
import { cn } from "@client/lib/cn";
import { CheckCheck, Hand, Zap } from "lucide-react";
import { STAGE_MODE_LABELS, type StageMode, type StageStep } from "./levels";

const MODE_TONE: Record<StageMode, Tone> = {
  automatic: "success",
  approve: "info",
  you: "neutral",
};
const MODE_ICON = { automatic: Zap, approve: CheckCheck, you: Hand } as const;
const MODE_DOT: Record<StageMode, string> = {
  automatic: "bg-success-500 ring-success-100",
  approve: "bg-info-500 ring-info-100",
  you: "bg-neutral-400 ring-neutral-100",
};

export function AutomationTimeline({ steps }: { steps: StageStep[] }) {
  return (
    <ol aria-label="What the AI will do for you" className="relative space-y-0">
      {steps.map((s, i) => {
        const Icon = MODE_ICON[s.mode];
        return (
          <li
            key={s.stage}
            data-stage={s.stage}
            data-mode={s.mode}
            className="relative flex gap-3 pb-4 last:pb-0"
          >
            {i < steps.length - 1 && (
              <span aria-hidden className="absolute top-4 left-[7px] h-full w-px bg-neutral-200" />
            )}
            <span
              aria-hidden
              className={cn(
                "relative mt-1 h-3.5 w-3.5 shrink-0 rounded-full ring-4",
                MODE_DOT[s.mode],
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-neutral-900">
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.label}
                </p>
                <Badge tone={MODE_TONE[s.mode]} className="gap-1">
                  <Icon className="h-3 w-3" aria-hidden />
                  {STAGE_MODE_LABELS[s.mode]}
                </Badge>
              </div>
              <p className="mt-0.5 text-sm text-neutral-600">{s.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
