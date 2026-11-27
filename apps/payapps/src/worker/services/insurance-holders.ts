// Certificate holders: which jobs' GCs hold each of the company's insurance certificates
// (src/shared/insurance.ts has the rules), with the date it was sent when typed. Rows in
// insurance_certificate_projects; every query filters by org, and a job must belong to the same
// company as the certificate.
import type { CertificateHolder } from "@shared/insurance";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../context";
import { insuranceCertificateProjects, insuranceCertificates, projects } from "../db/schema";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/ids";

/** One row a job, so the company's job limit bounds it; this caps one request. */
export const MAX_HOLDERS_PER_CERTIFICATE = 500;

export interface HolderInput {
  projectId: string;
  sentOn?: string | null;
}

/** Every certificate's holders, by job name. */
export async function holdersByCertificate(
  ctx: AppContext,
  orgId: string,
): Promise<Map<string, CertificateHolder[]>> {
  const rows = await ctx.db
    .select({
      certificateId: insuranceCertificateProjects.certificateId,
      projectId: insuranceCertificateProjects.projectId,
      sentOn: insuranceCertificateProjects.sentOn,
      projectName: projects.name,
      gcName: projects.gcName,
    })
    .from(insuranceCertificateProjects)
    .innerJoin(
      projects,
      and(
        eq(projects.id, insuranceCertificateProjects.projectId),
        eq(projects.orgId, insuranceCertificateProjects.orgId),
      ),
    )
    .where(eq(insuranceCertificateProjects.orgId, orgId))
    .orderBy(asc(projects.name));
  const out = new Map<string, CertificateHolder[]>();
  for (const r of rows) {
    const list = out.get(r.certificateId) ?? [];
    list.push({
      projectId: r.projectId,
      projectName: r.projectName,
      gcName: r.gcName,
      sentOn: r.sentOn,
    });
    out.set(r.certificateId, list);
  }
  return out;
}

/** Replaces the certificate's holders with `holders` (an empty list clears them). */
export async function setCertificateHolders(
  ctx: AppContext,
  orgId: string,
  certificateId: string,
  userId: string,
  holders: HolderInput[],
): Promise<CertificateHolder[]> {
  const cert = await ctx.db
    .select({ id: insuranceCertificates.id })
    .from(insuranceCertificates)
    .where(and(eq(insuranceCertificates.id, certificateId), eq(insuranceCertificates.orgId, orgId)))
    .get();
  if (!cert) throw notFound("Insurance certificate");
  const ids = [...new Set(holders.map((h) => h.projectId))];
  if (ids.length !== holders.length) throw badRequest("A job is listed twice");
  if (ids.length > MAX_HOLDERS_PER_CERTIFICATE) {
    throw badRequest(`Up to ${MAX_HOLDERS_PER_CERTIFICATE} jobs a certificate`);
  }
  if (ids.length > 0) {
    // In chunks: D1 caps bound parameters per statement.
    const found = new Set<string>();
    for (let i = 0; i < ids.length; i += 90) {
      const chunk = ids.slice(i, i + 90);
      const rows = await ctx.db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.orgId, orgId), inArray(projects.id, chunk)));
      for (const r of rows) found.add(r.id);
    }
    if (found.size !== ids.length) throw notFound("Project");
  }
  const del = ctx.db
    .delete(insuranceCertificateProjects)
    .where(
      and(
        eq(insuranceCertificateProjects.orgId, orgId),
        eq(insuranceCertificateProjects.certificateId, certificateId),
      ),
    );
  const inserts = holders.map((h) =>
    ctx.db.insert(insuranceCertificateProjects).values({
      id: newId("ich"),
      orgId,
      certificateId,
      projectId: h.projectId,
      sentOn: h.sentOn ? h.sentOn : null,
      createdBy: userId,
    }),
  );
  // One batch: the old list is never half replaced.
  await ctx.db.batch([del, ...inserts]);
  return (await holdersByCertificate(ctx, orgId)).get(certificateId) ?? [];
}
