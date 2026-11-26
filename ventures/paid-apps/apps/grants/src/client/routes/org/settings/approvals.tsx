// OWNER: approvals — who must approve before an application goes out: an ordered rule list (first
// match wins), a live "which rule applies?" preview, and out-of-office delegations.
// Route: /orgs/$orgId/settings/approvals (PUT /approval-policies needs admin+).
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Checkbox,
  EmptyState,
  ErrorMessage,
  Field,
  Input,
  Select,
  Spinner,
  toast,
} from "@client/components/ui";
import { api, formatDate, orgApi } from "@client/lib/api";
import { useMe } from "@client/lib/session";
import {
  APPROVAL_TIERS,
  APPROVER_ROLES,
  type ApprovalPolicyDto,
  type ApprovalRule,
  type ApprovalRuleInput,
  type ApprovalTier,
  type DelegationDto,
  describeRequire,
  describeWhen,
  MAX_APPROVAL_RULES,
  MAX_APPROVERS,
  MAX_DELEGATION_DAYS,
  ROLE_LABEL,
  requiredApprovals,
  selectApprovalRule,
} from "@shared/approvals";
import { FUNDER_TYPES, type FunderType, type MemberRole } from "@shared/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2, UserRoundCheck } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { MoneyInput, SwitchField } from "./form-bits";
import { ReadOnlyNotice, SavedHint, SettingsPage } from "./settings-nav";
import { hasRole, type OrgDetail } from "./use-org";

// ---------------------------------------------------------------------------------------------
// Model (pure, exported for tests)
// ---------------------------------------------------------------------------------------------

export interface MemberOption {
  userId: string;
  name: string | null;
  email: string;
  role: MemberRole;
}

/** A rule being edited: `key` is a stable React key, `id` is the saved id (if any). */
export interface DraftRule extends ApprovalRuleInput {
  key: string;
}

let keySeq = 0;
const nextKey = () => `r${++keySeq}`;

export const toDraft = (r: ApprovalRule): DraftRule => ({ ...r, key: nextKey() });

export function newDraftRule(): DraftRule {
  return {
    key: nextKey(),
    name: "New rule",
    when: {},
    require: { approvers: 2, roles: ["admin", "owner"], excludeAuthor: true },
  };
}

