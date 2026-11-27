// ISO 9001 clause checklist on the same evidence as the CMMC workspace (src/shared/quality).
// Per-org answers live in quality_clause_record; quality_evidence_link points a clause at an evidence
// file already uploaded, so a training record or an internal audit is stored once and serves both.
// Every query filters by orgId. Nothing here claims certification or audit readiness.
import { SCOPE_DISCLAIMER } from "@shared/enums";
import {
  type ClauseState,
  ISO9001_CLAUSES,
  ISO9001_VERIFICATION,
  QUALITY_STATUS_LABEL,
  type QualityChecklistResponse,
  type QualityClauseDto,
  type QualityEvidenceRef,
  type QualityStatus,
  qualityClauseById,
  qualityReadiness,
  validateClauseState,
} from "@shared/quality";
import { and, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../context";
import { evidence, qualityClauseRecord, qualityEvidenceLink } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../audit";
import { isMember } from "../orgs";

export function requireClause(clauseId: string) {
  const def = qualityClauseById(clauseId);
  if (!def) throw notFound("Clause");
  return def;
}

/** Every CMMC requirement any clause points at, for one evidence query. */
const RELATED_CONTROL_IDS = [...new Set(ISO9001_CLAUSES.flatMap((c) => c.relatedControls))];

export async function qualityChecklist(
  ctx: AppContext,
  orgId: string,
): Promise<QualityChecklistResponse> {
  const [records, links, related] = await Promise.all([
    ctx.db.select().from(qualityClauseRecord).where(eq(qualityClauseRecord.orgId, orgId)).all(),
    ctx.db
      .select({
        linkId: qualityEvidenceLink.id,
        clauseId: qualityEvidenceLink.clauseId,
        id: evidence.id,
        title: evidence.title,
        fileName: evidence.fileName,
      })
      .from(qualityEvidenceLink)
      .innerJoin(
        evidence,
        and(eq(evidence.id, qualityEvidenceLink.evidenceId), eq(evidence.orgId, orgId)),
      )
      .where(eq(qualityEvidenceLink.orgId, orgId))
      .all(),
    ctx.db
      .select({
        id: evidence.id,
        title: evidence.title,
        fileName: evidence.fileName,
        controlId: evidence.controlId,
      })
      .from(evidence)
      .where(and(eq(evidence.orgId, orgId), inArray(evidence.controlId, RELATED_CONTROL_IDS)))
      .all(),
  ]);
  const byClause = new Map(records.map((r) => [r.clauseId, r]));
  const items: QualityClauseDto[] = ISO9001_CLAUSES.map((def) => {
    const rec = byClause.get(def.id);
    const direct: QualityEvidenceRef[] = links
      .filter((l) => l.clauseId === def.id)
      .map((l) => ({
        id: l.id,
        title: l.title,
        fileName: l.fileName,
        via: "clause",
        linkId: l.linkId,
      }));
    const seen = new Set(direct.map((e) => e.id));
    const fromControls: QualityEvidenceRef[] = related
      .filter((e) => e.controlId && def.relatedControls.includes(e.controlId) && !seen.has(e.id))
      .map((e) => ({
        id: e.id,
        title: e.title,
        fileName: e.fileName,
        via: e.controlId as string,
        linkId: null,
      }));
    return {
      ...def,
      status: rec?.status ?? "not_assessed",
      notes: rec?.notes ?? "",
      ownerUserId: rec?.ownerUserId ?? null,
      updatedAt: rec?.updatedAt ? rec.updatedAt.toISOString() : null,
      evidence: [...direct, ...fromControls],
    };
  });
  const states = new Map<string, ClauseState>(
    items.map((i) => [
      i.id,
      {
        status: i.status,
        notes: i.notes,
        evidenceCount: i.evidence.length,
        ownerUserId: i.ownerUserId,
      },
    ]),
  );
  return {
    standard: ISO9001_VERIFICATION.standard,
    verification: {
      checkedAgainstCopy: ISO9001_VERIFICATION.checkedAgainstCopy,
      note: ISO9001_VERIFICATION.note,
    },
    items,
    readiness: qualityReadiness(states),
  };
}

export interface ClausePatch {
  status?: QualityStatus;
  notes?: string;
  ownerUserId?: string | null;
}

export async function updateClause(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  clauseId: string,
  patch: ClausePatch,
) {
  requireClause(clauseId);
  if (patch.ownerUserId && !(await isMember(ctx, orgId, patch.ownerUserId))) {
    throw badRequest("Owner must be a member of this organization");
  }
  const where = and(
    eq(qualityClauseRecord.orgId, orgId),
    eq(qualityClauseRecord.clauseId, clauseId),
  );
  const existing = await ctx.db.select().from(qualityClauseRecord).where(where).get();
  const status = patch.status ?? existing?.status ?? "not_assessed";
  const notes = patch.notes ?? existing?.notes ?? "";
  const errors = validateClauseState(status, notes);
  if (errors.length) throw badRequest(errors.join(" "), { errors });
  const set = {
    status,
    notes,
    ownerUserId:
      patch.ownerUserId !== undefined ? patch.ownerUserId : (existing?.ownerUserId ?? null),
    updatedAt: ctx.now(),
  };
  await ctx.db
    .insert(qualityClauseRecord)
    .values({ id: newId("qcl"), orgId, clauseId, ...set })
    .onConflictDoUpdate({
      target: [qualityClauseRecord.orgId, qualityClauseRecord.clauseId],
      set,
    });
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "quality.update",
    targetType: "quality_clause",
    targetId: clauseId,
  });
  return ctx.db.select().from(qualityClauseRecord).where(where).get();
}

