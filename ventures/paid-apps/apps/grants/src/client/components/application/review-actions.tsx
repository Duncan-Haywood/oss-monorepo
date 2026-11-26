// Reviewer actions: Approve & submit (confirm dialog listing open warnings + the submission
// channel), Request changes, quality feedback, outcome recording and the AI cost line.
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { centsToDollarsInput, dollarsToCents, humanize } from "@client/components/grants/format";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Dialog,
  Field,
  Input,
  Select,
  Textarea,
  toast,
} from "@client/components/ui";
import { formatCents, formatDate } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { CheckCircle2, Coins, MessageSquareWarning, Send, Star, Trophy } from "lucide-react";
import * as React from "react";
import {
  DECIDABLE_STATUSES,
  FLAG_KIND_LABEL,
  formatMicros,
  isBusy,
  OUTCOME_STATUSES,
  openFlagCounts,
  RATING_LABELS,
  submissionChannelText,
} from "./model";
import {
  useAddFeedback,
  useApplicationCost,
  useFeedback,
  useRecordOutcome,
  useReviewDecision,
} from "./queries";
import type { ApplicationDetail } from "./types";

const REVIEW_CARD_STATUSES = new Set([
  "draft_queued",
  "drafting",
  "verifying",
  "needs_info",
  "in_review",
  "changes_requested",
  "approved",
  "failed",
]);

/** Warnings listed in the confirm dialog before "…and N more". */
const MAX_DIALOG_WARNINGS = 5;

export function approveBlockedReason(app: ApplicationDetail): string | null {
  const { blockers } = openFlagCounts(app.flags);
  if (blockers > 0) {
    return `Resolve ${blockers} blocking flag${blockers === 1 ? "" : "s"} before approving.`;
  }
  if (isBusy(app.status)) return "Available once drafting and fact-checking finish.";
  if (!app.currentVersion) return "There is no draft to approve yet.";
  if (!DECIDABLE_STATUSES.includes(app.status)) {
    return `This application is ${humanize(app.status).toLowerCase()} and can't be approved right now.`;
  }
  return null;
}

export function ReviewActions({
  app,
  orgId,
  canReview,
}: {
  app: ApplicationDetail;
  orgId: string;
  canReview: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [changesOpen, setChangesOpen] = React.useState(false);
  const [comments, setComments] = React.useState("");
  const [commentsError, setCommentsError] = React.useState<string | null>(null);
  const decision = useReviewDecision(orgId, app.id);
  const commentsId = React.useId();
  const reasonId = React.useId();

  if (!REVIEW_CARD_STATUSES.has(app.status)) return null;

  const blockedReason = approveBlockedReason(app);
  const warnings = app.flags.filter((f) => f.status === "open" && f.severity === "warning");
  const canRequestChanges = !!app.currentVersion && DECIDABLE_STATUSES.includes(app.status);

  const approve = () =>
    decision.mutate(
      { decision: "approved" },
      {
        onSuccess: (res) => {
          setConfirmOpen(false);
          // Approval policy (services/approvals): more approvers needed, nothing was submitted.
          const progress = (
            res as unknown as { approval?: { satisfied: boolean; message: string } } | undefined
          )?.approval;
          if (progress && !progress.satisfied) {
            toast.success("Your approval is recorded", progress.message);
            return;
          }
          toast.success(
            "Approved. Submission recorded.",
            res?.status === "submitting"
              ? "Follow the step-by-step guide to finish submitting."
              : undefined,
          );
        },
      },
    );

  const requestChanges = () => {
    const text = comments.trim();
    if (!text) {
      setCommentsError("Tell the drafter what to change.");
      return;
    }
    decision.mutate(
      { decision: "changes_requested", comments: text },
      {
        onSuccess: () => {
          setChangesOpen(false);
          setComments("");
          toast.success("Changes requested", "The drafter is revising the application.");
        },
      },
    );
  };

  return (
    <Card data-tour="app-approve">
      <CardHeader>
        <h2 className="text-base font-semibold tracking-tight text-neutral-900">Review</h2>
      </CardHeader>
      <CardBody className="space-y-3">
        {app.status === "approved" && app.lastError && (
          <Alert tone="danger" title="Submission didn't go through">
            {app.lastError} Approve again to retry.
          </Alert>
        )}
        {canReview ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  decision.reset();
                  setConfirmOpen(true);
                }}
                disabled={!!blockedReason}
                aria-describedby={blockedReason ? reasonId : undefined}
              >
                <Send aria-hidden /> Approve &amp; submit
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  decision.reset();
                  setCommentsError(null);
                  setChangesOpen(true);
                }}
                disabled={!canRequestChanges}
              >
                <MessageSquareWarning aria-hidden /> Request changes
              </Button>
            </div>
            {blockedReason && (
              <p id={reasonId} className="text-sm text-neutral-600">
                {blockedReason}
              </p>
            )}
            {!blockedReason && warnings.length > 0 && (
              <p className="text-sm text-warning-800">
                {warnings.length} open warning{warnings.length === 1 ? "" : "s"} — you'll see them
                before confirming.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-neutral-600">
            A reviewer, editor or admin approves applications. Ask an admin for reviewer access.
          </p>
        )}
      </CardBody>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => !decision.isPending && setConfirmOpen(false)}
        onConfirm={approve}
        loading={decision.isPending}
        title="Approve & submit?"
        description={`“${app.title}” to ${app.opportunity.funderName}`}
        confirmLabel="Approve & submit"
      >
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Submission channel
            </p>
            <p className="mt-0.5">{submissionChannelText(app.opportunity)}</p>
          </div>
          {warnings.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-warning-800">
                Open warnings ({warnings.length})
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-warning-950">
                {warnings.slice(0, MAX_DIALOG_WARNINGS).map((w) => (
                  <li key={w.id} className="line-clamp-3">
                    <span className="font-medium">{FLAG_KIND_LABEL[w.kind]}:</span> {w.message}
                  </li>
                ))}
              </ul>
              {warnings.length > MAX_DIALOG_WARNINGS && (
                <p className="mt-1 text-xs text-warning-900">
                  …and {warnings.length - MAX_DIALOG_WARNINGS} more in the Flags panel.
                </p>
              )}
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-success-800">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> No open warnings.
            </p>
          )}
          <p className="text-xs text-neutral-500">
            The exact package is stored with its SHA-256 fingerprint so you can prove what was sent.
          </p>
          <ApiErrorAlert
            error={decision.error}
            title="Couldn't approve"
            messages={{ open_blockers: "Resolve the blocking flags first, then approve again." }}
          />
        </div>
      </ConfirmDialog>

      <Dialog
        open={changesOpen}
        onClose={() => !decision.isPending && setChangesOpen(false)}
        dismissible={!decision.isPending}
        title="Request changes"
        description="The drafter revises the application using only your fact base, then it's fact-checked again."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setChangesOpen(false)}
              disabled={decision.isPending}
            >
              Cancel
            </Button>
            <Button onClick={requestChanges} loading={decision.isPending}>
              Request changes
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field
            label="What should change?"
            htmlFor={commentsId}
            required
            error={commentsError ?? undefined}
          >
            <Textarea
              id={commentsId}
              value={comments}
              onChange={(e) => {
                setComments(e.target.value);
                if (commentsError) setCommentsError(null);
              }}
              aria-invalid={!!commentsError || undefined}
              aria-required
              maxLength={10_000}
              placeholder="e.g. Lead the need statement with the unemployment numbers; shorten the budget narrative."
            />
          </Field>
          <ApiErrorAlert error={decision.error} title="Couldn't request changes" />
        </div>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------

