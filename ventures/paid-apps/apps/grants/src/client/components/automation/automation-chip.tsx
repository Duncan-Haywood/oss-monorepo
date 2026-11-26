// Dashboard chip: "Automation: Prepared" (links to the autopilot settings) plus a hint of what's
// waiting on the user at that level.
import { cn } from "@client/lib/cn";
import { Link } from "@tanstack/react-router";
import { Gauge } from "lucide-react";
import { type AutomationSettingsSource, LEVEL_META, readAutomation } from "./levels";

export function waitingHint(waiting: number, reviews: number): string {
  if (waiting === 0) return "Nothing is waiting on you";
  if (reviews === waiting) return `${waiting} approval${waiting === 1 ? "" : "s"} waiting on you`;
  return `${waiting} item${waiting === 1 ? "" : "s"} waiting on you`;
}

export function AutomationChip({
  orgId,
  settings,
  waiting,
  reviews,
  className,
}: {
  orgId: string;
  /** Org settings; the chip is hidden until they load. */
  settings: AutomationSettingsSource | undefined;
  /** Items in "Needs your attention". */
  waiting: number;
  /** Of those, applications waiting for review/approval. */
  reviews: number;
  className?: string;
}) {
  if (!settings) return null;
  const level = readAutomation(settings).automationLevel;
  const meta = LEVEL_META[level];
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-sm", className)}>
      <Link
        to="/orgs/$orgId/settings/autopilot"
        params={{ orgId }}
        title={`${meta.short}. Change in Settings.`}
        className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800 ring-1 ring-brand-200 ring-inset hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Gauge className="h-3.5 w-3.5" aria-hidden />
        Automation: {meta.label}
      </Link>
      <span className="text-neutral-500">
        {meta.short}
        {" · "}
        {reviews > 0 ? (
          <Link
            to="/orgs/$orgId/reviews"
            params={{ orgId }}
            className="font-medium text-brand-700 hover:underline"
          >
            {waitingHint(waiting, reviews)}
          </Link>
        ) : (
          waitingHint(waiting, reviews)
        )}
      </span>
    </div>
  );
}
