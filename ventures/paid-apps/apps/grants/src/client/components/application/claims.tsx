// Claim-by-claim rendering of a draft section: superscript citation buttons that open the cited
// fact (statement, status, verbatim source quote), red highlights for claims the verifier could not
// ground, amber citations for facts nobody has confirmed yet.
import { FactStatusBadge } from "@client/components/knowledge/badges";
import { Popover, Tooltip } from "@client/components/ui";
import { cn } from "@client/lib/cn";
import type { FactDto } from "@shared/api/types";
import type { Claim, ClaimVerdict, Paragraph } from "@shared/content";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, FileText, ListChecks } from "lucide-react";
import * as React from "react";
import { type ClaimIssue, claimIssue } from "./model";

export interface CitationContext {
  orgId: string;
  /** factId → citation number (stable across the draft). */
  numbers: Map<string, number>;
  facts: Map<string, FactDto>;
  verdicts: Map<string, ClaimVerdict>;
}

const SOURCE_LABEL: Record<string, string> = {
  document: "From a document",
  interview: "From an interview",
  user_entered: "Entered by your team",
  website: "From your website",
};

type OpenedBy = "hover" | "focus" | "click" | null;

/**
 * One superscript citation. Hover or keyboard focus previews the source; click (or Enter) pins it
 * open; Esc or an outside click closes it.
 */
export function CitationButton({
  n,
  factId,
  fact,
  unconfirmed = false,
  orgId,
}: {
  n: number;
  factId: string;
  fact: FactDto | undefined;
  unconfirmed?: boolean;
  orgId: string;
}) {
  const [open, setOpen] = React.useState(false);
  const openedBy = React.useRef<OpenedBy>(null);
  const clicked = React.useRef(false);
  const pointerDown = React.useRef(false);
  const suppressFocus = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);

  const show = (by: Exclude<OpenedBy, null>) => {
    clearTimeout(timer.current);
    openedBy.current = openedBy.current ?? by;
    setOpen(true);
  };
  const hide = () => {
    clearTimeout(timer.current);
    openedBy.current = null;
    setOpen(false);
  };
  const hideSoon = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (openedBy.current === "hover") hide();
    }, 200);
  };
  const onOpenChange = (next: boolean) => {
    if (clicked.current) {
      clicked.current = false;
      // A click on a hover/focus preview pins it instead of closing it.
      if (!next && openedBy.current !== "click") {
        openedBy.current = "click";
        return;
      }
      if (next) {
        openedBy.current = "click";
        setOpen(true);
      } else hide();
      return;
    }
    if (!next) {
      // Esc / outside click. Esc puts focus back on the trigger: don't re-open on that focus.
      suppressFocus.current = true;
      setTimeout(() => {
        suppressFocus.current = false;
      }, 0);
      hide();
    }
  };

  const proposed = !!fact && (fact.status === "proposed" || unconfirmed);
  const missing = !fact || fact.status === "rejected" || fact.status === "superseded";
  const status = missing ? "unavailable" : proposed ? "unconfirmed" : "confirmed";

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      label={`Citation ${n}`}
      side="top"
      align="center"
      trigger={
        <button
          type="button"
          aria-label={`View citation ${n}`}
          data-citation={factId}
          data-status={status}
          onPointerDown={() => {
            pointerDown.current = true;
          }}
          onClick={() => {
            clicked.current = true;
            pointerDown.current = false;
          }}
          onMouseEnter={() => {
            clearTimeout(timer.current);
            timer.current = setTimeout(() => show("hover"), 150);
          }}
          onMouseLeave={hideSoon}
          onFocus={() => {
            if (pointerDown.current || suppressFocus.current) return;
            show("focus");
          }}
          onBlur={() => {
            pointerDown.current = false;
            if (openedBy.current === "focus") hide();
          }}
          className={cn(
            "ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded px-1 align-super text-[0.65rem] font-semibold leading-none ring-1 ring-inset transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
            status === "confirmed" &&
              "bg-brand-50 text-brand-800 ring-brand-300 hover:bg-brand-100",
            status === "unconfirmed" &&
              "bg-warning-50 text-warning-800 ring-0 outline-1 outline-dashed outline-warning-600 hover:bg-warning-100",
            status === "unavailable" &&
              "bg-danger-50 text-danger-800 line-through decoration-2 ring-danger-600 hover:bg-danger-100",
          )}
        >
          {n}
        </button>
      }
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: keeps a hover preview open while the pointer is over it */}
      <div
        className="space-y-2.5"
        onMouseEnter={() => clearTimeout(timer.current)}
        onMouseLeave={hideSoon}
      >
        <CitationCard n={n} fact={fact} proposed={proposed} orgId={orgId} />
      </div>
    </Popover>
  );
}