/** Point a clause at an evidence file the org already holds. Linking twice is a no-op. */
export async function linkEvidence(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  clauseId: string,
  evidenceId: string,
) {
  requireClause(clauseId);
  const file = await ctx.db
    .select({ id: evidence.id })
    .from(evidence)
    .where(and(eq(evidence.orgId, orgId), eq(evidence.id, evidenceId)))
    .get();
  if (!file) throw notFound("Evidence");
  await ctx.db
    .insert(qualityEvidenceLink)
    .values({ id: newId("qln"), orgId, clauseId, evidenceId, linkedBy: actorUserId })
    .onConflictDoNothing();
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "quality.link_evidence",
    targetType: "quality_clause",
    targetId: clauseId,
  });
}

/** Removes the link only; the file stays (it may serve a CMMC requirement too). */
export async function unlinkEvidence(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  linkId: string,
) {
  const where = and(eq(qualityEvidenceLink.orgId, orgId), eq(qualityEvidenceLink.id, linkId));
  const row = await ctx.db
    .select({ clauseId: qualityEvidenceLink.clauseId })
    .from(qualityEvidenceLink)
    .where(where)
    .get();
  if (!row) throw notFound("Evidence link");
  await ctx.db.delete(qualityEvidenceLink).where(where);
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "quality.unlink_evidence",
    targetType: "quality_clause",
    targetId: row.clauseId,
  });
}

/** Removes every clause link to a file, before the file itself is deleted. */
export async function unlinkEvidenceEverywhere(ctx: AppContext, orgId: string, evidenceId: string) {
  await ctx.db
    .delete(qualityEvidenceLink)
    .where(
      and(eq(qualityEvidenceLink.orgId, orgId), eq(qualityEvidenceLink.evidenceId, evidenceId)),
    );
}

const cell = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();

/** Markdown gap report: readiness by section, then every clause with status, notes and evidence. */
export function renderQualityReport(
  orgName: string,
  data: QualityChecklistResponse,
  today: string,
  /** userId to name, from this org's members only; an owner who left shows as unassigned. */
  ownerNames: ReadonlyMap<string, string> = new Map(),
) {
  const r = data.readiness;
  const lines: string[] = [
    `# ${data.standard} self-check: ${cell(orgName)}`,
    "",
    `Prepared ${today}. A working document for the organization's own review before a certification`,
    "body's audit. It is not a certification, not an audit result and not a statement of conformity.",
    "",
    `> ${data.verification.note}`,
    "",
    "## Summary",
    "",
    `- Clauses: ${r.total} (${r.notApplicable} not applicable)`,
    `- In place: ${r.inPlace}; partly in place: ${r.partial}; gaps: ${r.gaps}; not assessed: ${r.notAssessed}`,
    `- Applicable clauses in place (partial counts half): ${r.percentInPlace === null ? "not yet assessed" : `${r.percentInPlace}%`}`,
  ];
  if (r.inPlaceWithoutEvidence.length) {
    lines.push(`- Marked in place with no evidence file: ${r.inPlaceWithoutEvidence.join(", ")}`);
  }
  if (r.openItems.length) lines.push(`- Open items: ${r.openItems.join(", ")}`);
  if (r.openWithoutOwner.length) {
    lines.push(`- Open items with no owner: ${r.openWithoutOwner.join(", ")}`);
  }
  lines.push(
    "",
    "| Section | Applicable | In place | Partly | Gaps | Not assessed |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  for (const s of r.sections) {
    lines.push(
      `| ${s.section} ${s.name} | ${s.applicable} | ${s.inPlace} | ${s.partial} | ${s.gaps} | ${s.notAssessed} |`,
    );
  }
  lines.push(
    "",
    "## Clauses",
    "",
    "| Clause | Status | Owner | Notes | Evidence |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const c of data.items) {
    const files = c.evidence
      .map((e) => (e.via === "clause" ? cell(e.title) : `${cell(e.title)} (from ${e.via})`))
      .join("; ");
    const owner = c.ownerUserId ? ownerNames.get(c.ownerUserId) : undefined;
    lines.push(
      `| ${c.number} ${cell(c.title)} | ${QUALITY_STATUS_LABEL[c.status]} | ${owner ? cell(owner) : "–"} | ${cell(c.notes) || "–"} | ${files || "–"} |`,
    );
  }
  lines.push("", "---", "", SCOPE_DISCLAIMER, "");
  return lines.join("\n");
}
