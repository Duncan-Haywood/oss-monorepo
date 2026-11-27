// Written security policies, one per NIST SP 800-171 family. Rows are tenant-scoped; every write is
// audited (without the policy text). The starter text, review dates and documents are pure, in
// @shared/security-policies.
//
// Lifecycle: a policy starts as a draft (version 1). Approving it (admins) stores the exact text in
// security_policy_event and sets the review date. Editing the title or text of an approved policy
// starts the next version as a draft; the last approved text stays in force (and downloadable)
// until the new one is approved. "Reviewed, no changes" (admins) records a review of the approved
// version and moves the review date without a new version.

import type { FamilyCode } from "@shared/controls";
import { FAMILIES } from "@shared/controls";
import {
  addMonths,
  DEFAULT_REVIEW_MONTHS,
  defaultPolicyTitle,
  familyRequirements,
  isPolicyFamily,
  POLICY_FAMILIES,
  type PolicyDocumentInput,
  policyTemplate,
  type ReviewState,
  reviewState,
} from "@shared/security-policies";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { AppContext } from "../../context";
import { policyProcedureDraft, securityPolicy, securityPolicyEvent } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../audit";
import { recordsFor } from "../controls";
import { listProcedureDrafts } from "../drafting/procedure";
import { getOrg, isMember, listMembers } from "../orgs";

export type PolicyRow = typeof securityPolicy.$inferSelect;

export function requireFamily(family: string): FamilyCode {
  if (!isPolicyFamily(family)) throw notFound("Policy family");
  return family;
}

const today = (ctx: AppContext) => ctx.now().toISOString().slice(0, 10);

async function memberNames(ctx: AppContext, orgId: string) {
  return new Map((await listMembers(ctx, orgId)).map((m) => [m.userId, m.name]));
}

async function findPolicy(ctx: AppContext, orgId: string, family: FamilyCode) {
  return ctx.db
    .select()
    .from(securityPolicy)
    .where(and(eq(securityPolicy.orgId, orgId), eq(securityPolicy.family, family)))
    .get();
}

export interface PolicySummary {
  family: FamilyCode;
  name: string;
  requirements: number;
  policy: {
    id: string;
    title: string;
    status: PolicyRow["status"];
    version: number;
    ownerUserId: string | null;
    ownerName: string | null;
    approvedOn: string | null;
    reviewDue: string | null;
    reviewMonths: number;
    updatedAt: Date;
  } | null;
  review: ReviewState;
}

export interface PolicyList {
  items: PolicySummary[];
  counts: {
    total: number;
    written: number;
    approved: number;
    /** Approved at least once (a version is in force), including ones being revised. */
    inForce: number;
    dueSoon: number;
    overdue: number;
  };
}

/** One row per family, written or not, with where its review stands today. */
export async function listPolicies(ctx: AppContext, orgId: string): Promise<PolicyList> {
  const [rows, names] = await Promise.all([
    ctx.db.select().from(securityPolicy).where(eq(securityPolicy.orgId, orgId)).all(),
    memberNames(ctx, orgId),
  ]);
  const byFamily = new Map(rows.map((r) => [r.family, r]));
  const now = today(ctx);
  const items = POLICY_FAMILIES.map((family): PolicySummary => {
    const r = byFamily.get(family);
    return {
      family,
      name: FAMILIES[family],
      requirements: familyRequirements(family).length,
      policy: r
        ? {
            id: r.id,
            title: r.title,
            status: r.status,
            version: r.version,
            ownerUserId: r.ownerUserId,
            ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
            approvedOn: r.approvedOn,
            reviewDue: r.reviewDue,
            reviewMonths: r.reviewMonths,
            updatedAt: r.updatedAt,
          }
        : null,
      review: reviewState(r ?? null, now),
    };
  });
  return {
    items,
    counts: {
      total: items.length,
      written: rows.length,
      approved: rows.filter((r) => r.status === "approved").length,
      inForce: rows.filter((r) => r.reviewDue).length,
      dueSoon: items.filter((i) => i.review === "due_soon").length,
      overdue: items.filter((i) => i.review === "overdue").length,
    },
  };
}

/**
 * Every policy with a version in force and its next review date, in family order, for the
 * calendar file. Only the family's fixed name leaves: never the title, text or owner.
 */