export function FeedbackWidget({
  orgId,
  applicationId,
  sections,
}: {
  orgId: string;
  applicationId: string;
  sections: { key: string; title: string }[];
}) {
  const [rating, setRating] = React.useState<number | null>(null);
  const [scope, setScope] = React.useState("");
  const [comment, setComment] = React.useState("");
  const add = useAddFeedback(orgId, applicationId);
  const list = useFeedback(orgId, applicationId);
  const name = React.useId();
  const scopeId = React.useId();
  const commentId = React.useId();
  const titles = new Map(sections.map((s) => [s.key, s.title]));
  const recent = (list.data?.items ?? []).slice(0, 3);

  return (
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-neutral-900">
          <Star className="h-4 w-4 text-warning-500" aria-hidden /> Rate this draft
        </h2>
      </CardHeader>
      <CardBody>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!rating) return;
            add.mutate(
              { rating, comment: comment.trim() || undefined, sectionKey: scope || null },
              {
                onSuccess: () => {
                  toast.success("Thanks — feedback saved", "Future drafts learn from it.");
                  setRating(null);
                  setComment("");
                },
              },
            );
          }}
        >
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-neutral-700">How good is it?</legend>
            <div className="flex flex-wrap gap-1.5">
              {RATING_LABELS.map((label, i) => {
                const value = i + 1;
                const checked = rating === value;
                return (
                  <label
                    key={label}
                    className={cn(
                      "cursor-pointer select-none rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                      checked
                        ? "bg-brand-600 text-white ring-brand-600"
                        : "bg-white text-neutral-700 ring-neutral-300 hover:bg-neutral-50",
                    )}
                  >
                    <input
                      type="radio"
                      name={name}
                      value={value}
                      checked={checked}
                      onChange={() => setRating(value)}
                      className="sr-only"
                    />
                    {value} · {label}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <Field label="About" htmlFor={scopeId}>
            <Select id={scopeId} value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="">The whole application</option>
              {sections.map((s) => (
                <option key={s.key} value={s.key}>
                  Section: {s.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Comment (optional)" htmlFor={commentId}>
            <Textarea
              id={commentId}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={5000}
              className="min-h-16"
              placeholder="What worked, what didn't?"
            />
          </Field>
          <ApiErrorAlert error={add.error} title="Couldn't save feedback" />
          <Button type="submit" size="sm" disabled={!rating} loading={add.isPending}>
            Send feedback
          </Button>
        </form>
        {recent.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-neutral-100 pt-3 text-sm">
            {recent.map((f) => (
              <li key={f.id} className="text-neutral-600">
                <Badge tone={f.rating >= 4 ? "success" : f.rating <= 2 ? "danger" : "neutral"}>
                  {RATING_LABELS[f.rating - 1] ?? f.rating}
                </Badge>{" "}
                <span className="text-xs text-neutral-500">
                  {f.sectionKey ? (titles.get(f.sectionKey) ?? f.sectionKey) : "Whole application"}
                </span>
                {f.comment && <span className="block text-neutral-700">{f.comment}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------

export function OutcomeCard({
  app,
  orgId,
  canEdit,
}: {
  app: ApplicationDetail;
  orgId: string;
  canEdit: boolean;
}) {
  const recorded = app.status === "awarded" || app.status === "declined";
  const [editing, setEditing] = React.useState(false);
  const [outcome, setOutcome] = React.useState<"awarded" | "declined">("awarded");
  const [amount, setAmount] = React.useState(() =>
    centsToDollarsInput(app.awardedAmountCents ?? app.requestedAmountCents),
  );
  const [notes, setNotes] = React.useState("");
  const [amountError, setAmountError] = React.useState<string | null>(null);
  const record = useRecordOutcome(orgId, app.id);
  const name = React.useId();
  const amountId = React.useId();
  const notesId = React.useId();

  if (!OUTCOME_STATUSES.includes(app.status)) return null;
  const showForm = canEdit && (!recorded || editing);

  return (
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-neutral-900">
          <Trophy className="h-4 w-4 text-warning-500" aria-hidden /> Outcome
        </h2>
        {recorded && (
          <Badge tone={app.status === "awarded" ? "success" : "neutral"}>
            {app.status === "awarded" ? "Awarded" : "Declined"}
          </Badge>
        )}
      </CardHeader>
      <CardBody className="space-y-3">
        {recorded && !editing && (
          <div className="text-sm text-neutral-700">
            {app.status === "awarded" ? (
              <p>
                Awarded <strong>{formatCents(app.awardedAmountCents)}</strong>
                {app.outcomeAt ? ` on ${formatDate(app.outcomeAt)}` : ""}.
              </p>
            ) : (
              <p>Declined{app.outcomeAt ? ` on ${formatDate(app.outcomeAt)}` : ""}.</p>
            )}
            {app.outcomeNotes && <p className="mt-1 text-neutral-500">{app.outcomeNotes}</p>}
            {canEdit && (
              <Button size="xs" variant="ghost" className="mt-2" onClick={() => setEditing(true)}>
                Update outcome
              </Button>
            )}
          </div>
        )}
        {!recorded && !canEdit && (
          <p className="text-sm text-neutral-600">Waiting for the funder's decision.</p>
        )}
        {showForm && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              let cents: number | undefined;
              if (outcome === "awarded" && amount.trim()) {
                const c = dollarsToCents(amount);
                if (c === null) {
                  setAmountError("Enter a dollar amount, e.g. 50,000");
                  return;
                }
                cents = c;
              }
              record.mutate(
                {
                  outcome,
                  ...(cents !== undefined ? { awardedAmountCents: cents } : {}),
                  ...(notes.trim() ? { notes: notes.trim() } : {}),
                },
                {
                  onSuccess: () => {
                    toast.success(
                      outcome === "awarded"
                        ? "Congratulations! Award recorded"
                        : "Outcome recorded",
                    );
                    setEditing(false);
                  },
                },
              );
            }}
          >
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-neutral-700">
                What did the funder decide?
              </legend>
              <div className="flex gap-4 text-sm">
                {(["awarded", "declined"] as const).map((o) => (
                  <label key={o} className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name={name}
                      value={o}
                      checked={outcome === o}
                      onChange={() => setOutcome(o)}
                      className="accent-brand-600"
                    />
                    {o === "awarded" ? "Awarded" : "Declined"}
                  </label>
                ))}
              </div>
            </fieldset>
            {outcome === "awarded" && (
              <Field
                label="Amount awarded (USD)"
                htmlFor={amountId}
                error={amountError ?? undefined}
              >
                <Input
                  id={amountId}
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setAmountError(null);
                  }}
                  aria-invalid={!!amountError || undefined}
                />
              </Field>
            )}
            <Field label="Notes (optional)" htmlFor={notesId}>
              <Textarea
                id={notesId}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={5000}
                className="min-h-16"
              />
            </Field>
            <ApiErrorAlert error={record.error} title="Couldn't record the outcome" />
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={record.isPending}>
                Record outcome
              </Button>
              {editing && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------

export function CostLine({ orgId, app }: { orgId: string; app: ApplicationDetail }) {
  const cost = useApplicationCost(orgId, app.id, app.status);
  if (cost.isPending) return <p className="text-xs text-neutral-400">Calculating AI cost…</p>;
  if (cost.error || !cost.data) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-neutral-500">
      <Coins className="h-3.5 w-3.5" aria-hidden />
      AI cost so far:{" "}
      <span className="font-semibold text-neutral-700">{formatMicros(cost.data.costMicros)}</span>
      {" · "}
      {cost.data.calls} model call{cost.data.calls === 1 ? "" : "s"}
    </p>
  );
}
