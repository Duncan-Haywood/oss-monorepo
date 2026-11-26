// A single fact with provenance + actions (confirm / reject / edit inline / select).
import { friendlyError } from "@client/components/grants/api-errors";
import { Badge, Button, Field, Input, Select, Textarea } from "@client/components/ui";
import { cn } from "@client/lib/cn";
import type { FactDto } from "@shared/api/types";
import { FACT_CATEGORIES, type FactCategory, type FactStatus } from "@shared/enums";
import { factStaleness } from "@shared/fact-staleness";
import { Link } from "@tanstack/react-router";
import {
  Check,
  CheckCheck,
  FileText,
  MessageSquare,
  Pencil,
  ShieldAlert,
  User,
  X,
} from "lucide-react";
import { useId, useState } from "react";
import { FactStatusBadge } from "./badges";
import { FACT_CATEGORY_LABELS, factCategoryLabel } from "./labels";
import type { FactPatch } from "./queries";

export type FactBusy = "confirm" | "reject" | "save" | "still_true" | null;

/** A pending supersede proposal (GET /facts adds these links; services/knowledge/supersede.ts). */
interface FactLink {
  id: string;
  statement: string;
  asOf: string | null;
  status: FactStatus;
}
export type FactWithLinks = FactDto & {
  /** Proposed fact: the older fact it would replace when confirmed. */
  supersedes?: FactLink | null;
  /** Older fact: a newer proposal would replace it ("superseded by proposal"). */
  supersedeProposal?: FactLink | null;
};

export function FactSource({
  fact,
  orgId,
  documentTitle,
}: {
  fact: FactDto;
  orgId: string;
  documentTitle?: string;
}) {
  if (fact.sourceType === "user_entered") {
    return (
      <span className="inline-flex items-center gap-1">
        <User className="h-3.5 w-3.5" aria-hidden /> Entered by you
      </span>
    );
  }
  if (fact.sourceType === "interview" && fact.sourceInterviewId) {
    return (
      <Link
        to="/orgs/$orgId/interviews/$interviewId"
        params={{ orgId, interviewId: fact.sourceInterviewId }}
        className="inline-flex items-center gap-1 text-brand-700 hover:underline"
      >
        <MessageSquare className="h-3.5 w-3.5" aria-hidden /> From an interview
      </Link>
    );
  }
  if (fact.sourceDocumentId) {
    return (
      <Link
        to="/orgs/$orgId/knowledge/documents/$documentId"
        params={{ orgId, documentId: fact.sourceDocumentId }}
        className="inline-flex items-center gap-1 text-brand-700 hover:underline"
      >
        <FileText className="h-3.5 w-3.5" aria-hidden />
        {documentTitle ?? (fact.sourceType === "website" ? "Website page" : "Source document")}
      </Link>
    );
  }
  return <span>{fact.sourceType === "website" ? "From your website" : "Unknown source"}</span>;
}