/** Move the rule at `index` by `delta` (-1 up, +1 down); out-of-range moves are no-ops. */
export function moveRule<T>(rules: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= rules.length || to < 0 || to >= rules.length) return [...rules];
  const next = [...rules];
  const [item] = next.splice(index, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

/** Client-side checks mirroring the server's zod schema (errors keyed by rule key). */
export function validateRules(rules: readonly DraftRule[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const r of rules) {
    const { when, require } = r;
    if (!r.name.trim()) errors[r.key] = "Give this rule a name.";
    else if (
      when.minAmountCents !== undefined &&
      when.maxAmountCents !== undefined &&
      when.minAmountCents > when.maxAmountCents
    ) {
      errors[r.key] = "The minimum amount is above the maximum.";
    } else if (!require.specificUserIds?.length && require.roles.length === 0) {
      errors[r.key] = "Pick at least one role that can approve.";
    } else if (
      require.specificUserIds?.length &&
      require.specificUserIds.length < require.approvers
    ) {
      errors[r.key] =
        `Pick at least ${require.approvers} people, or lower the number of approvals.`;
    }
  }
  return errors;
}

/** The PUT body: drafts without their React keys, empty optional fields dropped. */
export function toPolicyInput(rules: readonly DraftRule[]): { rules: ApprovalRuleInput[] } {
  return {
    rules: rules.map(({ key: _key, ...r }) => {
      const when: ApprovalRuleInput["when"] = {};
      if (r.when.minAmountCents !== undefined) when.minAmountCents = r.when.minAmountCents;
      if (r.when.maxAmountCents !== undefined) when.maxAmountCents = r.when.maxAmountCents;
      if (r.when.funderType) when.funderType = r.when.funderType;
      if (r.when.funderIds?.length) when.funderIds = r.when.funderIds;
      if (r.when.tier) when.tier = r.when.tier;
      const specific = r.require.specificUserIds?.filter(Boolean) ?? [];
      return {
        ...(r.id ? { id: r.id } : {}),
        name: r.name.trim(),
        when,
        require: {
          approvers: r.require.approvers,
          roles: r.require.roles,
          excludeAuthor: r.require.excludeAuthor,
          ...(specific.length ? { specificUserIds: specific } : {}),
        },
      };
    }),
  };
}

const TIER_LABEL: Record<ApprovalTier, string> = {
  one_click: "One-click review",
  full_review: "Full review",
};

const FUNDER_TYPE_LABEL: Record<FunderType, string> = {
  federal: "Federal",
  state: "State",
  local: "Local government",
  foundation: "Foundation",
  corporate: "Corporate",
  tribal: "Tribal",
  other: "Other",
};

// ---------------------------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------------------------

const keys = {
  policy: (orgId: string) => ["orgs", orgId, "approval-policies"] as const,
  delegations: (orgId: string) => ["orgs", orgId, "approval-policies", "delegations"] as const,
  members: (orgId: string) => ["orgs", orgId, "members"] as const,
};

function useMembers(orgId: string) {
  return useQuery({
    queryKey: keys.members(orgId),
    queryFn: () => api<{ items: MemberOption[] }>(orgApi(orgId, "/members")),
    enabled: !!orgId,
  });
}

// ---------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------

export function ApprovalSettingsPage() {
  return (
    <SettingsPage
      tab="approvals"
      title="Approvals"
      description="Decide who has to sign off before an application is submitted. The first rule that matches a grant applies."
    >
      {({ orgId, org }) => (
        <div className="space-y-6">
          <PolicyEditor orgId={orgId} org={org} />
          <Delegations orgId={orgId} org={org} />
        </div>
      )}
    </SettingsPage>
  );
}

function PolicyEditor({ orgId, org }: { orgId: string; org: OrgDetail }) {
  const canEdit = hasRole(org.role, "admin");
  const qc = useQueryClient();
  const policy = useQuery({
    queryKey: keys.policy(orgId),
    queryFn: () => api<ApprovalPolicyDto>(orgApi(orgId, "/approval-policies")),
  });
  const members = useMembers(orgId);
  const [rules, setRules] = useState<DraftRule[] | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (policy.data && rules === null) setRules(policy.data.rules.map(toDraft));
  }, [policy.data, rules]);

  const save = useMutation({
    mutationFn: (body: { rules: ApprovalRuleInput[] }) =>
      api<ApprovalPolicyDto>(orgApi(orgId, "/approval-policies"), { method: "PUT", body }),
    onSuccess: (data) => {
      qc.setQueryData(keys.policy(orgId), data);
      setRules(data.rules.map(toDraft));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (e) => toast.error("Couldn't save the approval rules", e),
  });

  if (policy.isPending || rules === null) {
    return policy.isError ? (
      <ErrorMessage error={policy.error} />
    ) : (
      <Spinner label="Loading rules" />
    );
  }
  const errors = validateRules(rules);
  const approvers = (members.data?.items ?? []).filter((m) => APPROVER_ROLES.includes(m.role));
  const update = (key: string, fn: (r: DraftRule) => DraftRule) =>
    setRules((rs) => (rs ?? []).map((r) => (r.key === key ? fn(r) : r)));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (Object.keys(errors).length > 0) return;
    save.mutate(toPolicyInput(rules));
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6" aria-label="Approval rules">
      {!canEdit && <ReadOnlyNotice />}
      <Card>
        <CardHeader>
          <CardTitle>Rules</CardTitle>
          <p className="text-sm text-neutral-500">
            Checked from top to bottom; the first one that matches wins. If none match, one person
            with reviewer access or above approves.
          </p>
        </CardHeader>
        <CardBody className="space-y-4">
          {rules.length === 0 ? (
            <EmptyState
              title="No rules yet"
              description="Every application needs one approval from a reviewer, editor, admin or owner."
            />
          ) : (
            <ol className="space-y-4">
              {rules.map((rule, i) => (
                <li key={rule.key}>
                  <RuleCard
                    rule={rule}
                    index={i}
                    count={rules.length}
                    approvers={approvers}
                    disabled={!canEdit}
                    error={errors[rule.key]}
                    onChange={(fn) => update(rule.key, fn)}
                    onMove={(d) => setRules((rs) => moveRule(rs ?? [], i, d))}
                    onRemove={() => setRules((rs) => (rs ?? []).filter((r) => r.key !== rule.key))}
                  />
                </li>
              ))}
            </ol>
          )}
          <li className="list-none rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-sm text-neutral-600">
            <span className="font-medium text-neutral-800">Default</span> — everything else:{" "}
            {policy.data ? describeRequire(policy.data.defaultRule.require) : null}
          </li>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRules((rs) => [...(rs ?? []), newDraftRule()])}
                disabled={rules.length >= MAX_APPROVAL_RULES}
              >
                <Plus className="h-4 w-4" aria-hidden /> Add rule
              </Button>
              <Button type="submit" disabled={save.isPending || Object.keys(errors).length > 0}>
                {save.isPending ? "Saving…" : "Save rules"}
              </Button>
              <SavedHint show={saved} />
            </div>
          )}
        </CardBody>
      </Card>
      <RulePreview
        rules={rules}
        twoPersonAboveCents={twoPersonThreshold(org)}
        names={nameMap(members.data?.items)}
      />
    </form>
  );
}

