// "Draft application" actions: a one-click button (dashboard) and a form with ask + project.
import { Button, Field, Input, Select } from "@client/components/ui";
import type { MatchDto, ProjectDto } from "@shared/api/types";
import { Sparkles } from "lucide-react";
import * as React from "react";
import { ApiErrorAlert, UpgradePrompt } from "./api-error-alert";
import { type ErrorMessages, friendlyError, isPaymentRequired } from "./api-errors";
import { centsToDollarsInput, dollarsToCents } from "./format";
import { useDraftApplication } from "./queries";

/** POST /applications errors: 402 (plan limit, upgrade prompt), 409 (already in progress), 404. */
export const DRAFT_ERRORS: ErrorMessages = {
  conflict:
    "An application for this grant is already in progress. Open it from Applications to keep working.",
  not_found: "This grant is no longer available.",
};

export function DraftApplicationButton({
  orgId,
  opportunityId,
  projectId,
  requestedAmountCents,
  size = "sm",
  label = "Draft application",
}: {
  orgId: string;
  opportunityId: string;
  projectId?: string | null;
  requestedAmountCents?: number | null;
  size?: "sm" | "md";
  label?: string;
}) {
  const draft = useDraftApplication(orgId);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size={size}
        loading={draft.isPending}
        onClick={() =>
          draft.mutate({
            opportunityId,
            projectId: projectId ?? undefined,
            requestedAmountCents: requestedAmountCents ?? undefined,
          })
        }
      >
        {!draft.isPending && <Sparkles className="h-4 w-4" aria-hidden />}
        {draft.isPending ? "Starting draft…" : label}
      </Button>
      {draft.error &&
        (isPaymentRequired(draft.error) ? (
          <UpgradePrompt orgId={orgId} message={friendlyError(draft.error)} />
        ) : (
          <p className="text-xs text-danger-600" role="alert">
            {friendlyError(draft.error, DRAFT_ERRORS)}
          </p>
        ))}
    </div>
  );
}

export function DraftApplicationForm({
  orgId,
  opportunityId,
  match,
  projects,
  disabled,
}: {
  orgId: string;
  opportunityId: string;
  match: MatchDto | null;
  projects: ProjectDto[];
  disabled?: boolean;
}) {
  const draft = useDraftApplication(orgId);
  const amountId = React.useId();
  const projectFieldId = React.useId();
  const [amount, setAmount] = React.useState(centsToDollarsInput(match?.suggestedAskCents));
  const [projectId, setProjectId] = React.useState(match?.projectId ?? "");
  const [amountError, setAmountError] = React.useState<string | null>(null);

  // Prefill once the match arrives (e.g. after a rescore) unless the user already typed.
  const suggested = match?.suggestedAskCents;
  const touched = React.useRef(false);
  React.useEffect(() => {
    if (!touched.current) setAmount(centsToDollarsInput(suggested));
  }, [suggested]);

  const activeProjects = projects.filter((p) => p.status !== "archived");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setAmountError(null);
    const cents = dollarsToCents(amount);
    if (amount.trim() && cents == null) {
      setAmountError("Enter a dollar amount, e.g. 75000");
      return;
    }
    draft.mutate({
      opportunityId,
      projectId: projectId || undefined,
      requestedAmountCents: cents ?? undefined,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Draft application">
      <Field
        label="Requested amount (USD)"
        htmlFor={amountId}
        error={amountError ?? undefined}
        hint={
          suggested != null
            ? "Prefilled with the suggested ask. You can change it."
            : "Leave blank to let the drafter propose an amount from your budget facts."
        }
      >
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-neutral-500">
            $
          </span>
          <Input
            id={amountId}
            inputMode="decimal"
            className="pl-7"
            value={amount}
            onChange={(e) => {
              touched.current = true;
              setAmount(e.target.value);
            }}
            placeholder="75000"
          />
        </div>
      </Field>
      {activeProjects.length > 0 && (
        <Field
          label="Project"
          htmlFor={projectFieldId}
          hint="Focus the application on one of your projects."
        >
          <Select
            id={projectFieldId}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">Whole organization (no specific project)</option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <ApiErrorAlert
        error={draft.error}
        orgId={orgId}
        title="Couldn't start the draft"
        messages={DRAFT_ERRORS}
      />
      <Button type="submit" className="w-full" loading={draft.isPending} disabled={disabled}>
        {!draft.isPending && <Sparkles className="h-4 w-4" aria-hidden />}
        {draft.isPending ? "Starting draft…" : "Draft application"}
      </Button>
      <p className="text-xs text-neutral-500">
        Drafts use only facts from your documents and interviews. Anything we can't support becomes
        a question for you, never invented text.
      </p>
    </form>
  );
}