function CitationCard({
  n,
  fact,
  proposed,
  orgId,
}: {
  n: number;
  fact: FactDto | undefined;
  proposed: boolean;
  orgId: string;
}) {
  if (!fact) {
    return (
      <>
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Source {n}</p>
        <p className="text-danger-800">
          This fact is no longer in your fact base. Edit or regenerate the section so the claim
          cites a current fact.
        </p>
      </>
    );
  }
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Source {n}</p>
        <FactStatusBadge status={fact.status} />
      </div>
      <p className="font-medium leading-snug text-neutral-900">{fact.statement}</p>
      {fact.sourceQuote ? (
        <blockquote className="border-l-2 border-brand-300 pl-3 text-sm italic leading-relaxed text-neutral-600">
          “{fact.sourceQuote}”
        </blockquote>
      ) : (
        <p className="text-xs text-neutral-500">
          No source quote: this fact was typed in by a person.
        </p>
      )}
      <p className="text-xs text-neutral-500">
        {SOURCE_LABEL[fact.sourceType] ?? "Source"}
        {fact.asOf ? ` · as of ${fact.asOf}` : ""}
      </p>
      {proposed && (
        <p className="rounded-md bg-warning-50 px-2 py-1.5 text-xs text-warning-900 ring-1 ring-warning-200 ring-inset">
          Nobody has confirmed this fact yet. Confirm it before autopilot can rely on it.
        </p>
      )}
      <div className="flex flex-wrap gap-3 pt-0.5 text-xs">
        {fact.sourceDocumentId && (
          <Link
            to="/orgs/$orgId/knowledge/documents/$documentId"
            params={{ orgId, documentId: fact.sourceDocumentId }}
            className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden /> Open source document
          </Link>
        )}
        <Link
          to="/orgs/$orgId/knowledge/facts"
          params={{ orgId }}
          className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
        >
          <ListChecks className="h-3.5 w-3.5" aria-hidden /> Review facts
        </Link>
      </div>
    </>
  );
}

/** Issue to show for a claim: verifier verdict first, else a factual claim with no citations. */
export function issueForClaim(claim: Claim, verdict: ClaimVerdict | undefined): ClaimIssue {
  const fromVerdict = claimIssue(verdict);
  if (fromVerdict) return fromVerdict;
  if (claim.kind === "factual" && claim.factIds.length === 0) {
    return { level: "danger", reason: "This factual statement doesn't cite any fact." };
  }
  return null;
}

export function ClaimView({ claim, ctx }: { claim: Claim; ctx: CitationContext }) {
  const verdict = ctx.verdicts.get(claim.id);
  const issue = issueForClaim(claim, verdict);
  const unconfirmed = new Set(verdict?.unconfirmedFactIds ?? []);
  return (
    <span
      id={`claim-${claim.id}`}
      data-claim-id={claim.id}
      data-issue={issue?.level}
      className={cn(
        "scroll-mt-28 rounded-sm transition-colors target:bg-warning-100",
        issue?.level === "danger" &&
          "bg-danger-50 text-danger-900 underline decoration-danger-400 decoration-wavy underline-offset-4",
        issue?.level === "warning" &&
          "bg-warning-50/70 underline decoration-warning-400 decoration-dotted underline-offset-4",
      )}
    >
      {claim.text}
      {issue && (
        <Tooltip content={issue.reason}>
          <button
            type="button"
            aria-label={`${issue.level === "danger" ? "Not supported" : "Partly supported"}: ${issue.reason}`}
            className={cn(
              "ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded align-super focus-visible:outline-2 focus-visible:outline-focus",
              issue.level === "danger" ? "text-danger-600" : "text-warning-600",
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          </button>
        </Tooltip>
      )}
      {claim.factIds.map((id) => (
        <CitationButton
          key={id}
          n={ctx.numbers.get(id) ?? 0}
          factId={id}
          fact={ctx.facts.get(id)}
          unconfirmed={unconfirmed.has(id)}
          orgId={ctx.orgId}
        />
      ))}
    </span>
  );
}

export function ParagraphView({ paragraph, ctx }: { paragraph: Paragraph; ctx: CitationContext }) {
  return (
    <p className="leading-7 text-neutral-800">
      {paragraph.claims.map((c, i) => (
        <React.Fragment key={c.id}>
          {i > 0 && " "}
          <ClaimView claim={c} ctx={ctx} />
        </React.Fragment>
      ))}
    </p>
  );
}
