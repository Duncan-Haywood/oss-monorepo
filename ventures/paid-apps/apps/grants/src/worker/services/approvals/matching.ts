// Pure approval counting: which recorded approvals count toward a rule, allowing for delegation.
//
// Each approval is by one person; it can count as that person, or as someone who delegated to them
// (active at the time of the approval). Every person and every identity counts at most once, so
// "A approved, and B approved as A's delegate" is one approval, not two. The best assignment is a
// maximum bipartite matching (approvals x identities), found with augmenting paths; approvals are
// tried oldest first, so the earliest approvers are the ones shown.
import { type ApprovalHave, type ApprovalRule, describeMissing } from "@shared/approvals";
import { type MemberRole, ROLE_RANK } from "@shared/enums";

export interface MemberInfo {
  userId: string;
  name: string;
  role: MemberRole;
}

export interface RecordedApproval {
  userId: string;
  at: Date;
}

export interface DelegationWindow {
  fromUserId: string;
  toUserId: string;
  createdAt: Date;
  until: Date;
  revokedAt: Date | null;
}

export interface CountInput {
  rule: ApprovalRule;
  needed: number;
  /** Current members of the org (approvals by people no longer in the org do not count). */
  members: ReadonlyMap<string, MemberInfo>;
  approvals: readonly RecordedApproval[];
  delegations: readonly DelegationWindow[];
  /** Who started the application or wrote any of its versions. */
  authors: ReadonlySet<string>;
}

export interface CountResult {
  satisfied: boolean;
  needed: number;
  have: ApprovalHave[];
  missing: number;
  missingDescription: string;
  /** Identities (user ids) whose approval would still count, for notifications and the UI. */
  openIdentities: string[];
}

export function delegationActive(d: DelegationWindow, at: Date): boolean {
  const t = at.getTime();
  const end = Math.min(d.until.getTime(), d.revokedAt?.getTime() ?? Number.POSITIVE_INFINITY);
  return d.createdAt.getTime() <= t && t < end;
}

/** Whether `identity`'s approval satisfies the rule's who-can-approve terms. */
export function identityEligible(
  rule: ApprovalRule,
  identity: string,
  members: ReadonlyMap<string, MemberInfo>,
  authors: ReadonlySet<string>,
): boolean {
  const m = members.get(identity);
  if (!m || ROLE_RANK[m.role] < ROLE_RANK.reviewer) return false;
  if (rule.require.excludeAuthor && authors.has(identity)) return false;
  const specific = rule.require.specificUserIds;
  if (specific?.length) return specific.includes(identity);
  return rule.require.roles.includes(m.role);
}

/** Identities a person's approval at `at` may count as (themselves and active delegators). */
export function candidateIdentities(
  input: Pick<CountInput, "rule" | "members" | "delegations" | "authors">,
  approval: RecordedApproval,
): string[] {
  const { rule, members, authors } = input;
  const person = members.get(approval.userId);
  // The approver must still be in the org with approval rights, and (with excludeAuthor) must not
  // be an author even when standing in for someone else.
  if (!person || ROLE_RANK[person.role] < ROLE_RANK.reviewer) return [];
  if (rule.require.excludeAuthor && authors.has(approval.userId)) return [];
  const out: string[] = [];
  if (identityEligible(rule, approval.userId, members, authors)) out.push(approval.userId);
  for (const d of input.delegations) {
    if (d.toUserId !== approval.userId || d.fromUserId === approval.userId) continue;
    if (!delegationActive(d, approval.at)) continue;
    if (out.includes(d.fromUserId)) continue;
    if (identityEligible(rule, d.fromUserId, members, authors)) out.push(d.fromUserId);
  }
  return out;
}

/** Earliest approval per person, oldest first. */
function distinctApprovals(approvals: readonly RecordedApproval[]): RecordedApproval[] {
  const first = new Map<string, RecordedApproval>();
  for (const a of [...approvals].sort((x, y) => x.at.getTime() - y.at.getTime())) {
    if (!first.has(a.userId)) first.set(a.userId, a);
  }
  return [...first.values()];
}

/** Maximum matching of approvals to identities: approval index -> identity. */
function match(candidates: string[][]): Map<number, string> {
  const owner = new Map<string, number>(); // identity -> approval index
  const tryAssign = (i: number, seen: Set<string>): boolean => {
    for (const id of candidates[i] ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      const holder = owner.get(id);
      if (holder === undefined || tryAssign(holder, seen)) {
        owner.set(id, i);
        return true;
      }
    }
    return false;
  };
  for (let i = 0; i < candidates.length; i++) tryAssign(i, new Set());
  const out = new Map<number, string>();
  for (const [id, i] of owner) out.set(i, id);
  return out;
}

export function countApprovals(input: CountInput): CountResult {
  const approvals = distinctApprovals(input.approvals);
  const assignment = match(approvals.map((a) => candidateIdentities(input, a)));
  const nameOf = (id: string) => input.members.get(id)?.name || "A former member";
  const matched = approvals
    .map((a, i) => ({ a, identity: assignment.get(i) }))
    .filter((x): x is { a: RecordedApproval; identity: string } => x.identity !== undefined);
  const have: ApprovalHave[] = matched.slice(0, input.needed).map(({ a, identity }) => ({
    userId: a.userId,
    name: nameOf(a.userId),
    ...(identity !== a.userId ? { onBehalfOf: { userId: identity, name: nameOf(identity) } } : {}),
  }));
  const usedIdentities = new Set(matched.map((m) => m.identity));
  const approvedPeople = new Set(approvals.map((a) => a.userId));
  const openIdentities = [...input.members.keys()].filter(
    (id) =>
      !usedIdentities.has(id) &&
      !approvedPeople.has(id) &&
      identityEligible(input.rule, id, input.members, input.authors),
  );
  const missing = Math.max(0, input.needed - matched.length);
  const specific = input.rule.require.specificUserIds;
  return {
    satisfied: missing === 0,
    needed: input.needed,
    have,
    missing,
    missingDescription: describeMissing({
      missing,
      rule: input.rule,
      specificNames: specific?.length
        ? specific.filter((id) => !usedIdentities.has(id)).map(nameOf)
        : undefined,
    }),
    openIdentities,
  };
}

/** Whether adding `approval` raises the number of approvals that count. */
export function approvalWouldCount(input: CountInput, approval: RecordedApproval): boolean {
  const before = countApprovals({ ...input, needed: Number.MAX_SAFE_INTEGER });
  const after = countApprovals({
    ...input,
    needed: Number.MAX_SAFE_INTEGER,
    approvals: [...input.approvals, approval],
  });
  return after.have.length > before.have.length;
}