export async function policyReviewDates(ctx: AppContext, orgId: string) {
  const rows = await ctx.db
    .select({ family: securityPolicy.family, reviewDue: securityPolicy.reviewDue })
    .from(securityPolicy)
    .where(and(eq(securityPolicy.orgId, orgId), isNotNull(securityPolicy.reviewDue)))
    .all();
  const due = new Map(rows.map((r) => [r.family, r.reviewDue]));
  return POLICY_FAMILIES.flatMap((family) => {
    const reviewDue = due.get(family);
    return reviewDue ? [{ family, familyName: FAMILIES[family], reviewDue }] : [];
  });
}

/** The starter text for a family, filled with this org's names and accepted statements. */
async function templateFor(
  ctx: AppContext,
  orgId: string,
  family: FamilyCode,
  ownerUserId: string | null,
  reviewMonths: number,
) {
  const [{ org, profile }, records, names] = await Promise.all([
    getOrg(ctx, orgId),
    recordsFor(ctx, orgId),
    memberNames(ctx, orgId),
  ]);
  return policyTemplate(family, {
    orgName: profile.legalName.trim() || org.name,
    systemName: profile.systemName,
    ownerName: ownerUserId ? (names.get(ownerUserId) ?? null) : null,
    reviewMonths,
    // Only accepted statements: an unreviewed AI draft never enters a policy.
    statements: new Map(
      records.filter((r) => r.statement.trim()).map((r) => [r.controlId, r.statement]),
    ),
  });
}

export async function getPolicy(ctx: AppContext, orgId: string, family: FamilyCode) {
  const [row, names] = await Promise.all([findPolicy(ctx, orgId, family), memberNames(ctx, orgId)]);
  const events = row
    ? await ctx.db
        .select({
          id: securityPolicyEvent.id,
          kind: securityPolicyEvent.kind,
          version: securityPolicyEvent.version,
          title: securityPolicyEvent.title,
          day: securityPolicyEvent.day,
          actorUserId: securityPolicyEvent.actorUserId,
        })
        .from(securityPolicyEvent)
        .where(and(eq(securityPolicyEvent.orgId, orgId), eq(securityPolicyEvent.policyId, row.id)))
        .orderBy(asc(securityPolicyEvent.createdAt))
        .all()
    : [];
  const [template, procedureDrafts] = await Promise.all([
    templateFor(
      ctx,
      orgId,
      family,
      row?.ownerUserId ?? null,
      row?.reviewMonths ?? DEFAULT_REVIEW_MONTHS,
    ),
    listProcedureDrafts(ctx, orgId, family),
  ]);
  return {
    family,
    name: FAMILIES[family],
    requirements: familyRequirements(family).map((c) => ({
      id: c.id,
      nistId: c.nistIds[0] ?? c.ref,
      text: c.text,
    })),
    policy: row
      ? {
          ...row,
          ownerName: row.ownerUserId ? (names.get(row.ownerUserId) ?? null) : null,
          approvedByName: row.approvedBy ? (names.get(row.approvedBy) ?? null) : null,
        }
      : null,
    review: reviewState(row ?? null, today(ctx)),
    history: events.map((e) => ({
      ...e,
      actorName: e.actorUserId ? (names.get(e.actorUserId) ?? null) : null,
    })),
    template,
    defaultTitle: defaultPolicyTitle(family),
    /** AI-drafted procedures not yet in the saved text (unreviewed; never part of the policy). */
    procedureDrafts,
  };
}

export interface PolicyInput {
  title?: string;
  body?: string;
  ownerUserId?: string | null;
  reviewMonths?: number;
}

/**
 * Create or edit a family's policy. A new policy without a body starts from the template. Changing
 * the title or text of an approved policy starts the next version as a draft; the owner and the
 * review interval are settings and change no version (a new interval applies from the next approval
 * or review).
 */
