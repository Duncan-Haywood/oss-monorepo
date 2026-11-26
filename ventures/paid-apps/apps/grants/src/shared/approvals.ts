// Approval policies (OWNER: approvals): WHO must approve an application before it is submitted, and
// how many of them. Shared by the worker (services/approvals) and the settings UI (live preview), so
// both pick the same rule for the same grant. Pure: no I/O here.
//
// A policy is an ordered list of rules; the first rule whose `when` matches wins, and when none
// matches DEFAULT_APPROVAL_RULE applies (one approver, reviewer or above). The org's two-person rule
// (org_settings.twoPersonRuleAboveCents, services/review/safety-rails) is applied on top: when both
// apply, the stricter requirement wins.
import { z } from "zod";
import { FUNDER_TYPES, type FunderType, MEMBER_ROLES, type MemberRole, ROLE_RANK } from "./enums";

/** Roles that may approve at all (viewers never can: the decision route needs reviewer+). */
export const APPROVER_ROLES = MEMBER_ROLES.filter((r) => ROLE_RANK[r] >= ROLE_RANK.reviewer);
/** Human review tiers a rule can target ("auto" applications are never human-approved). */
export const APPROVAL_TIERS = ["one_click", "full_review"] as const;
export type ApprovalTier = (typeof APPROVAL_TIERS)[number];

export const MAX_APPROVAL_RULES = 20;
export const MAX_APPROVERS = 3;
/** Longest delegation an approver can set up in one go. */
export const MAX_DELEGATION_DAYS = 90;

const RuleId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "Use letters, digits, - or _");
const UserId = z.string().min(1).max(64);

export const ApprovalRuleWhen = z
  .object({
    minAmountCents: z.number().int().min(0).max(1_000_000_000_00).optional(),
    maxAmountCents: z.number().int().min(0).max(1_000_000_000_00).optional(),
    funderType: z.enum(FUNDER_TYPES).optional(),
    funderIds: z.array(z.string().min(1).max(64)).max(50).optional(),
    tier: z.enum(APPROVAL_TIERS).optional(),
  })
  .refine(
    (w) =>
      w.minAmountCents === undefined ||
      w.maxAmountCents === undefined ||
      w.minAmountCents <= w.maxAmountCents,
    { message: "The minimum amount must not be above the maximum", path: ["maxAmountCents"] },
  );
export type ApprovalRuleWhen = z.infer<typeof ApprovalRuleWhen>;

export const ApprovalRuleRequire = z
  .object({
    approvers: z.number().int().min(1).max(MAX_APPROVERS),
    roles: z
      .array(z.enum(APPROVER_ROLES as [MemberRole, ...MemberRole[]]))
      .min(1)
      .max(APPROVER_ROLES.length),
    /** When set, only these people (or their delegates) can approve; `roles` is then ignored. */
    specificUserIds: z.array(UserId).max(20).optional(),
    /** The person who started the application or edited its text cannot be one of the approvers. */
    excludeAuthor: z.boolean(),
  })
  .refine((r) => !r.specificUserIds?.length || r.specificUserIds.length >= r.approvers, {
    message: "Pick at least as many specific approvers as approvals required",
    path: ["specificUserIds"],
  });
export type ApprovalRuleRequire = z.infer<typeof ApprovalRuleRequire>;

export const ApprovalRuleInput = z.object({
  id: RuleId.optional(),
  name: z.string().trim().min(1).max(80),
  when: ApprovalRuleWhen,
  require: ApprovalRuleRequire,
});
export type ApprovalRuleInput = z.infer<typeof ApprovalRuleInput>;

export const ApprovalPolicyInput = z.object({
  rules: z
    .array(ApprovalRuleInput)
    .max(MAX_APPROVAL_RULES)
    .refine(
      (rules) =>
        new Set(rules.map((r) => r.id).filter(Boolean)).size === rules.filter((r) => r.id).length,
      { message: "Rule ids must be unique" },
    ),
});
export type ApprovalPolicyInput = z.infer<typeof ApprovalPolicyInput>;

