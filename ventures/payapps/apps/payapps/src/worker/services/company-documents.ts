// The company's documents (src/shared/company-documents.ts has the rules): contractor's licenses,
// the W-9, the bonding letter, the safety program, the EMR letter and the like, typed from each
// document, listed with their status on today's date, archived when renewed. Every plan: a GC asks
// any subcontractor for them. Every query filters by org.
import type { CompanyDocumentDto, CompanyDocumentListDto } from "@shared/api/types";
import {
  type CompanyDocumentInput,
  type CompanyDocumentKind,
  documentName,
  documentStatus,
} from "@shared/company-documents";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../context";
import { companyDocuments } from "../db/schema";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { documentFilesByDocument, purgeDocumentFiles } from "./company-document-files";
import type { AttachmentDto } from "./payapps/attachments";
import { isoDay } from "./payapps/cash";

/** Enough for licenses in every state a sub works in, with renewals kept as archived history. */
export const MAX_COMPANY_DOCUMENTS = 200;

type Row = typeof companyDocuments.$inferSelect;

export interface CompanyDocumentFields {
  kind: CompanyDocumentKind;
  label?: string | null;
  issuer?: string | null;
  jurisdiction?: string | null;
  classification?: string | null;
  number?: string | null;
  effectiveOn?: string | null;
  expiresOn?: string | null;
  notes?: string | null;
}

const blank = (v: string | null | undefined) => (v ? v : null);

function dto(row: Row, today: string, files: AttachmentDto[] = []): CompanyDocumentDto {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    issuer: row.issuer,
    jurisdiction: row.jurisdiction,
    classification: row.classification,
    number: row.number,
    effectiveOn: row.effectiveOn,
    expiresOn: row.expiresOn,
    notes: row.notes,
    archived: row.archived,
    name: documentName(row),
    ...documentStatus(row.expiresOn, today),
    files: files.map((f) => ({
      id: f.id,
      fileName: f.fileName,
      contentType: f.contentType,
      sizeBytes: f.sizeBytes,
      category: f.category,
      createdAt: f.createdAt,
    })),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Active first, then archived; each by expiry date with undated ones last, then by name. */
function byListOrder(a: Row, b: Row): number {
  if (a.archived !== b.archived) return a.archived ? 1 : -1;
  if (a.expiresOn !== b.expiresOn) {
    if (!a.expiresOn) return 1;
    if (!b.expiresOn) return -1;
    return a.expiresOn.localeCompare(b.expiresOn);
  }
  return documentName(a).localeCompare(documentName(b));
}

async function rowsOf(ctx: AppContext, orgId: string): Promise<Row[]> {
  const rows = await ctx.db
    .select()
    .from(companyDocuments)
    .where(eq(companyDocuments.orgId, orgId));
  return rows.sort(byListOrder);
}

export async function listCompanyDocuments(
  ctx: AppContext,
  orgId: string,
): Promise<CompanyDocumentListDto> {
  const today = isoDay(ctx.now());
  const [rows, files] = await Promise.all([
    rowsOf(ctx, orgId),
    documentFilesByDocument(ctx, orgId),
  ]);
  return { items: rows.map((r) => dto(r, today, files.get(r.id))), today };
}

/** The org's documents in the shape the pure rules take. */
export async function companyDocumentInputs(
  ctx: AppContext,
  orgId: string,
): Promise<CompanyDocumentInput[]> {
  return (await rowsOf(ctx, orgId)).map((r) => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    issuer: r.issuer,
    jurisdiction: r.jurisdiction,
    classification: r.classification,
    number: r.number,
    effectiveOn: r.effectiveOn,
    expiresOn: r.expiresOn,
    archived: r.archived,
  }));
}

async function getRow(ctx: AppContext, orgId: string, id: string) {
  const row = await ctx.db
    .select()
    .from(companyDocuments)
    .where(and(eq(companyDocuments.id, id), eq(companyDocuments.orgId, orgId)))
    .get();
  if (!row) throw notFound("Company document");
  return row;
}

function checkFields(v: {
  kind: CompanyDocumentKind;
  number: string | null;
  effectiveOn: string | null;
  expiresOn: string | null;
}) {
  if (v.kind === "w9" && v.number) {
    throw badRequest(
      "PayApps does not keep a W-9's taxpayer identification number: leave the number blank",
    );
  }
  if (v.effectiveOn && v.expiresOn && v.effectiveOn >= v.expiresOn) {
    throw badRequest("The expiry date must be after the effective date");
  }
}

export async function createCompanyDocument(
  ctx: AppContext,
  orgId: string,
  userId: string,
  input: CompanyDocumentFields,
): Promise<CompanyDocumentDto> {
  const existing = await ctx.db
    .select({ id: companyDocuments.id })
    .from(companyDocuments)
    .where(eq(companyDocuments.orgId, orgId));
  if (existing.length >= MAX_COMPANY_DOCUMENTS) {
    throw badRequest(
      `A company can keep up to ${MAX_COMPANY_DOCUMENTS} documents. Delete old archived ones first.`,
    );
  }
  const values = {
    kind: input.kind,
    label: blank(input.label),
    issuer: blank(input.issuer),
    jurisdiction: blank(input.jurisdiction),
    classification: blank(input.classification),
    number: blank(input.number),
    effectiveOn: blank(input.effectiveOn),
    expiresOn: blank(input.expiresOn),
    notes: blank(input.notes),
  };
  checkFields(values);
  const id = newId("cdoc");
  await ctx.db.insert(companyDocuments).values({ id, orgId, ...values, createdBy: userId });
  return dto(await getRow(ctx, orgId, id), isoDay(ctx.now()));
}

export async function updateCompanyDocument(
  ctx: AppContext,
  orgId: string,
  id: string,
  patch: Partial<CompanyDocumentFields> & { archived?: boolean },
): Promise<CompanyDocumentDto> {
  const row = await getRow(ctx, orgId, id);
  const pick = (k: keyof Omit<CompanyDocumentFields, "kind">) =>
    patch[k] === undefined ? row[k] : blank(patch[k]);
  const next = {
    kind: patch.kind ?? row.kind,
    label: pick("label"),
    issuer: pick("issuer"),
    jurisdiction: pick("jurisdiction"),
    classification: pick("classification"),
    number: pick("number"),
    effectiveOn: pick("effectiveOn"),
    expiresOn: pick("expiresOn"),
    notes: pick("notes"),
    archived: patch.archived ?? row.archived,
  };
  checkFields(next);
  if (
    next.kind === "w9" &&
    row.kind !== "w9" &&
    (await documentFilesByDocument(ctx, orgId)).has(id)
  ) {
    // A W-9's files need the taxpayer-ID consent given at upload; a change of kind would skip it.
    throw badRequest("Delete this document's files before changing it to a W-9");
  }
  await ctx.db
    .update(companyDocuments)
    .set(next)
    .where(and(eq(companyDocuments.id, id), eq(companyDocuments.orgId, orgId)));
  const files = (await documentFilesByDocument(ctx, orgId)).get(id);
  return dto(await getRow(ctx, orgId, id), isoDay(ctx.now()), files);
}

export async function deleteCompanyDocument(ctx: AppContext, orgId: string, id: string) {
  await getRow(ctx, orgId, id);
  await ctx.db
    .delete(companyDocuments)
    .where(and(eq(companyDocuments.id, id), eq(companyDocuments.orgId, orgId)));
  // Its file rows cascade in D1; the objects go here.
  await purgeDocumentFiles(ctx, orgId, id);
}