export function FactCard({
  fact,
  orgId,
  documentTitle,
  selectable = false,
  selected = false,
  onSelectedChange,
  onConfirm,
  onReject,
  onSave,
  onStillTrue,
  busy = null,
  error,
  now,
}: {
  fact: FactWithLinks;
  orgId: string;
  documentTitle?: string;
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  onConfirm?: () => void;
  onReject?: () => void;
  onSave?: (patch: FactPatch) => Promise<unknown>;
  /** "Confirm still true" for a confirmed fact that may be outdated. */
  onStillTrue?: () => void;
  busy?: FactBusy;
  error?: string | null;
  /** Clock for the staleness check (tests). */
  now?: Date;
}) {
  const uid = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    statement: fact.statement,
    category: fact.category as FactCategory,
    asOf: fact.asOf ?? "",
  });
  const [editError, setEditError] = useState<string | null>(null);

  const startEdit = () => {
    setDraft({ statement: fact.statement, category: fact.category, asOf: fact.asOf ?? "" });
    setEditError(null);
    setEditing(true);
  };
  const save = async () => {
    if (!draft.statement.trim()) {
      setEditError("The statement can't be empty.");
      return;
    }
    try {
      await onSave?.({
        statement: draft.statement.trim(),
        category: draft.category,
        asOf: draft.asOf.trim() || null,
      });
      setEditing(false);
    } catch (e) {
      setEditError(friendlyError(e));
    }
  };

  const statementId = `${uid}-statement`;
  const canAct = fact.status !== "superseded";
  const stale = factStaleness(fact, now ?? new Date());
  const proposal = fact.status !== "superseded" ? fact.supersedeProposal : null;
  const replaces = fact.status === "proposed" ? fact.supersedes : null;

  return (
    <article
      data-tour="fact-card"
      aria-labelledby={statementId}
      className={cn(
        "rounded-lg border bg-white p-4 shadow-sm",
        selected ? "border-brand-500 ring-1 ring-brand-500" : "border-neutral-200",
        fact.status === "rejected" && "opacity-75",
      )}
    >
      <div className="flex items-start gap-3">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelectedChange?.(e.target.checked)}
            aria-label={`Select fact: ${fact.statement}`}
            className="mt-1 h-4 w-4 rounded border-neutral-300"
          />
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">{factCategoryLabel(fact.category)}</Badge>
            <FactStatusBadge status={fact.status} />
            {fact.sensitivity === "restricted" && (
              <Badge tone="danger" className="gap-1">
                <ShieldAlert className="h-3 w-3" aria-hidden /> Restricted — never used in drafts
              </Badge>
            )}
            {fact.asOf && <span className="text-xs text-neutral-500">As of {fact.asOf}</span>}
            {stale && (
              <span className="text-xs font-medium text-warning-700" title={stale.label}>
                {stale.reason === "dated" ? "— may be outdated" : stale.label}
              </span>
            )}
            {proposal && <Badge tone="warning">Superseded by proposal</Badge>}
            {fact.sourceType !== "user_entered" && (
              <span className="text-xs text-neutral-500">
                Confidence {Math.round((fact.confidence ?? 0) * 100)}%
              </span>
            )}
          </div>

          {editing ? (
            <div className="space-y-3">
              <Field
                label="Statement"
                htmlFor={`${uid}-edit-statement`}
                error={editError ?? undefined}
              >
                <Textarea
                  id={`${uid}-edit-statement`}
                  value={draft.statement}
                  onChange={(e) => setDraft((d) => ({ ...d, statement: e.target.value }))}
                  className="min-h-16"
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Category" htmlFor={`${uid}-edit-category`}>
                  <Select
                    id={`${uid}-edit-category`}
                    value={draft.category}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, category: e.target.value as FactCategory }))
                    }
                  >
                    {FACT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {FACT_CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="As of" htmlFor={`${uid}-edit-asof`} hint="e.g. 2025 or 2026-06-30">
                  <Input
                    id={`${uid}-edit-asof`}
                    value={draft.asOf}
                    onChange={(e) => setDraft((d) => ({ ...d, asOf: e.target.value }))}
                  />
                </Field>
              </div>
            </div>
          ) : (
            <p id={statementId} className="text-sm font-medium text-neutral-900">
              {fact.statement}
            </p>
          )}

          {replaces && (
            <p className="text-xs text-warning-700">
              Updates “{replaces.statement}”{replaces.asOf ? ` (as of ${replaces.asOf})` : ""}.
              Confirming this marks the older fact superseded.
            </p>
          )}
          {proposal && (
            <p className="text-xs text-warning-700">
              A newer proposed fact would replace this one: “{proposal.statement}”
              {proposal.asOf ? ` (as of ${proposal.asOf})` : ""}. It stays in use until that is
              confirmed.
            </p>
          )}

          {fact.sourceQuote && (
            <blockquote className="border-l-4 border-neutral-200 pl-3 text-sm italic text-neutral-600">
              “{fact.sourceQuote}”
            </blockquote>
          )}

          <p className="text-xs text-neutral-500">
            Source: <FactSource fact={fact} orgId={orgId} documentTitle={documentTitle} />
          </p>

          {(error || (editError && !editing)) && (
            <p className="text-sm text-danger-600" role="alert">
              {error ?? editError}
            </p>
          )}
        </div>
      </div>

      {canAct && (
        <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-neutral-100 pt-3">
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} loading={busy === "save"}>
                Save
              </Button>
            </>
          ) : (
            <>
              {onSave && (
                <Button size="sm" variant="ghost" onClick={startEdit} disabled={!!busy}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                </Button>
              )}
              {onStillTrue && stale && fact.status === "confirmed" && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onStillTrue}
                  loading={busy === "still_true"}
                  disabled={!!busy && busy !== "still_true"}
                >
                  {busy !== "still_true" && <CheckCheck className="h-3.5 w-3.5" aria-hidden />}{" "}
                  Confirm still true
                </Button>
              )}
              {onReject && fact.status !== "rejected" && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onReject}
                  loading={busy === "reject"}
                  disabled={!!busy && busy !== "reject"}
                >
                  {busy !== "reject" && <X className="h-3.5 w-3.5" aria-hidden />} Reject
                </Button>
              )}
              {onConfirm && fact.status !== "confirmed" && (
                <Button
                  size="sm"
                  onClick={onConfirm}
                  loading={busy === "confirm"}
                  disabled={!!busy && busy !== "confirm"}
                >
                  {busy !== "confirm" && <Check className="h-3.5 w-3.5" aria-hidden />} Confirm
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}