export async function savePolicy(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  family: FamilyCode,
  input: PolicyInput,
) {
  if (input.ownerUserId && !(await isMember(ctx, orgId, input.ownerUserId)))
    throw badRequest("The policy owner must be a member of this organization");
  const existing = await findPolicy(ctx, orgId, family);
  if (!existing) {
    const reviewMonths = input.reviewMonths ?? DEFAULT_REVIEW_MONTHS;
    const ownerUserId = input.ownerUserId ?? null;
    const body =
      input.body?.trim() || (await templateFor(ctx, orgId, family, ownerUserId, reviewMonths));
    const id = newId("pol");
    await ctx.db.insert(securityPolicy).values({
      id,
      orgId,
      family,
      title: input.title?.trim() || defaultPolicyTitle(family),
      body,
      ownerUserId,
      reviewMonths,
    });
    await audit(ctx, {
      orgId,
      actorUserId,
      action: "policy.create",
      targetType: "security_policy",
      targetId: family,
    });
    return getPolicy(ctx, orgId, family);
  }
  const set: Partial<typeof securityPolicy.$inferInsert> = {};
  const title = input.title?.trim();
  if (input.body !== undefined && !input.body.trim()) throw badRequest("The policy text is empty");
  const textChanged =
    (title !== undefined && title !== "" && title !== existing.title) ||
    (input.body !== undefined && input.body !== existing.body);
  if (title) set.title = title;
  if (input.body !== undefined) set.body = input.body;
  if (input.ownerUserId !== undefined) set.ownerUserId = input.ownerUserId;
  if (input.reviewMonths !== undefined) set.reviewMonths = input.reviewMonths;
  if (textChanged && existing.status === "approved") {
    set.status = "draft";
    set.version = existing.version + 1;
  }
  if (!Object.keys(set).length) return getPolicy(ctx, orgId, family);
  await ctx.db
    .update(securityPolicy)
    .set(set)
    .where(and(eq(securityPolicy.orgId, orgId), eq(securityPolicy.id, existing.id)));
  await audit(ctx, {
    orgId,
    actorUserId,
    action: set.status === "draft" ? "policy.revise" : "policy.update",
    targetType: "security_policy",
    targetId: family,
  });
  return getPolicy(ctx, orgId, family);
}

/** Approve the current draft: keep the exact text, set the review date. Admins only (route). */
export async function approvePolicy(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  family: FamilyCode,
) {
  const p = await findPolicy(ctx, orgId, family);
  if (!p) throw notFound("Policy");
  if (p.status === "approved")
    throw conflict(
      `Version ${p.version} is already approved. To confirm it is still right, mark it reviewed.`,
    );
  const on = today(ctx);
  await ctx.db.batch([
    ctx.db.insert(securityPolicyEvent).values({
      id: newId("pev"),
      orgId,
      policyId: p.id,
      kind: "approved",
      version: p.version,
      title: p.title,
      body: p.body,
      day: on,
      actorUserId,
      createdAt: ctx.now(),
    }),
    ctx.db
      .update(securityPolicy)
      .set({
        status: "approved",
        approvedOn: on,
        approvedBy: actorUserId,
        reviewDue: addMonths(on, p.reviewMonths),
      })
      .where(and(eq(securityPolicy.orgId, orgId), eq(securityPolicy.id, p.id))),
  ]);
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "policy.approve",
    targetType: "security_policy",
    targetId: `${family}:v${p.version}`,
  });
  return getPolicy(ctx, orgId, family);
}

/**
 * Record a review of the version in force with no changes: the review date moves on. Allowed while
 * a revision is being drafted too, since the approved version is the one in force.
 */
export async function reviewPolicy(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  family: FamilyCode,
) {
  const p = await findPolicy(ctx, orgId, family);
  if (!p) throw notFound("Policy");
  if (!p.reviewDue)
    throw conflict("Approve the policy first; a review applies to an approved version.");
  const last = await lastApproved(ctx, orgId, p.id);
  if (!last) throw conflict("No approved version to review.");
  const on = today(ctx);
  await ctx.db.batch([
    ctx.db.insert(securityPolicyEvent).values({
      id: newId("pev"),
      orgId,
      policyId: p.id,
      kind: "reviewed",
      version: last.version,
      title: last.title,
      body: null,
      day: on,
      actorUserId,
      createdAt: ctx.now(),
    }),
    ctx.db
      .update(securityPolicy)
      .set({ reviewDue: addMonths(on, p.reviewMonths) })
      .where(and(eq(securityPolicy.orgId, orgId), eq(securityPolicy.id, p.id))),
  ]);
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "policy.review",
    targetType: "security_policy",
    targetId: `${family}:v${last.version}`,
  });
  return getPolicy(ctx, orgId, family);
}

async function lastApproved(ctx: AppContext, orgId: string, policyId: string) {
  const rows = await ctx.db
    .select()
    .from(securityPolicyEvent)
    .where(
      and(
        eq(securityPolicyEvent.orgId, orgId),
        eq(securityPolicyEvent.policyId, policyId),
        eq(securityPolicyEvent.kind, "approved"),
      ),
    )
    .orderBy(asc(securityPolicyEvent.createdAt))
    .all();
  return rows.at(-1) ?? null;
}

