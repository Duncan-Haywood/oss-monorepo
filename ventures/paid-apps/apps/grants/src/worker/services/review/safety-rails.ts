// SAFETY RAILS: hard conditions under which autopilot NEVER submits, at any automation level and
// whatever the per-stage overrides say. Not configurable. Enforced here, in one place:
//   - safetyRailFailures()  pure rules (used by decideReviewTier at routing time), and
//   - checkSafetyRails()    loads the facts from D1 and applies the same rules; the submission
//                           module calls it right before any funder email sent without a person.
// A failed rail never blocks a person from approving; it only keeps autopilot from acting alone.
import type { ApplicationContent } from "@shared/content";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  applicationFlags,
  applications,
  applicationVersions,
  consentRecords,
  documents,
  facts,
  opportunities,
  reviews,
} from "../../db/schema";
import { chunk, D1_IN_CHUNK } from "../../lib/chunk";
import { DRAFTABLE_STATUSES, getEntitlement } from "../billing";
import { isEmail, isSubmissionEmailVerified } from "../submission/channel";

export const SAFETY_RAILS = [
  "grounding_not_passed",
  "open_blockers",
  "unconfirmed_citations",
  "unverified_recipient",
  "no_autopilot_consent",
  "deadline_passed",
  "human_edits",
  "billing_inactive",
  "injection_warnings",
] as const;
export type SafetyRail = (typeof SAFETY_RAILS)[number];

/** Plain-language description of each rail (settings screen). */
export const SAFETY_RAIL_DESCRIPTIONS: Record<SafetyRail, string> = {
  grounding_not_passed: "The independent grounding check did not pass.",
  open_blockers: "A blocking flag is still open.",
  unconfirmed_citations: "A claim cites a fact a person has not confirmed.",
  unverified_recipient: "The funder's email address has not been verified.",
  no_autopilot_consent: "The organization has not consented to autopilot submission.",
  deadline_passed: "The opportunity's deadline has passed.",
  human_edits: "A person edited the draft since it was last approved.",
  billing_inactive: "The organization's billing is not active.",
  injection_warnings: "A source document behind a cited fact has a prompt-injection warning.",
};

/**
 * Facts the rails judge. Every field is required by the loader; in the pure function an
 * undefined value fails its rail (unknown never passes).
 */
export interface SafetyRailFacts {
  groundingPassed?: boolean;
  openBlockers?: number;
  /** Claims citing facts that are not (or no longer) `confirmed`. */
  unconfirmedCitations?: number;
  /** The funder address is a single safe address AND verified (confirmed or trusted source). */
  recipientEmailVerified?: boolean;
  /** Latest `autopilot_submission` consent record for the org is a grant. */
  autopilotConsentGranted?: boolean;
  deadlinePassed?: boolean;
  hasHumanEdits?: boolean;
  billingActive?: boolean;
  /** Source documents of cited facts with an injection warning. */
  injectionWarnings?: number;
}

