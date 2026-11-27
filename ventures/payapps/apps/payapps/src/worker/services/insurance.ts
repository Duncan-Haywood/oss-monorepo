// The company's insurance certificates (src/shared/insurance.ts has the rules): typed from each
// certificate, listed with their status on today's date, archived when renewed. Every plan: a
// lapsed certificate holds up payment on any job. Every query filters by org.
import type {
  InsuranceCertificateDto,
  InsuranceFileDto,
  InsuranceListDto,
} from "@shared/api/types";
import {
  type CertificateHolder,
  type CertificateInput,
  certificateName,
  certificateStatus,
  holdersByGc,
  type InsuranceKind,
} from "@shared/insurance";
import type { CertificateCoverage } from "@shared/insurance-requirements";
import { and, asc, eq } from "drizzle-orm";
import type { AppContext } from "../context";
import { insuranceCertificates } from "../db/schema";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { certificateFilesByCertificate, purgeCertificateFiles } from "./insurance-files";
import { holdersByCertificate } from "./insurance-holders";
import { isoDay } from "./payapps/cash";

/** Enough for every policy a sub carries, with renewals kept as archived history. */
export const MAX_INSURANCE_CERTIFICATES = 200;

type Row = typeof insuranceCertificates.$inferSelect;

export interface CertificateFields {
  kind: InsuranceKind;
  label?: string | null;
  carrier?: string | null;
  policyNumber?: string | null;
  effectiveOn?: string | null;
  expiresOn: string;
  notes?: string | null;
  eachOccurrenceCents?: number | null;
  aggregateCents?: number | null;
  additionalInsured?: boolean;
  waiverOfSubrogation?: boolean;
  primaryNoncontributory?: boolean;
}

const blank = (v: string | null | undefined) => (v ? v : null);

function dto(
  row: Row,
  today: string,
  files: InsuranceFileDto[] = [],
  holders: CertificateHolder[] = [],
): InsuranceCertificateDto {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    carrier: row.carrier,
    policyNumber: row.policyNumber,
    effectiveOn: row.effectiveOn,
    expiresOn: row.expiresOn,
    notes: row.notes,
    archived: row.archived,
    name: certificateName(row),
    ...certificateStatus(row.expiresOn, today),
    updatedAt: row.updatedAt.toISOString(),
    files,
    holders,
    eachOccurrenceCents: row.eachOccurrenceCents,
    aggregateCents: row.aggregateCents,
    additionalInsured: row.additionalInsured,
    waiverOfSubrogation: row.waiverOfSubrogation,
    primaryNoncontributory: row.primaryNoncontributory,
  };
}

const rowsOf = (ctx: AppContext, orgId: string) =>
  ctx.db
    .select()
    .from(insuranceCertificates)
    .where(eq(insuranceCertificates.orgId, orgId))
    .orderBy(asc(insuranceCertificates.archived), asc(insuranceCertificates.expiresOn));

export async function listCertificates(ctx: AppContext, orgId: string): Promise<InsuranceListDto> {
  const today = isoDay(ctx.now());
  const [rows, files, holders] = await Promise.all([
    rowsOf(ctx, orgId),
    certificateFilesByCertificate(ctx, orgId),
    holdersByCertificate(ctx, orgId),
  ]);
  return {
    items: rows.map((r) => dto(r, today, files.get(r.id), holders.get(r.id))),
    today,
  };
}

/** The org's certificates in the shape the pure rules take (pay-app warnings, weekly email). */
export async function certificateInputs(
  ctx: AppContext,
  orgId: string,
): Promise<CertificateInput[]> {
  const [rows, holders] = await Promise.all([rowsOf(ctx, orgId), holdersByCertificate(ctx, orgId)]);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    carrier: r.carrier,
    policyNumber: r.policyNumber,
    expiresOn: r.expiresOn,
    archived: r.archived,
    holderGcs: holdersByGc(holders.get(r.id) ?? []).map((g) => g.gcName),
  }));
}

/** The org's certificates in the shape the requirements check takes (insurance-requirements.ts). */
export async function certificateCoverages(
  ctx: AppContext,
  orgId: string,
): Promise<CertificateCoverage[]> {
  return (await rowsOf(ctx, orgId)).map((r) => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    carrier: r.carrier,
    effectiveOn: r.effectiveOn,
    expiresOn: r.expiresOn,
    archived: r.archived,
    eachOccurrenceCents: r.eachOccurrenceCents,
    aggregateCents: r.aggregateCents,
    additionalInsured: r.additionalInsured,
    waiverOfSubrogation: r.waiverOfSubrogation,
    primaryNoncontributory: r.primaryNoncontributory,
  }));
}