const nameMap = (items: MemberOption[] | undefined): Record<string, string> =>
  Object.fromEntries((items ?? []).map((m) => [m.userId, m.name || m.email]));

/** org_settings.twoPersonRuleAboveCents (safety rails), read defensively. */
function twoPersonThreshold(org: OrgDetail): number | null {
  const v: unknown = (org.settings as Record<string, unknown>).twoPersonRuleAboveCents;
  return typeof v === "number" ? v : null;
}

function RuleCard({
  rule,
  index,
  count,
  approvers,
  disabled,
  error,
  onChange,
  onMove,
  onRemove,
}: {
  rule: DraftRule;
  index: number;
  count: number;
  approvers: MemberOption[];
  disabled: boolean;
  error?: string;
  onChange: (fn: (r: DraftRule) => DraftRule) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const id = `rule-${rule.key}`;
  const setWhen = (patch: Partial<DraftRule["when"]>) =>
    onChange((r) => ({ ...r, when: { ...r.when, ...patch } }));
  const setRequire = (patch: Partial<DraftRule["require"]>) =>
    onChange((r) => ({ ...r, require: { ...r.require, ...patch } }));
  const specific = rule.require.specificUserIds ?? [];
  const usingSpecific = specific.length > 0;
  return (
    <fieldset
      className="rounded-lg border border-neutral-200 bg-white p-4"
      aria-label={`Rule ${index + 1}: ${rule.name}`}
      disabled={disabled}
    >
      <div className="flex flex-wrap items-start gap-3">
        <Badge tone="neutral">{index + 1}</Badge>
        <Field label="Rule name" htmlFor={`${id}-name`} className="min-w-48 flex-1">
          <Input
            id={`${id}-name`}
            value={rule.name}
            maxLength={80}
            onChange={(e) => onChange((r) => ({ ...r, name: e.target.value }))}
          />
        </Field>
        {!disabled && (
          <div className="flex gap-1 pt-6">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Move ${rule.name} up`}
              disabled={index === 0}
              onClick={() => onMove(-1)}
            >
              <ArrowUp className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Move ${rule.name} down`}
              disabled={index === count - 1}
              onClick={() => onMove(1)}
            >
              <ArrowDown className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Remove ${rule.name}`}
              onClick={onRemove}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-neutral-500">When</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Ask at least" htmlFor={`${id}-min`}>
          <MoneyInput
            id={`${id}-min`}
            cents={rule.when.minAmountCents ?? null}
            onChange={(c) => setWhen({ minAmountCents: c ?? undefined })}
            placeholder="Any"
          />
        </Field>
        <Field label="Ask at most" htmlFor={`${id}-max`}>
          <MoneyInput
            id={`${id}-max`}
            cents={rule.when.maxAmountCents ?? null}
            onChange={(c) => setWhen({ maxAmountCents: c ?? undefined })}
            placeholder="Any"
          />
        </Field>
        <Field label="Funder type" htmlFor={`${id}-funder`}>
          <Select
            id={`${id}-funder`}
            value={rule.when.funderType ?? ""}
            onChange={(e) =>
              setWhen({ funderType: (e.target.value || undefined) as FunderType | undefined })
            }
          >
            <option value="">Any funder</option>
            {FUNDER_TYPES.map((t) => (
              <option key={t} value={t}>
                {FUNDER_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Review tier" htmlFor={`${id}-tier`}>
          <Select
            id={`${id}-tier`}
            value={rule.when.tier ?? ""}
            onChange={(e) =>
              setWhen({ tier: (e.target.value || undefined) as ApprovalTier | undefined })
            }
          >
            <option value="">Any tier</option>
            {APPROVAL_TIERS.map((t) => (
              <option key={t} value={t}>
                {TIER_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-neutral-500">Require</p>
      <div className="mt-2 grid gap-4 lg:grid-cols-[10rem_minmax(0,1fr)]">
        <Field label="Approvals" htmlFor={`${id}-approvers`}>
          <Select
            id={`${id}-approvers`}
            value={String(rule.require.approvers)}
            onChange={(e) => setRequire({ approvers: Number(e.target.value) })}
          >
            {Array.from({ length: MAX_APPROVERS }, (_, n) => n + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "person" : "people"}
              </option>
            ))}
          </Select>
        </Field>
        <div className="space-y-3">
          <fieldset className="flex flex-wrap gap-4">
            <legend className="sr-only">Roles that can approve</legend>
            <span className="text-sm font-medium text-neutral-700" aria-hidden>
              From
            </span>
            {APPROVER_ROLES.map((role) => (
              <label
                key={role}
                htmlFor={`${id}-role-${role}`}
                className="flex items-center gap-2 text-sm text-neutral-700"
              >
                <Checkbox
                  id={`${id}-role-${role}`}
                  checked={rule.require.roles.includes(role)}
                  disabled={usingSpecific}
                  onChange={(e) =>
                    setRequire({
                      roles: e.target.checked
                        ? [...rule.require.roles, role]
                        : rule.require.roles.filter((r) => r !== role),
                    })
                  }
                />
                {ROLE_LABEL[role]}
              </label>
            ))}
          </fieldset>
          {approvers.length > 0 && (
            <details open={usingSpecific} className="text-sm">
              <summary className="cursor-pointer text-neutral-700">
                Only specific people {usingSpecific && `(${specific.length})`}
              </summary>
              <fieldset className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                <legend className="sr-only">Specific approvers</legend>
                {approvers.map((m) => (
                  <label
                    key={m.userId}
                    htmlFor={`${id}-user-${m.userId}`}
                    className="flex items-center gap-2 text-neutral-700"
                  >
                    <Checkbox
                      id={`${id}-user-${m.userId}`}
                      checked={specific.includes(m.userId)}
                      onChange={(e) =>
                        setRequire({
                          specificUserIds: e.target.checked
                            ? [...specific, m.userId]
                            : specific.filter((u) => u !== m.userId),
                        })
                      }
                    />
                    {m.name || m.email}
                  </label>
                ))}
              </fieldset>
              {usingSpecific && (
                <p className="mt-1 text-neutral-500">
                  Roles are ignored: only these people (or someone they delegate to) can approve.
                </p>
              )}
            </details>
          )}
          <SwitchField
            label="Not the author"
            description="The person who started the application, or edited its text, can't be one of the approvers."
            checked={rule.require.excludeAuthor}
            onChange={(v) => setRequire({ excludeAuthor: v })}
            disabled={disabled}
          />
        </div>
      </div>
      {error && (
        <p className="mt-3 text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** "Which rule applies to this grant?" against the rules as edited (unsaved changes included). */
export function RulePreview({
  rules,
  twoPersonAboveCents,
  names,
}: {
  rules: readonly ApprovalRuleInput[];
  twoPersonAboveCents: number | null;
  names?: Record<string, string>;
}) {
  const [amount, setAmount] = useState<number | null>(7_500_000);
  const [funderType, setFunderType] = useState<FunderType | "">("foundation");
  const [tier, setTier] = useState<ApprovalTier>("one_click");
  const asRules: ApprovalRule[] = useMemo(
    () => rules.map((r, i) => ({ ...r, id: r.id ?? `unsaved-${i}` })),
    [rules],
  );
  const { rule, index } = selectApprovalRule(asRules, {
    requestedAmountCents: amount,
    funderType: funderType || null,
    funderId: null,
    tier,
  });
  const twoPerson =
    twoPersonAboveCents !== null && (amount === null || amount > twoPersonAboveCents);
  const needed = requiredApprovals(rule, twoPerson);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Try it</CardTitle>
        <p className="text-sm text-neutral-500">See which rule applies to an example grant.</p>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Example ask" htmlFor="preview-amount" hint="Leave empty for an unknown ask">
            <MoneyInput id="preview-amount" cents={amount} onChange={setAmount} />
          </Field>
          <Field label="Funder type" htmlFor="preview-funder">
            <Select
              id="preview-funder"
              value={funderType}
              onChange={(e) => setFunderType(e.target.value as FunderType | "")}
            >
              <option value="">Unknown</option>
              {FUNDER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FUNDER_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Review tier" htmlFor="preview-tier">
            <Select
              id="preview-tier"
              value={tier}
              onChange={(e) => setTier(e.target.value as ApprovalTier)}
            >
              {APPROVAL_TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <output
          aria-label="Rule that applies"
          className="block rounded-lg bg-neutral-50 px-4 py-3 text-sm ring-1 ring-neutral-200 ring-inset"
        >
          <span className="font-medium text-neutral-900">
            {index >= 0 ? `Rule ${index + 1}: ${rule.name}` : "Default rule"}
          </span>
          <span className="text-neutral-500"> ({describeWhen(rule.when)})</span>
          <br />
          Needs {needed} approval{needed === 1 ? "" : "s"}: {describeRequire(rule.require, names)}
          {twoPerson && needed > rule.require.approvers && (
            <span className="block text-warning-800">
              Raised to 2 by your two-person rule (asks above the threshold need two people).
            </span>
          )}
        </output>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Delegations
// ---------------------------------------------------------------------------------------------

const inDaysIso = (days: number) => {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
};

function Delegations({ orgId, org }: { orgId: string; org: OrgDetail }) {
  const qc = useQueryClient();
  const me = useMe();
  const myId = me.data?.user.id ?? "";
  const isAdmin = hasRole(org.role, "admin");
  const canDelegate = hasRole(org.role, "reviewer");
  const members = useMembers(orgId);
  const list = useQuery({
    queryKey: keys.delegations(orgId),
    queryFn: () => api<{ items: DelegationDto[] }>(orgApi(orgId, "/approval-policies/delegations")),
  });
  const approvers = (members.data?.items ?? []).filter((m) => APPROVER_ROLES.includes(m.role));
  const [fromUserId, setFrom] = useState("");
  const [toUserId, setTo] = useState("");
  const [until, setUntil] = useState(inDaysIso(7));
  const from = fromUserId || myId;

  const create = useMutation({
    mutationFn: () =>
      api<DelegationDto>(orgApi(orgId, "/approval-policies/delegations"), {
        method: "POST",
        // End of the chosen day, local time.
        body: { fromUserId: from, toUserId, until: new Date(`${until}T23:59:59`).toISOString() },
      }),
    onSuccess: () => {
      toast.success("Delegation saved");
      setTo("");
      return qc.invalidateQueries({ queryKey: keys.delegations(orgId) });
    },
    onError: (e) => toast.error("Couldn't save the delegation", e),
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      api(orgApi(orgId, `/approval-policies/delegations/${encodeURIComponent(id)}`), {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.delegations(orgId) }),
    onError: (e) => toast.error("Couldn't end the delegation", e),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Out of office</CardTitle>
        <p className="text-sm text-neutral-500">
          Away for a while? Let a colleague approve in your place until a date (up to{" "}
          {MAX_DELEGATION_DAYS} days). Their approval then counts as yours.
        </p>
      </CardHeader>
      <CardBody className="space-y-4">
        {list.isPending ? (
          <Spinner label="Loading delegations" />
        ) : list.isError ? (
          <ErrorMessage error={list.error} />
        ) : list.data.items.length === 0 ? (
          <p className="text-sm text-neutral-500">No one is delegating right now.</p>
        ) : (
          <ul className="divide-y divide-neutral-100" aria-label="Active delegations">
            {list.data.items.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <UserRoundCheck className="h-4 w-4 text-neutral-400" aria-hidden />
                <span className="flex-1">
                  <strong>{d.toName}</strong> approves for <strong>{d.fromName}</strong> until{" "}
                  {formatDate(d.until)}
                </span>
                {(isAdmin || d.fromUserId === myId || d.toUserId === myId) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => revoke.mutate(d.id)}
                    disabled={revoke.isPending}
                    aria-label={`End delegation from ${d.fromName} to ${d.toName}`}
                  >
                    End
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canDelegate && (
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_10rem_auto] sm:items-end"
            aria-label="New delegation"
            onSubmit={(e) => {
              e.preventDefault();
              if (from && toUserId) create.mutate();
            }}
          >
            <Field label="Who is away" htmlFor="dlg-from">
              <Select
                id="dlg-from"
                value={from}
                disabled={!isAdmin}
                onChange={(e) => setFrom(e.target.value)}
              >
                {approvers.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.userId === myId ? `Me (${m.name || m.email})` : m.name || m.email}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Approves in their place" htmlFor="dlg-to">
              <Select id="dlg-to" value={toUserId} onChange={(e) => setTo(e.target.value)}>
                <option value="">Choose a person</option>
                {approvers
                  .filter((m) => m.userId !== from)
                  .map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name || m.email}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Until" htmlFor="dlg-until">
              <Input
                id="dlg-until"
                type="date"
                value={until}
                min={inDaysIso(0)}
                max={inDaysIso(MAX_DELEGATION_DAYS - 1)}
                onChange={(e) => setUntil(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={!toUserId || create.isPending}>
              Delegate
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
