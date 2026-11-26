// Small building blocks shared by the demo steps: the "imagined charity" notice, the citation popover
// (same look as the app's CitationButton in components/application/claims.tsx, but reading the demo's
// local fixtures instead of the org's fact base), fact chips and a compact fact card.
import { FactStatusBadge } from "@client/components/knowledge/badges";
import { factCategoryLabel } from "@client/components/knowledge/labels";
import { Badge, Button, Popover } from "@client/components/ui";
import { cn } from "@client/lib/cn";
import { Check, FileText, FlaskConical, Undo2, User, X } from "lucide-react";
import type * as React from "react";
import {
  DEMO_DISCLAIMER,
  type DemoFact,
  type DemoFactStatus,
  documentById,
  factById,
} from "./data";
import { type FactStatuses, GAP_FACT_ID } from "./model";

/** "Demo data: Juniper Mesa is an imagined charity" pill, shown on every step. */
export function DemoNotice({ className }: { className?: string }) {
  return (
    <p
      role="note"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-accent-50 px-2.5 py-1 text-xs font-medium text-accent-700 ring-1 ring-accent-200 ring-inset",
        className,
      )}
    >
      <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {DEMO_DISCLAIMER}
    </p>
  );
}

/** What a citation points at: a demo fact, or the answer the visitor typed for the gap question. */
interface CitedFact {
  statement: string;
  quote: string;
  sourceLabel: string;
  asOf?: string;
  status: DemoFactStatus;
  typed: boolean;
}

function citedFact(
  factId: string,
  statuses: FactStatuses,
  gapAnswer: number | null,
): CitedFact | null {
  if (factId === GAP_FACT_ID) {
    if (gapAnswer === null) return null;
    return {
      statement: `First-year training target: ${gapAnswer} trainees.`,
      quote: String(gapAnswer),
      sourceLabel: "Answered by your team in the review screen",
      status: "proposed",
      typed: true,
    };
  }
  const f = factById(factId);
  if (!f) return null;
  return {
    statement: f.statement,
    quote: f.quote,
    sourceLabel: documentById(f.documentId).title,
    asOf: f.asOf,
    status: statuses[f.id] ?? f.initialStatus,
    typed: false,
  };
}

function FactPopoverBody({ title, fact }: { title: string; fact: CitedFact | null }) {
  if (!fact) {
    return <p className="text-danger-800">This fact is not in the fact base.</p>;
  }
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</p>
        <FactStatusBadge status={fact.status} />
      </div>
      <p className="font-medium leading-snug text-neutral-900">{fact.statement}</p>
      <blockquote
        data-testid="citation-quote"
        className="border-l-2 border-brand-300 pl-3 text-sm italic leading-relaxed text-neutral-600"
      >
        “{fact.quote}”
      </blockquote>
      <p className="flex items-center gap-1 text-xs text-neutral-500">
        {fact.typed ? (
          <User className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <FileText className="h-3.5 w-3.5" aria-hidden />
        )}
        {fact.sourceLabel}
        {fact.asOf ? ` · as of ${fact.asOf}` : ""}
      </p>
      {fact.status === "proposed" && (
        <p className="rounded-md bg-warning-50 px-2 py-1.5 text-xs text-warning-900 ring-1 ring-warning-200 ring-inset">
          Nobody has confirmed this fact yet. Autopilot can't rely on it until someone does.
        </p>
      )}
      {fact.status === "rejected" && (
        <p className="rounded-md bg-danger-50 px-2 py-1.5 text-xs text-danger-800 ring-1 ring-danger-200 ring-inset">
          Your team rejected this fact, so no sentence may rely on it.
        </p>
      )}
    </div>
  );
}

