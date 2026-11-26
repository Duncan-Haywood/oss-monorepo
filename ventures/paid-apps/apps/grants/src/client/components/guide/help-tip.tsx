// A small "?" button next to a concept that opens a short plain-language explanation (copy lives in
// content/help.ts). Built on the Popover primitive: a real <button> with an accessible name
// ("What is fit score?"), aria-expanded/aria-controls, Esc and outside click close, focus returns.

import { HELP, type HelpTerm } from "@client/content/help";
import { routerPath } from "@client/lib/base-path";
import { cn } from "@client/lib/cn";
import { CircleHelp } from "lucide-react";
import { HrefLink } from "../layout/href-link";
import { buttonClass, Popover } from "../ui";

export function HelpTip({
  term,
  className,
  side = "bottom",
}: {
  term: HelpTerm;
  className?: string;
  side?: "top" | "bottom";
}) {
  const entry = HELP[term];
  const orgId = currentOrgId();
  const label = `What is ${entry.term.toLowerCase()}?`;
  return (
    <Popover
      side={side}
      align="center"
      label={entry.term}
      className="w-72"
      trigger={
        <button
          type="button"
          aria-label={label}
          title={label}
          className={cn(
            buttonClass({ variant: "ghost", size: "icon" }),
            "inline-flex h-6 w-6 min-h-0 min-w-0 shrink-0 p-0 align-middle text-subtle hover:text-default",
            className,
          )}
        >
          <CircleHelp className="h-4 w-4" aria-hidden />
        </button>
      }
    >
      <p className="font-semibold text-strong">{entry.term}</p>
      <p className="mt-1 leading-relaxed">{entry.short}</p>
      {orgId && (
        <HrefLink
          href={`/orgs/${encodeURIComponent(orgId)}/help#help-${entry.id}`}
          className={cn(buttonClass({ variant: "link", size: "sm" }), "mt-2 h-auto px-0")}
        >
          Learn more in the help center
        </HrefLink>
      )}
    </Popover>
  );
}

/** The org in the current URL (/orgs/:orgId/...). Read from location, not the router, so a HelpTip
 * renders anywhere (including component tests that mock or omit the router). */
function currentOrgId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return /^\/orgs\/([^/]+)/.exec(routerPath(window.location.pathname))?.[1];
}
