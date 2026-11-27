// External service providers (32 CFR 170.19(c)(2)). Rows are tenant-scoped; every write is audited.
// Scoping by table 4 and the list checks are pure, in @shared/service-providers.
import {
  type ControlShare,
  checkProviders,
  controlSharesProblem,
  type EspData,
  espScope,
  MAX_PROVIDERS_PER_ORG,
} from "@shared/service-providers";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../context";
import { evidence, serviceProvider } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../audit";

export type ProviderRow = typeof serviceProvider.$inferSelect;

export interface ProviderInput {
  name: string;
  data: EspData;
  isCsp?: boolean;
  services?: string;
  fedrampBasis?: string;
  serviceDescriptionRef?: string;
  crmRef?: string;
  /** An evidence file of this org holding the service description, or null to unlink. */
  serviceDescriptionEvidenceId?: string | null;
  crmEvidenceId?: string | null;
  notes?: string;
  controls?: ControlShare[];
}

export async function listProviders(ctx: AppContext, orgId: string): Promise<ProviderRow[]> {
  return ctx.db
    .select()
    .from(serviceProvider)
    .where(eq(serviceProvider.orgId, orgId))
    .orderBy(asc(serviceProvider.name))
    .all();
}

export interface LinkedFile {
  id: string;
  title: string;
  fileName: string;
  sha256: string;
}

/** The org's evidence files the providers link to, by id (other orgs' ids never match). */
export async function linkedFiles(
  ctx: AppContext,
  orgId: string,
  rows: Pick<ProviderRow, "serviceDescriptionEvidenceId" | "crmEvidenceId">[],
): Promise<Map<string, LinkedFile>> {
  const ids = [
    ...new Set(rows.flatMap((r) => [r.serviceDescriptionEvidenceId, r.crmEvidenceId])),
  ].filter((id): id is string => Boolean(id));
  if (ids.length === 0) return new Map();
  const files = await ctx.db
    .select({
      id: evidence.id,
      title: evidence.title,
      fileName: evidence.fileName,
      sha256: evidence.sha256,
    })
    .from(evidence)
    .where(and(eq(evidence.orgId, orgId), inArray(evidence.id, ids)))
    .all();
  return new Map(files.map((f) => [f.id, f]));
}

export async function providerList(ctx: AppContext, orgId: string) {
  const rows = await listProviders(ctx, orgId);
  const files = await linkedFiles(ctx, orgId, rows);
  const file = (id: string | null) => (id ? (files.get(id) ?? null) : null);
  return {
    items: rows.map((r) => ({
      ...r,
      scope: espScope(r.data, r.isCsp),
      serviceDescriptionFile: file(r.serviceDescriptionEvidenceId),
      crmFile: file(r.crmEvidenceId),
    })),
    check: checkProviders(rows),
  };
}

export async function getProvider(
  ctx: AppContext,
  orgId: string,
  id: string,
): Promise<ProviderRow> {
  const row = await ctx.db
    .select()
    .from(serviceProvider)
    .where(and(eq(serviceProvider.id, id), eq(serviceProvider.orgId, orgId)))
    .get();
  if (!row) throw notFound("Service provider");
  return row;
}

function checkShares(controls: ControlShare[] | undefined) {
  const problem = controls ? controlSharesProblem(controls) : null;
  if (problem) throw badRequest(problem);
}

/** A linked file must be one of this org's evidence files. */
async function checkFiles(ctx: AppContext, orgId: string, input: Partial<ProviderInput>) {
  for (const id of [input.serviceDescriptionEvidenceId, input.crmEvidenceId]) {
    if (!id) continue;
    const row = await ctx.db
      .select({ id: evidence.id })
      .from(evidence)
      .where(and(eq(evidence.id, id), eq(evidence.orgId, orgId)))
      .get();
    if (!row) throw badRequest("Link an evidence file this organization holds.");
  }
}

/** Called before an evidence file is deleted: providers that pointed at it go back to unlinked. */
export async function unlinkProviderEvidence(ctx: AppContext, orgId: string, evidenceId: string) {
  await ctx.db
    .update(serviceProvider)
    .set({ serviceDescriptionEvidenceId: null })
    .where(
      and(
        eq(serviceProvider.orgId, orgId),
        eq(serviceProvider.serviceDescriptionEvidenceId, evidenceId),
      ),
    );
  await ctx.db
    .update(serviceProvider)
    .set({ crmEvidenceId: null })
    .where(and(eq(serviceProvider.orgId, orgId), eq(serviceProvider.crmEvidenceId, evidenceId)));
}

export async function createProvider(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  input: ProviderInput,
) {
  checkShares(input.controls);
  await checkFiles(ctx, orgId, input);
  const existing = await ctx.db
    .select({ n: count() })
    .from(serviceProvider)
    .where(eq(serviceProvider.orgId, orgId))
    .get();
  if ((existing?.n ?? 0) >= MAX_PROVIDERS_PER_ORG)
    throw conflict(`A list holds at most ${MAX_PROVIDERS_PER_ORG} service providers.`);
  const id = newId("esp");
  await ctx.db.insert(serviceProvider).values({
    id,
    orgId,
    name: input.name,
    data: input.data,
    isCsp: input.isCsp ?? false,
    services: input.services ?? "",
    fedrampBasis: input.fedrampBasis ?? "",
    serviceDescriptionRef: input.serviceDescriptionRef ?? "",
    crmRef: input.crmRef ?? "",
    serviceDescriptionEvidenceId: input.serviceDescriptionEvidenceId ?? null,
    crmEvidenceId: input.crmEvidenceId ?? null,
    notes: input.notes ?? "",
    controls: input.controls ?? [],
  });
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "service_provider.create",
    targetType: "service_provider",
    targetId: id,
  });
  return getProvider(ctx, orgId, id);
}

export async function updateProvider(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
  patch: Partial<ProviderInput>,
) {
  await getProvider(ctx, orgId, id);
  checkShares(patch.controls);
  await checkFiles(ctx, orgId, patch);
  await ctx.db
    .update(serviceProvider)
    .set(patch)
    .where(and(eq(serviceProvider.id, id), eq(serviceProvider.orgId, orgId)));
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "service_provider.update",
    targetType: "service_provider",
    targetId: id,
  });
  return getProvider(ctx, orgId, id);
}

export async function deleteProvider(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
) {
  await getProvider(ctx, orgId, id);
  await ctx.db
    .delete(serviceProvider)
    .where(and(eq(serviceProvider.id, id), eq(serviceProvider.orgId, orgId)));
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "service_provider.delete",
    targetType: "service_provider",
    targetId: id,
  });
}
