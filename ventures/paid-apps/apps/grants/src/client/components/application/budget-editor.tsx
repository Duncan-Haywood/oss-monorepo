// Project budget editor: line items by SF-424A category, live totals (the same @shared/budget math
// the server stores), request vs match, award-ceiling and cost-share warnings, "Propose from my
// facts" (amounts only from cited facts; the rest are $0 lines marked "needs your input").
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Select,
  SkeletonCard,
  Table,
  Td,
  Textarea,
  Th,
  toast,
} from "@client/components/ui";
import { api, formatCents, orgApi } from "@client/lib/api";
import {
  BUDGET_CATEGORIES,
  BUDGET_CATEGORY_LABEL,
  type BudgetCategory,
  type BudgetDto,
  type BudgetLine,
  type BudgetWarning,
  budgetWarnings,
  computeLine,
  computeTotals,
  FUNDING_SOURCE_LABEL,
  FUNDING_SOURCES,
  type FundingSource,
  lineNeedsInput,
} from "@shared/budget";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import * as React from "react";

const enc = encodeURIComponent;
export const budgetKey = (orgId: string, id: string) =>
  ["orgs", orgId, "applications", "detail", id, "budget"] as const;

export function useBudget(orgId: string, applicationId: string) {
  return useQuery({
    queryKey: budgetKey(orgId, applicationId),
    queryFn: () => api<BudgetDto>(orgApi(orgId, `/applications/${enc(applicationId)}/budget`)),
    enabled: !!orgId && !!applicationId,
  });
}

interface Draft {
  lines: BudgetLine[];
  notes: string;
  requiredMatchCents: number | null;
}

const fromDto = (d: BudgetDto): Draft => ({
  lines: d.lines,
  notes: d.notes,
  requiredMatchCents: d.requiredMatchCents,
});

let tempSeq = 0;
function newLine(): BudgetLine {
  tempSeq += 1;
  const rand = Math.random().toString(36).slice(2, 10).padEnd(8, "0");
  return computeLine({
    id: `bln_${rand}${tempSeq}`.slice(0, 36),
    category: "personnel",
    description: "",
    quantity: 1,
    unitCostCents: 0,
    source: "user",
    factIds: [],
    fundingSource: "request",
    note: "",
  });
}