async function getRow(ctx: AppContext, orgId: string, id: string) {
  const row = await ctx.db
    .select()
    .from(insuranceCertificates)
    .where(and(eq(insuranceCertificates.id, id), eq(insuranceCertificates.orgId, orgId)))
    .get();
  if (!row) throw notFound("Insurance certificate");
  return row;
}

export async function createCertificate(
  ctx: AppContext,
  orgId: string,
  userId: string,
  input: CertificateFields,
): Promise<InsuranceCertificateDto> {
  const existing = await ctx.db
    .select({ id: insuranceCertificates.id })
    .from(insuranceCertificates)
    .where(eq(insuranceCertificates.orgId, orgId));
  if (existing.length >= MAX_INSURANCE_CERTIFICATES) {
    throw badRequest(
      `A company can keep up to ${MAX_INSURANCE_CERTIFICATES} certificates. Delete old archived ones first.`,
    );
  }
  const id = newId("ins");
  await ctx.db.insert(insuranceCertificates).values({
    id,
    orgId,
    kind: input.kind,
    label: blank(input.label),
    carrier: blank(input.carrier),
    policyNumber: blank(input.policyNumber),
    effectiveOn: blank(input.effectiveOn),
    expiresOn: input.expiresOn,
    notes: blank(input.notes),
    eachOccurrenceCents: input.eachOccurrenceCents ?? null,
    aggregateCents: input.aggregateCents ?? null,
    additionalInsured: input.additionalInsured ?? false,
    waiverOfSubrogation: input.waiverOfSubrogation ?? false,
    primaryNoncontributory: input.primaryNoncontributory ?? false,
    createdBy: userId,
  });
  return dto(await getRow(ctx, orgId, id), isoDay(ctx.now()));
}

export async function updateCertificate(
  ctx: AppContext,
  orgId: string,
  id: string,
  patch: Partial<CertificateFields> & { archived?: boolean },
): Promise<InsuranceCertificateDto> {
  const row = await getRow(ctx, orgId, id);
  const next = {
    kind: patch.kind ?? row.kind,
    label: patch.label === undefined ? row.label : blank(patch.label),
    carrier: patch.carrier === undefined ? row.carrier : blank(patch.carrier),
    policyNumber: patch.policyNumber === undefined ? row.policyNumber : blank(patch.policyNumber),
    effectiveOn: patch.effectiveOn === undefined ? row.effectiveOn : blank(patch.effectiveOn),
    expiresOn: patch.expiresOn ?? row.expiresOn,
    notes: patch.notes === undefined ? row.notes : blank(patch.notes),
    archived: patch.archived ?? row.archived,
    eachOccurrenceCents:
      patch.eachOccurrenceCents === undefined ? row.eachOccurrenceCents : patch.eachOccurrenceCents,
    aggregateCents: patch.aggregateCents === undefined ? row.aggregateCents : patch.aggregateCents,
    additionalInsured: patch.additionalInsured ?? row.additionalInsured,
    waiverOfSubrogation: patch.waiverOfSubrogation ?? row.waiverOfSubrogation,
    primaryNoncontributory: patch.primaryNoncontributory ?? row.primaryNoncontributory,
  };
  if (next.effectiveOn && next.effectiveOn >= next.expiresOn) {
    throw badRequest("The expiry date must be after the effective date");
  }
  await ctx.db
    .update(insuranceCertificates)
    .set(next)
    .where(and(eq(insuranceCertificates.id, id), eq(insuranceCertificates.orgId, orgId)));
  const [files, holders] = await Promise.all([
    certificateFilesByCertificate(ctx, orgId),
    holdersByCertificate(ctx, orgId),
  ]);
  return dto(await getRow(ctx, orgId, id), isoDay(ctx.now()), files.get(id), holders.get(id));
}

export async function deleteCertificate(ctx: AppContext, orgId: string, id: string) {
  await getRow(ctx, orgId, id);
  await ctx.db
    .delete(insuranceCertificates)
    .where(and(eq(insuranceCertificates.id, id), eq(insuranceCertificates.orgId, orgId)));
  // Its file rows cascaded; the stored objects go too.
  await purgeCertificateFiles(ctx, orgId, id);
}