export interface ApprovalRule {
  id: string;
  name: string;
  when: ApprovalRuleWhen;
  require: ApprovalRuleRequire;
}

export const DEFAULT_RULE_ID = "default";
export const DEFAULT_APPROVAL_RULE: ApprovalRule = {
  id: DEFAULT_RULE_ID,
  name: "Default",
  when: {},
  require: { approvers: 1, roles: [...APPROVER_ROLES], excludeAuthor: false },
};

export const DelegationInput = z.object({
  fromUserId: UserId,
  toUserId: UserId,
  /** ISO timestamp; must be in the future and at most MAX_DELEGATION_DAYS away. */
  until: z.iso.datetime({ offset: true }),
});
export type DelegationInput = z.infer<typeof DelegationInput>;

// ---------------------------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------------------------

export interface ApprovalPolicyDto {
  rules: ApprovalRule[];
  defaultRule: ApprovalRule;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface ApprovalHave {
  userId: string;
  name: string;
  /** Set when this person approved as someone's delegate (that person's id and name). */
  onBehalfOf?: { userId: string; name: string };
}

export interface ApprovalStatusDto {
  satisfied: boolean;
  /** Distinct approvals required (the stricter of the rule and the two-person rule). */
  needed: number;
  /** Approvals that count toward `needed` (at most `needed`), oldest first. */
  have: ApprovalHave[];
  /** "" when satisfied, otherwise e.g. "Waiting for an admin". */
  missingDescription: string;
  rule: { id: string; name: string };
  twoPersonRule: boolean;
  versionId: string;
}

export interface DelegationDto {
  id: string;
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  until: string;
  createdBy: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------------------------
// Rule matching (pure)
// ---------------------------------------------------------------------------------------------

/** What a rule's `when` is matched against. */
export interface ApprovalSubject {
  /** null = unknown ask: treated as above every threshold (fail-safe, see ruleMatches). */
  requestedAmountCents: number | null;
  funderType: FunderType | null;
  funderId: string | null;
  tier: string | null;
}

/**
 * Whether `when` matches. An empty `when` matches everything. An unknown ask counts as larger than
 * any amount: it meets every `minAmountCents` and fails every `maxAmountCents`, so a grant whose
 * amount nobody entered falls under the strictest amount rules, never the "small grants" ones.
 */
export function ruleMatches(when: ApprovalRuleWhen, s: ApprovalSubject): boolean {
  const amount = s.requestedAmountCents;
  if (when.minAmountCents !== undefined && amount !== null && amount < when.minAmountCents) {
    return false;
  }
  if (when.maxAmountCents !== undefined && (amount === null || amount > when.maxAmountCents)) {
    return false;
  }
  if (when.funderType !== undefined && s.funderType !== when.funderType) return false;
  if (when.funderIds?.length && (!s.funderId || !when.funderIds.includes(s.funderId))) {
    return false;
  }
  if (when.tier !== undefined && s.tier !== when.tier) return false;
  return true;
}

/** The first matching rule (and its index), or the default rule (index -1). */
export function selectApprovalRule(
  rules: readonly ApprovalRule[],
  subject: ApprovalSubject,
): { rule: ApprovalRule; index: number } {
  const index = rules.findIndex((r) => ruleMatches(r.when, subject));
  const rule = index >= 0 ? rules[index] : undefined;
  return rule ? { rule, index } : { rule: DEFAULT_APPROVAL_RULE, index: -1 };
}

/** Distinct approvals needed: the rule's count, raised to 2 when the two-person rule applies. */
export function requiredApprovals(rule: ApprovalRule, twoPersonRule: boolean): number {
  return Math.max(rule.require.approvers, twoPersonRule ? 2 : 1);
}

// ---------------------------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------------------------

export const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "owner",
  admin: "admin",
  editor: "editor",
  reviewer: "reviewer",
  viewer: "viewer",
};

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

/** "reviewer or above", "admin or above", "admin", "editor or owner". */
export function rolesPhrase(roles: readonly MemberRole[]): string {
  const set = [...new Set(roles)].sort((a, b) => ROLE_RANK[a] - ROLE_RANK[b]);
  const lowest = set[0];
  if (!lowest) return "approver";
  const atOrAbove = APPROVER_ROLES.filter((r) => ROLE_RANK[r] >= ROLE_RANK[lowest]);
  if (set.length === atOrAbove.length && set.length > 1 && lowest !== "admin") {
    return `${ROLE_LABEL[lowest]} or above`;
  }
  if (set.length === 2 && set.includes("admin") && set.includes("owner")) return "admin";
  if (set.length === 1) return ROLE_LABEL[lowest];
  const labels = set.map((r) => ROLE_LABEL[r]);
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

/** "an admin", "2 more admins", "Rosa or Ken", "1 more reviewer or above who didn't write the draft". */
export function describeMissing(opts: {
  missing: number;
  rule: ApprovalRule;
  /** Display names of the specific approvers who have not approved yet. */
  specificNames?: string[];
}): string {
  const { missing, rule } = opts;
  if (missing <= 0) return "";
  const author = rule.require.excludeAuthor ? " who didn't write the draft" : "";
  if (rule.require.specificUserIds?.length) {
    const names = opts.specificNames ?? [];
    const who =
      names.length === 0
        ? "a named approver"
        : names.length === 1
          ? names[0]
          : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
    return missing === 1
      ? `Waiting for ${who}${author}`
      : `Waiting for ${missing} of: ${names.join(", ")}${author}`;
  }
  const phrase = rolesPhrase(rule.require.roles);
  if (missing === 1) return `Waiting for ${article(phrase)} ${phrase}${author}`;
  const plural = phrase.endsWith(" or above")
    ? `${phrase.replace(" or above", "s")} or above`
    : `${phrase}s`;
  return `Waiting for ${missing} more ${plural}${author}`;
}

/** "Approvals: 1 of 2". */
export const approvalCountLabel = (have: number, needed: number) =>
  `${Math.min(have, needed)} of ${needed} approval${needed === 1 ? "" : "s"}`;

/** One-line summary of a rule's condition for lists and the preview ("$50,000+ · federal"). */
export function describeWhen(when: ApprovalRuleWhen, funderNames?: Record<string, string>): string {
  const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const parts: string[] = [];
  if (when.minAmountCents !== undefined && when.maxAmountCents !== undefined) {
    parts.push(`${usd(when.minAmountCents)}–${usd(when.maxAmountCents)}`);
  } else if (when.minAmountCents !== undefined) {
    parts.push(`${usd(when.minAmountCents)} or more`);
  } else if (when.maxAmountCents !== undefined) {
    parts.push(`up to ${usd(when.maxAmountCents)}`);
  }
  if (when.funderType) parts.push(`${when.funderType} funders`);
  if (when.funderIds?.length) {
    const names = when.funderIds.map((id) => funderNames?.[id] ?? id);
    parts.push(names.length === 1 ? `funder ${names[0]}` : `${names.length} funders`);
  }
  if (when.tier) parts.push(when.tier === "full_review" ? "full review" : "one-click review");
  return parts.length ? parts.join(" · ") : "Every application";
}

/** "2 approvals from admin or above, not the author". */
export function describeRequire(req: ApprovalRuleRequire, names?: Record<string, string>): string {
  const n = `${req.approvers} approval${req.approvers === 1 ? "" : "s"}`;
  const who = req.specificUserIds?.length
    ? `from ${req.specificUserIds.map((id) => names?.[id] ?? "a named person").join(", ")}`
    : `from ${rolesPhrase(req.roles)}`;
  return `${n} ${who}${req.excludeAuthor ? ", not the author" : ""}`;
}