export interface SafetyRailFailure {
  rail: SafetyRail;
  message: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const count = (n: number | undefined) => (n === undefined ? Number.POSITIVE_INFINITY : n);

/** Rails that fail (empty = autopilot may act, as far as the rails are concerned). */
export function safetyRailFailures(f: SafetyRailFacts): SafetyRailFailure[] {
  const out: SafetyRailFailure[] = [];
  if (f.groundingPassed !== true) {
    out.push({ rail: "grounding_not_passed", message: "Grounding verification did not pass" });
  }
  const blockers = count(f.openBlockers);
  if (blockers > 0) {
    out.push({
      rail: "open_blockers",
      message: Number.isFinite(blockers)
        ? `${plural(blockers, "blocking flag")} open`
        : "Open blocking flags are unknown",
    });
  }
  const unconfirmed = count(f.unconfirmedCitations);
  if (unconfirmed > 0) {
    out.push({
      rail: "unconfirmed_citations",
      message: Number.isFinite(unconfirmed)
        ? `${plural(unconfirmed, "claim")} cite${unconfirmed === 1 ? "s" : ""} unconfirmed facts`
        : "Whether every cited fact is confirmed is unknown",
    });
  }
  if (f.recipientEmailVerified !== true) {
    out.push({
      rail: "unverified_recipient",
      message: "The funder's email address is not verified",
    });
  }
  if (f.autopilotConsentGranted !== true) {
    out.push({
      rail: "no_autopilot_consent",
      message: "The organization has not granted the autopilot submission consent",
    });
  }
  if (f.deadlinePassed !== false) {
    out.push({
      rail: "deadline_passed",
      message:
        f.deadlinePassed === true
          ? "The deadline has passed"
          : "Whether the deadline passed is unknown",
    });
  }
  if (f.hasHumanEdits !== false) {
    out.push({
      rail: "human_edits",
      message: "A person edited this draft, so a human must approve it before it is submitted",
    });
  }
  if (f.billingActive !== true) {
    out.push({ rail: "billing_inactive", message: "The organization's billing is not active" });
  }
  const injections = count(f.injectionWarnings);
  if (injections > 0) {
    out.push({
      rail: "injection_warnings",
      message: Number.isFinite(injections)
        ? `${plural(injections, "source document")} behind cited facts ${injections === 1 ? "has" : "have"} a prompt-injection warning`
        : "Prompt-injection warnings on source documents are unknown",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Loading the facts from D1 (every query scoped by orgId)
// ---------------------------------------------------------------------------------------------

type ApplicationRow = typeof applications.$inferSelect;
type VersionRow = typeof applicationVersions.$inferSelect;
type OpportunityRow = typeof opportunities.$inferSelect;

export function citedFactIds(content: ApplicationContent): string[] {
  const ids = new Set<string>();
  for (const s of content.sections)
    for (const p of s.paragraphs) for (const c of p.claims) for (const id of c.factIds) ids.add(id);
  return [...ids];
}

async function citedFactRows(ctx: AppContext, orgId: string, content: ApplicationContent) {
  const ids = citedFactIds(content);
  if (ids.length === 0) return [];
  return (
    await Promise.all(
      chunk(ids, D1_IN_CHUNK).map((part) =>
        ctx.db
          .select({ id: facts.id, status: facts.status, sourceDocumentId: facts.sourceDocumentId })
          .from(facts)
          .where(and(eq(facts.orgId, orgId), inArray(facts.id, part)))
          .all(),
      ),
    )
  ).flat();
}

function unconfirmedClaims(
  content: ApplicationContent,
  rows: { id: string; status: string }[],
): number {
  const confirmed = new Set(rows.filter((r) => r.status === "confirmed").map((r) => r.id));
  let n = 0;
  for (const s of content.sections)
    for (const p of s.paragraphs)
      for (const c of p.claims) if (c.factIds.some((id) => !confirmed.has(id))) n++;
  return n;
}

async function injectionFlaggedDocuments(ctx: AppContext, orgId: string, docIds: string[]) {
  if (docIds.length === 0) return 0;
  const rows = (
    await Promise.all(
      chunk(docIds, D1_IN_CHUNK).map((part) =>
        ctx.db
          .select({ id: documents.id, safetyFlags: documents.safetyFlags })
          .from(documents)
          .where(and(eq(documents.orgId, orgId), inArray(documents.id, part)))
          .all(),
      ),
    )
  ).flat();
  return rows.filter((r) => r.safetyFlags?.injectionSuspected === true).length;
}

/** Latest autopilot_submission consent record is a grant (a later revocation wins). */
export async function autopilotConsentGranted(ctx: AppContext, orgId: string): Promise<boolean> {
  const row = await ctx.db
    .select({ granted: consentRecords.granted })
    .from(consentRecords)
    .where(and(eq(consentRecords.orgId, orgId), eq(consentRecords.scope, "autopilot_submission")))
    .orderBy(sql`${consentRecords.createdAt} desc`, sql`${consentRecords.id} desc`)
    .get();
  return row?.granted === true;
}

/** Billing is active (active / trialing / comp). past_due does not count, even within grace. */
export async function billingActive(ctx: AppContext, orgId: string): Promise<boolean> {
  const ent = await getEntitlement(ctx, orgId).catch(() => null);
  return !!ent && ent.plan !== null && ent.status !== "none" && DRAFTABLE_STATUSES.has(ent.status);
}

/**
 * True when `version` was written by a person, or a person edited the draft after the latest
 * approved version. Autopilot never submits human-edited text: a human approves it explicitly.
 */
export async function hasHumanEditsSinceApproval(
  ctx: AppContext,
  ids: { orgId: string; applicationId: string },
  version: Pick<VersionRow, "authorType">,
): Promise<boolean> {
  if (version.authorType === "user") return true;
  const approved = await ctx.db
    .select({ n: sql<number | null>`max(${applicationVersions.versionNumber})` })
    .from(reviews)
    .innerJoin(
      applicationVersions,
      and(eq(applicationVersions.id, reviews.versionId), eq(applicationVersions.orgId, ids.orgId)),
    )
    .where(
      and(
        eq(reviews.orgId, ids.orgId),
        eq(reviews.applicationId, ids.applicationId),
        eq(reviews.decision, "approved"),
      ),
    )
    .get();
  const edited = await ctx.db
    .select({ id: applicationVersions.id })
    .from(applicationVersions)
    .where(
      and(
        eq(applicationVersions.orgId, ids.orgId),
        eq(applicationVersions.applicationId, ids.applicationId),
        eq(applicationVersions.authorType, "user"),
        gt(applicationVersions.versionNumber, Number(approved?.n ?? 0)),
      ),
    )
    .get();
  return Boolean(edited);
}

export async function countOpenBlockers(
  ctx: AppContext,
  ids: { orgId: string; applicationId: string },
  versionId: string,
): Promise<number> {
  const row = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(applicationFlags)
    .where(
      and(
        eq(applicationFlags.orgId, ids.orgId),
        eq(applicationFlags.applicationId, ids.applicationId),
        eq(applicationFlags.versionId, versionId),
        eq(applicationFlags.severity, "blocker"),
        eq(applicationFlags.status, "open"),
      ),
    )
    .get();
  return Number(row?.n ?? 0);
}

/** Loads every rail fact for (application, version, opportunity). All reads are org-scoped. */
export async function loadSafetyRailFacts(
  ctx: AppContext,
  input: { app: ApplicationRow; version: VersionRow; opportunity: OpportunityRow },
): Promise<Required<SafetyRailFacts>> {
  const { app, version, opportunity: opp } = input;
  const ids = { orgId: app.orgId, applicationId: app.id };
  const cited = await citedFactRows(ctx, app.orgId, version.content);
  const docIds = [...new Set(cited.map((f) => f.sourceDocumentId).filter((d): d is string => !!d))];
  const deadline = app.deadline ?? opp.closeDate;
  const [openBlockers, consent, billing, humanEdits, injections] = await Promise.all([
    countOpenBlockers(ctx, ids, version.id),
    autopilotConsentGranted(ctx, app.orgId),
    billingActive(ctx, app.orgId),
    hasHumanEditsSinceApproval(ctx, ids, version),
    injectionFlaggedDocuments(ctx, app.orgId, docIds),
  ]);
  return {
    groundingPassed: version.groundingReport?.passed === true,
    openBlockers,
    unconfirmedCitations: unconfirmedClaims(version.content, cited),
    recipientEmailVerified: isEmail(opp.submissionEmail) && isSubmissionEmailVerified(opp),
    autopilotConsentGranted: consent,
    deadlinePassed: deadline ? deadline.getTime() < ctx.now().getTime() : false,
    hasHumanEdits: humanEdits,
    billingActive: billing,
    injectionWarnings: injections,
  };
}

/**
 * Re-check every rail from D1 for (application, version). Used right before a funder email is
 * sent without a person. Fails closed: a missing row is a failure.
 */
export async function checkSafetyRails(
  ctx: AppContext,
  input: { orgId: string; applicationId: string; versionId: string },
): Promise<SafetyRailFailure[]> {
  const app = await ctx.db
    .select()
    .from(applications)
    .where(and(eq(applications.id, input.applicationId), eq(applications.orgId, input.orgId)))
    .get();
  const version = app
    ? await ctx.db
        .select()
        .from(applicationVersions)
        .where(
          and(
            eq(applicationVersions.id, input.versionId),
            eq(applicationVersions.orgId, input.orgId),
            eq(applicationVersions.applicationId, input.applicationId),
          ),
        )
        .get()
    : undefined;
  const opp = app
    ? await ctx.db.select().from(opportunities).where(eq(opportunities.id, app.opportunityId)).get()
    : undefined;
  if (!app || !version || !opp || (opp.privateToOrgId && opp.privateToOrgId !== input.orgId)) {
    return safetyRailFailures({});
  }
  return safetyRailFailures(await loadSafetyRailFacts(ctx, { app, version, opportunity: opp }));
}