/** Delete a family's policy and its history. Admins only (route); the audit log keeps the fact. */
export async function deletePolicy(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  family: FamilyCode,
) {
  const p = await findPolicy(ctx, orgId, family);
  if (!p) throw notFound("Policy");
  await ctx.db.batch([
    ctx.db
      .delete(securityPolicy)
      .where(and(eq(securityPolicy.orgId, orgId), eq(securityPolicy.id, p.id))),
    ctx.db
      .delete(policyProcedureDraft)
      .where(and(eq(policyProcedureDraft.orgId, orgId), eq(policyProcedureDraft.family, family))),
  ]);
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "policy.delete",
    targetType: "security_policy",
    targetId: family,
  });
}

const docInput = (
  orgName: string,
  p: PolicyRow,
  names: Map<string, string>,
  generatedOn: string,
): PolicyDocumentInput => ({
  orgName,
  family: p.family,
  title: p.title,
  body: p.body,
  version: p.version,
  status: p.status,
  ownerName: p.ownerUserId ? (names.get(p.ownerUserId) ?? null) : null,
  approvedByName: p.approvedBy ? (names.get(p.approvedBy) ?? null) : null,
  approvedOn: p.status === "approved" ? p.approvedOn : null,
  reviewMonths: p.reviewMonths,
  reviewDue: p.reviewDue,
  generatedOn,
});

async function orgDisplayName(ctx: AppContext, orgId: string) {
  const { org, profile } = await getOrg(ctx, orgId);
  return profile.legalName.trim() || org.name;
}

/**
 * The document for one family: the current text, or `version` (an approved one from the history).
 */
export async function policyDocument(
  ctx: AppContext,
  orgId: string,
  family: FamilyCode,
  version?: number,
): Promise<PolicyDocumentInput> {
  const p = await findPolicy(ctx, orgId, family);
  if (!p) throw notFound("Policy");
  const [orgName, names] = await Promise.all([orgDisplayName(ctx, orgId), memberNames(ctx, orgId)]);
  const doc = docInput(orgName, p, names, today(ctx));
  if (version === undefined || (version === p.version && p.status === "approved")) return doc;
  const ev = await ctx.db
    .select()
    .from(securityPolicyEvent)
    .where(
      and(
        eq(securityPolicyEvent.orgId, orgId),
        eq(securityPolicyEvent.policyId, p.id),
        eq(securityPolicyEvent.kind, "approved"),
        eq(securityPolicyEvent.version, version),
      ),
    )
    .get();
  if (!ev?.body) throw notFound("Approved version");
  return {
    ...doc,
    title: ev.title,
    body: ev.body,
    version: ev.version,
    status: "approved",
    approvedOn: ev.day,
    approvedByName: ev.actorUserId ? (names.get(ev.actorUserId) ?? null) : null,
    // The review date belongs to the policy, not to an old version.
    reviewDue: version === p.version ? p.reviewDue : null,
  };
}

/** Every written policy's current text, for the policy manual download. */
export async function allPolicyDocuments(ctx: AppContext, orgId: string) {
  const [rows, orgName, names] = await Promise.all([
    ctx.db.select().from(securityPolicy).where(eq(securityPolicy.orgId, orgId)).all(),
    orgDisplayName(ctx, orgId),
    memberNames(ctx, orgId),
  ]);
  const on = today(ctx);
  return { orgName, generatedOn: on, docs: rows.map((r) => docInput(orgName, r, names, on)) };
}

/** For the SSP: each written policy's title, the version in force, its approval and next review. */
export async function policiesForSsp(ctx: AppContext, orgId: string) {
  const [rows, events] = await Promise.all([
    ctx.db.select().from(securityPolicy).where(eq(securityPolicy.orgId, orgId)).all(),
    ctx.db
      .select({
        policyId: securityPolicyEvent.policyId,
        version: securityPolicyEvent.version,
        title: securityPolicyEvent.title,
        day: securityPolicyEvent.day,
      })
      .from(securityPolicyEvent)
      .where(and(eq(securityPolicyEvent.orgId, orgId), eq(securityPolicyEvent.kind, "approved")))
      .orderBy(asc(securityPolicyEvent.createdAt))
      .all(),
  ]);
  const last = new Map<string, (typeof events)[number]>();
  for (const e of events) last.set(e.policyId, e);
  return rows.map((r) => {
    const a = last.get(r.id);
    return {
      family: r.family,
      title: a?.title ?? r.title,
      versionInForce: a?.version ?? null,
      approvedOn: a?.day ?? null,
      reviewDue: r.reviewDue,
      draftPending: r.status === "draft",
    };
  });
}
