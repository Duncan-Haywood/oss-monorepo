import type { CmmcLevel } from "@shared/controls";
import { eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { evidence, organization } from "../../db/schema";
import { listAssets, networkDiagram } from "../assets";
import { recordsFor } from "../controls";
import { getProfile, listMembers } from "../orgs";
import { personnelRecords } from "../personnel";
import { listPoam } from "../poam";
import { policiesForSsp } from "../security-policies";
import { linkedFiles, listProviders } from "../service-providers";
import { renderSsp } from "./render";

export async function buildSsp(ctx: AppContext, orgId: string, levelOverride?: CmmcLevel) {
  const [org, profile, records, files, poam, users, assets, providers, diagram, policies] =
    await Promise.all([
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
      listAssets(ctx, orgId),
      listProviders(ctx, orgId),
      networkDiagram(ctx, orgId),
      policiesForSsp(ctx, orgId),
    ]);
  const providerFiles = await linkedFiles(ctx, orgId, providers);
  const fileLine = (id: string | null) => {
    const f = id ? providerFiles.get(id) : undefined;
    return f ? `evidence file "${f.title}" (sha256 ${f.sha256.slice(0, 12)})` : "";
  };
  const evidenceCount: Record<string, number> = {};
  for (const f of files)
    if (f.controlId) evidenceCount[f.controlId] = (evidenceCount[f.controlId] ?? 0) + 1;
  const level = levelOverride ?? (profile.targetLevel === 1 ? 1 : 2);
  // Counts only: the SSP is shared with primes and assessors, so no names leave the People tab.
  const people = level === 2 ? await personnelRecords(ctx, orgId) : null;
  const gaps: Record<string, number> = {};
  for (const i of people?.check.issues ?? []) gaps[i.controlId] = (gaps[i.controlId] ?? 0) + 1;
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
    assets,
    networkDiagram: diagram
      ? `evidence file "${diagram.title}" (${diagram.fileName}, sha256 ${diagram.sha256.slice(0, 12)})`
      : "",
    providers: providers.map((p) => ({
      ...p,
      serviceDescriptionFile: fileLine(p.serviceDescriptionEvidenceId),
      crmFile: fileLine(p.crmEvidenceId),
    })),
    // Section 8 for Level 2, and for Level 1 once any policy is written.
    policies: level === 2 || policies.length ? policies : undefined,
    personnel: people
      ? {
          asOf: people.today,
          recorded: people.items.length,
          refreshMonths: people.refreshMonths,
          requirements: people.check.requirements,
          gaps,
        }
      : undefined,
  });
}
