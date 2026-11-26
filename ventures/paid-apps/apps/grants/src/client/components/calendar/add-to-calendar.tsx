// OWNER: calendar — "Add to calendar" for one opportunity's deadline (downloads a .ics file that
// Google, Outlook and Apple Calendar can import). Session-authenticated, same-origin download.
import { type ButtonSize, type ButtonVariant, buttonClass } from "@client/components/ui";
import { orgApi } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { Link } from "@tanstack/react-router";
import { CalendarPlus } from "lucide-react";

export const opportunityIcsPath = (orgId: string, opportunityId: string) =>
  orgApi(orgId, `/opportunities/${encodeURIComponent(opportunityId)}/calendar.ics`);

export function AddToCalendarButton({
  orgId,
  opportunityId,
  variant = "secondary",
  size = "sm",
  showSubscribeHint = true,
  className,
}: {
  orgId: string;
  opportunityId: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Also link to Settings → Calendar for a feed that stays up to date. */
  showSubscribeHint?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
      <a
        href={opportunityIcsPath(orgId, opportunityId)}
        download
        className={buttonClass({ variant, size })}
        aria-label="Add this deadline to your calendar (downloads an .ics file)"
      >
        <CalendarPlus aria-hidden /> Add to calendar
      </a>
      {showSubscribeHint && (
        <Link
          to="/orgs/$orgId/settings/calendar"
          params={{ orgId }}
          className="text-xs text-brand-700 underline-offset-4 hover:underline"
        >
          Subscribe to all deadlines
        </Link>
      )}
    </div>
  );
}
