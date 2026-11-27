// Insurance requirements per job: what the job's subcontract asks the company to carry, one row a
// coverage (project_insurance_requirements), checked against the certificates on file by the pure
// rules in src/shared/insurance-requirements.ts. Every query filters by org, and the job must belong
// to the same company.
import type { JobInsuranceRequirementsDto } from "@shared/api/types";
import { INSURANCE_KINDS } from "@shared/insurance";
import { checkRequirements, type InsuranceRequirement } from "@shared/insurance-requirements";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../context";
import { projectInsuranceRequirements, projects } from "../db/schema";
import { notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { certificateCoverages } from "./insurance";
import { isoDay } from "./payapps/cash";

export interface RequirementInput {
  kind: InsuranceRequirement["kind"];
  eachOccurrenceCents?: number | null;
  aggregateCents?: number | null;
  additionalInsured?: boolean;
  waiverOfSubrogation?: boolean;
  primaryNoncontributory?: boolean;
  umbrellaCounts?: boolean;
}

async function assertJob(ctx: AppContext, orgId: string, projectId: string) {
  const row = await ctx.db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)))
    .get();
  if (!row) throw notFound("Project");
}

const order = (k: InsuranceRequirement["kind"]) => INSURANCE_KINDS.indexOf(k);

/** A job's requirements in the coverage order of INSURANCE_KINDS. */
export async function jobRequirements(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<InsuranceRequirement[]> {
  const rows = await ctx.db
    .select()
    .from(projectInsuranceRequirements)
    .where(
      and(
        eq(projectInsuranceRequirements.orgId, orgId),
        eq(projectInsuranceRequirements.projectId, projectId),
      ),
    );
  return rows
    .map((r) => ({
      kind: r.kind,
      eachOccurrenceCents: r.eachOccurrenceCents,
      aggregateCents: r.aggregateCents,
      additionalInsured: r.additionalInsured,
      waiverOfSubrogation: r.waiverOfSubrogation,
      primaryNoncontributory: r.primaryNoncontributory,
      umbrellaCounts: r.umbrellaCounts,
    }))
    .sort((a, b) => order(a.kind) - order(b.kind));
}

export async function getJobRequirements(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<JobInsuranceRequirementsDto> {
  await assertJob(ctx, orgId, projectId);
  const today = isoDay(ctx.now());
  const [requirements, certificates] = await Promise.all([
    jobRequirements(ctx, orgId, projectId),
    certificateCoverages(ctx, orgId),
  ]);
  return {
    projectId,
    requirements,
    checks: checkRequirements(requirements, certificates, today),
    today,
  };
}

/** Replaces the job's requirements with `requirements` (an empty list clears them). */
export async function setJobRequirements(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  userId: string,
  requirements: RequirementInput[],
): Promise<JobInsuranceRequirementsDto> {
  await assertJob(ctx, orgId, projectId);
  const del = ctx.db
    .delete(projectInsuranceRequirements)
    .where(
      and(
        eq(projectInsuranceRequirements.orgId, orgId),
        eq(projectInsuranceRequirements.projectId, projectId),
      ),
    );
  const inserts = requirements.map((r) =>
    ctx.db.insert(projectInsuranceRequirements).values({
      id: newId("ireq"),
      orgId,
      projectId,
      kind: r.kind,
      eachOccurrenceCents: r.eachOccurrenceCents ?? null,
      aggregateCents: r.aggregateCents ?? null,
      additionalInsured: r.additionalInsured ?? false,
      waiverOfSubrogation: r.waiverOfSubrogation ?? false,
      primaryNoncontributory: r.primaryNoncontributory ?? false,
      umbrellaCounts: r.umbrellaCounts ?? false,
      createdBy: userId,
    }),
  );
  // One batch: the old list is never half replaced.
  await ctx.db.batch([del, ...inserts]);
  return getJobRequirements(ctx, orgId, projectId);
}