/** "$1,250.50" -> 125050 cents; blank or invalid -> 0. */
export function dollarsToCents(s: string): number {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

const centsToInput = (c: number) => (c ? String(c / 100) : "");

const WARNING_TONE: Record<BudgetWarning["severity"], "danger" | "warning" | "info"> = {
  blocker: "danger",
  warning: "warning",
  info: "info",
};

export function BudgetEditor({
  orgId,
  applicationId,
  canEdit,
}: {
  orgId: string;
  applicationId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const q = useBudget(orgId, applicationId);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [confirmReplace, setConfirmReplace] = React.useState(false);
  const uid = React.useId();

  // Reset the working copy whenever the server copy changes (load, save, propose).
  React.useEffect(() => {
    if (q.data) setDraft(fromDto(q.data));
  }, [q.data]);

  const onSaved = (d: BudgetDto) => {
    qc.setQueryData(budgetKey(orgId, applicationId), d);
    setConfirmReplace(false);
  };
  const save = useMutation({
    mutationFn: (d: Draft) =>
      api<BudgetDto>(orgApi(orgId, `/applications/${enc(applicationId)}/budget`), {
        method: "PUT",
        body: {
          lines: d.lines.map(({ totalCents: _t, ...l }) => l),
          notes: d.notes,
          requiredMatchCents: d.requiredMatchCents,
        },
      }),
    onSuccess: (d) => {
      onSaved(d);
      toast.success("Budget saved");
    },
  });
  const propose = useMutation({
    mutationFn: (replace: boolean) =>
      api<BudgetDto>(orgApi(orgId, `/applications/${enc(applicationId)}/budget/propose`), {
        method: "POST",
        body: { replace },
      }),
    onSuccess: (d) => {
      onSaved(d);
      toast.success("Budget proposed from your facts. Review each line.");
    },
  });

  if (q.isPending || (q.data && !draft)) return <SkeletonCard />;
  if (q.error) return <ApiErrorAlert error={q.error} title="Couldn't load the budget" />;
  if (!q.data || !draft) return null;

  const server = q.data;
  const rules = {
    awardCeilingCents: server.rules.awardCeilingCents,
    costSharingRequired: server.rules.costSharingRequired,
    requiredMatchCents: draft.requiredMatchCents,
    requestedAmountCents: server.rules.requestedAmountCents,
  };
  const totals = computeTotals(draft.lines, rules);
  const warnings = budgetWarnings(totals, rules);
  const dirty = JSON.stringify(fromDto(server)) !== JSON.stringify(draft);
  const busy = save.isPending || propose.isPending;
  const disabled = !canEdit || busy;

  const update = (id: string, patch: Partial<BudgetLine>) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            lines: d.lines.map((l) => {
              if (l.id !== id) return l;
              const amountsChanged = "quantity" in patch || "unitCostCents" in patch;
              // An edited amount is the user's, not the fact's (the server re-checks either way).
              return computeLine({ ...l, ...patch, ...(amountsChanged ? { source: "user" } : {}) });
            }),
          }
        : d,
    );

  const onPropose = () => {
    if (draft.lines.length > 0 && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    propose.mutate(draft.lines.length > 0);
  };

  const nonEmptyRows = totals.categories.rows.filter((r) => r.totalCents > 0);

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Project budget</h2>
          <p className="text-sm text-neutral-500">
            Amounts come from your facts or from you. Totals are calculated automatically.
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            {confirmReplace ? (
              <>
                <span className="text-sm text-neutral-600">
                  Replace the {draft.lines.length} current lines?
                </span>
                <Button size="sm" variant="danger" loading={propose.isPending} onClick={onPropose}>
                  Replace
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmReplace(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                loading={propose.isPending}
                disabled={disabled}
                onClick={onPropose}
              >
                <Sparkles className="h-4 w-4" aria-hidden /> Propose from my facts
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardBody className="space-y-4">
        {propose.error && <ApiErrorAlert error={propose.error} title="Couldn't propose a budget" />}
        {save.error && <ApiErrorAlert error={save.error} title="Couldn't save the budget" />}

        {warnings.length > 0 && (
          <ul aria-label="Budget warnings" className="space-y-2">
            {warnings.map((w) => (
              <li key={w.code}>
                <Alert tone={WARNING_TONE[w.severity]}>{w.message}</Alert>
              </li>
            ))}
          </ul>
        )}

        <Table aria-label="Budget lines">
          <thead>
            <tr>
              <Th>Category</Th>
              <Th>Description</Th>
              <Th className="text-right">Qty</Th>
              <Th className="text-right">Unit cost ($)</Th>
              <Th className="text-right">Total</Th>
              <Th>Funding</Th>
              <Th>
                <span className="sr-only">Source and actions</span>
              </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {draft.lines.length === 0 && (
              <tr>
                <Td colSpan={7} className="text-center text-neutral-500">
                  No budget lines yet.{" "}
                  {canEdit && "Propose a starting budget from your facts, or add lines yourself."}
                </Td>
              </tr>
            )}
            {draft.lines.map((l, i) => {
              const label = l.description || `line ${i + 1}`;
              return (
                <tr key={l.id} data-needs-input={lineNeedsInput(l) || undefined}>
                  <Td>
                    <Select
                      aria-label={`Category for ${label}`}
                      value={l.category}
                      disabled={disabled}
                      onChange={(e) => update(l.id, { category: e.target.value as BudgetCategory })}
                    >
                      {BUDGET_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {BUDGET_CATEGORY_LABEL[c]}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td className="min-w-48">
                    <Input
                      aria-label={`Description for line ${i + 1}`}
                      value={l.description}
                      disabled={disabled}
                      maxLength={500}
                      onChange={(e) => update(l.id, { description: e.target.value })}
                    />
                  </Td>
                  <Td className="w-24">
                    <Input
                      aria-label={`Quantity for ${label}`}
                      type="number"
                      min={0}
                      step="any"
                      className="text-right"
                      value={String(l.quantity)}
                      disabled={disabled}
                      onChange={(e) =>
                        update(l.id, { quantity: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
                  </Td>
                  <Td className="w-36">
                    <Input
                      aria-label={`Unit cost for ${label}`}
                      inputMode="decimal"
                      className="text-right"
                      placeholder="0"
                      value={centsToInput(l.unitCostCents)}
                      disabled={disabled}
                      onChange={(e) =>
                        update(l.id, { unitCostCents: dollarsToCents(e.target.value) })
                      }
                    />
                  </Td>
                  <Td
                    className="text-right font-medium tabular-nums"
                    aria-label={`Total for ${label}`}
                  >
                    {formatCents(l.totalCents)}
                  </Td>
                  <Td>
                    <Select
                      aria-label={`Funding for ${label}`}
                      value={l.fundingSource}
                      disabled={disabled}
                      onChange={(e) =>
                        update(l.id, { fundingSource: e.target.value as FundingSource })
                      }
                    >
                      {FUNDING_SOURCES.map((f) => (
                        <option key={f} value={f}>
                          {FUNDING_SOURCE_LABEL[f]}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      {lineNeedsInput(l) ? (
                        <Badge tone="warning">Needs your input</Badge>
                      ) : l.source === "fact" ? (
                        <Badge tone="success" title={`Cites ${l.factIds.join(", ")}`}>
                          From facts
                        </Badge>
                      ) : (
                        <Badge>Entered</Badge>
                      )}
                      {canEdit && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove ${label}`}
                          disabled={busy}
                          onClick={() =>
                            setDraft({ ...draft, lines: draft.lines.filter((x) => x.id !== l.id) })
                          }
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>

        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setDraft({ ...draft, lines: [...draft.lines, newLine()] })}
          >
            <Plus className="h-4 w-4" aria-hidden /> Add line
          </Button>
        )}

        <dl aria-label="Budget totals" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Request", totals.match.requestCents],
            ["Match", totals.match.matchCents],
            ["Other funds", totals.match.otherCents],
            ["Total project", totals.match.totalProjectCents],
          ].map(([label, cents]) => (
            <div key={label} className="rounded-lg bg-neutral-50 px-3 py-2">
              <dt className="text-xs text-neutral-500">{label}</dt>
              <dd
                className="text-lg font-semibold tabular-nums text-neutral-900"
                data-testid={`total-${label}`}
              >
                {formatCents(cents as number)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-neutral-500">
          {server.rules.awardCeilingCents
            ? `Award ceiling: ${formatCents(server.rules.awardCeilingCents)}. `
            : ""}
          {totals.match.matchPercentOfTotal !== null
            ? `Match is ${totals.match.matchPercentOfTotal}% of the total project cost. `
            : ""}
          {server.rules.projectNeedCents
            ? `Project budget need: ${formatCents(server.rules.projectNeedCents)}.`
            : ""}
        </p>

        {nonEmptyRows.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-neutral-700">
              Summary by category (SF-424A)
            </summary>
            <Table aria-label="Budget summary by category" className="mt-2">
              <thead>
                <tr>
                  <Th>Category</Th>
                  <Th className="text-right">Request</Th>
                  <Th className="text-right">Match</Th>
                  <Th className="text-right">Other</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {[
                  ...nonEmptyRows.map((r) => [BUDGET_CATEGORY_LABEL[r.category], r] as const),
                  ["Total", totals.categories.total] as const,
                ].map(([label, r]) => (
                  <tr key={label}>
                    <Td>{label}</Td>
                    <Td className="text-right tabular-nums">{formatCents(r.requestCents)}</Td>
                    <Td className="text-right tabular-nums">{formatCents(r.matchCents)}</Td>
                    <Td className="text-right tabular-nums">{formatCents(r.otherCents)}</Td>
                    <Td className="text-right tabular-nums">{formatCents(r.totalCents)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </details>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {(server.rules.costSharingRequired || draft.requiredMatchCents !== null) && (
            <Field
              label="Required match ($, from the funder's instructions)"
              htmlFor={`${uid}-match`}
            >
              <Input
                id={`${uid}-match`}
                inputMode="decimal"
                value={draft.requiredMatchCents ? String(draft.requiredMatchCents / 100) : ""}
                disabled={disabled}
                onChange={(e) =>
                  setDraft({ ...draft, requiredMatchCents: dollarsToCents(e.target.value) || null })
                }
              />
            </Field>
          )}
          <Field label="Budget notes" htmlFor={`${uid}-notes`} className="sm:col-span-2">
            <Textarea
              id={`${uid}-notes`}
              value={draft.notes}
              disabled={disabled}
              maxLength={10_000}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </Field>
        </div>

        {canEdit && (
          <div className="flex items-center justify-end gap-2">
            {dirty && (
              <Button variant="ghost" disabled={busy} onClick={() => setDraft(fromDto(server))}>
                Discard changes
              </Button>
            )}
            <Button
              loading={save.isPending}
              disabled={!dirty || busy}
              onClick={() => save.mutate(draft)}
            >
              Save budget
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
