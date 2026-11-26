import type { CmmcLevel } from "@shared/controls";
import { eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { evidence, organization } from "../../db/schema";
import { recordsFor } from "../controls";
import { getProfile, listMembers } from "../orgs";
import { listPoam } from "../poam";
import { renderSsp } from "./render";

export async function buildSsp(ctx: AppContext, orgId: string, levelOverride?: CmmcLevel) {
  const [org, profile, records, files, poam, users] = await Promise.all([
    ctx.db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, orgId))
      .get(),
    getProfile(ctx, orgId),
    recordsFor(ctx, orgId),
    ctx.db
      .select({ controlId: evidence.controlId })
      .from(evidence)
      .where(eq(evidence.orgId, orgId))
      .all(),
    listPoam(ctx, orgId),
    // Owner names come only from this org's members.
    listMembers(ctx, orgId).then((rows) => new Map(rows.map((m) => [m.userId, m.name]))),
  ]);
  const evidenceCount: Record<string, number> = {};
  for (const f of files)
    if (f.controlId) evidenceCount[f.controlId] = (evidenceCount[f.controlId] ?? 0) + 1;
  const level = levelOverride ?? (profile.targetLevel === 1 ? 1 : 2);
  return renderSsp({
    orgName: org?.name ?? "",
    level,
    generatedAt: ctx.now(),
    profile,
    records: records.map((r) => ({
      controlId: r.controlId,
      status: r.status,
      partialCredit: r.partialCredit,
      statement: r.statement,
      draftStatement: r.draftStatement,
      ownerName: r.ownerUserId ? (users.get(r.ownerUserId) ?? null) : null,
    })),
    evidenceCount,
    poam,
  });
}