/** Superscript citation number; click (or Enter) opens the cited fact and its verbatim quote. */
export function DemoCitation({
  n,
  factId,
  statuses,
  gapAnswer = null,
}: {
  n: number;
  factId: string;
  statuses: FactStatuses;
  gapAnswer?: number | null;
}) {
  const fact = citedFact(factId, statuses, gapAnswer);
  const status = !fact || fact.status === "rejected" ? "unavailable" : fact.status;
  return (
    <Popover
      label={`Citation ${n}`}
      side="top"
      align="center"
      trigger={
        <button
          type="button"
          aria-label={`View citation ${n}`}
          data-citation={factId}
          data-status={status}
          className={cn(
            "ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded px-1 align-super text-[0.65rem] font-semibold leading-none ring-1 ring-inset transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
            status === "confirmed" &&
              "bg-brand-50 text-brand-800 ring-brand-200 hover:bg-brand-100",
            status === "proposed" &&
              "bg-warning-100 text-warning-900 ring-warning-300 hover:bg-warning-200",
            status === "unavailable" &&
              "bg-danger-100 text-danger-800 ring-danger-300 hover:bg-danger-200",
          )}
        >
          {n}
        </button>
      }
    >
      <FactPopoverBody title={`Source ${n}`} fact={fact} />
    </Popover>
  );
}

/** A fact named inline (match reasons): a small chip that opens the fact and its quote. */
export function FactChip({ factId, statuses }: { factId: string; statuses: FactStatuses }) {
  const fact = citedFact(factId, statuses, null);
  if (!fact) return null;
  return (
    <Popover
      label="Supporting fact"
      side="top"
      align="start"
      trigger={
        <button
          type="button"
          aria-label={`Supporting fact: ${fact.statement}`}
          className="inline-flex max-w-full items-center gap-1 rounded-full bg-white px-2 py-0.5 text-left text-xs font-medium text-brand-800 ring-1 ring-brand-200 ring-inset hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          <FileText className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{fact.statement}</span>
        </button>
      }
    >
      <FactPopoverBody title="Supporting fact" fact={fact} />
    </Popover>
  );
}

/** Compact fact card with provenance and confirm / reject (local state only). */
export function DemoFactCard({
  fact,
  status,
  onStatusChange,
  active = false,
  onFocusFact,
  extra,
}: {
  fact: Pick<DemoFact, "id" | "statement" | "category" | "quote" | "asOf"> & {
    confidence?: number;
  };
  status: DemoFactStatus;
  onStatusChange: (status: DemoFactStatus) => void;
  active?: boolean;
  /** Called on hover/focus so the matching quote can be emphasized in the document. */
  onFocusFact?: (factId: string | null) => void;
  extra?: React.ReactNode;
}) {
  const statementId = `demo-fact-${fact.id}`;
  return (
    <article
      aria-labelledby={statementId}
      data-fact-id={fact.id}
      data-status={status}
      onMouseEnter={() => onFocusFact?.(fact.id)}
      onMouseLeave={() => onFocusFact?.(null)}
      onFocus={() => onFocusFact?.(fact.id)}
      onBlur={() => onFocusFact?.(null)}
      className={cn(
        "rounded-lg border bg-white p-4 shadow-sm transition-colors",
        active ? "border-brand-400 ring-1 ring-brand-300" : "border-neutral-200",
        status === "rejected" && "opacity-75",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand">{factCategoryLabel(fact.category)}</Badge>
        <FactStatusBadge status={status} />
        {fact.asOf && <span className="text-xs text-neutral-500">As of {fact.asOf}</span>}
        {fact.confidence !== undefined && (
          <span className="text-xs text-neutral-500">
            Confidence {Math.round(fact.confidence * 100)}%
          </span>
        )}
      </div>
      <p
        id={statementId}
        className={cn(
          "mt-2 text-sm font-medium text-neutral-900",
          status === "rejected" && "line-through decoration-neutral-400",
        )}
      >
        {fact.statement}
      </p>
      <blockquote className="mt-2 border-l-4 border-warning-200 pl-3 text-sm italic text-neutral-600">
        “{fact.quote}”
      </blockquote>
      {extra}
      <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-neutral-100 pt-3">
        {status === "rejected" ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onStatusChange("proposed")}
            aria-label={`Restore: ${fact.statement}`}
          >
            <Undo2 aria-hidden /> Restore
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onStatusChange("rejected")}
            aria-label={`Reject: ${fact.statement}`}
          >
            <X aria-hidden /> Reject
          </Button>
        )}
        {status === "proposed" && (
          <Button
            size="sm"
            onClick={() => onStatusChange("confirmed")}
            aria-label={`Confirm: ${fact.statement}`}
          >
            <Check aria-hidden /> Confirm
          </Button>
        )}
      </div>
    </article>
  );
}
