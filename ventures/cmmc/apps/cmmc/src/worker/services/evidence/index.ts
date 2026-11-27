// Evidence files in R2. Keys are always `orgs/{orgId}/evidence/{evidenceId}`; the original file name
// lives only in D1 (never in the key, so user input cannot shape the path). Contents are never logged.
// R2 encrypts objects at rest (AES-256) by default; this is NOT a CUI enclave, so every upload must
// carry the uploader's attestation that the file contains no CUI (docs/SECURITY.md).
import { and, desc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { evidence } from "../../db/schema";
import { AppError, badRequest, notFound } from "../../lib/errors";
import { sha256Hex } from "../../lib/hash";
import { newId } from "../../lib/ids";
import { unlinkNetworkDiagram } from "../assets";
import { audit } from "../audit";
import { requireControl } from "../controls";
import { unlinkEvidenceEverywhere } from "../quality";
import { unlinkProviderEvidence } from "../service-providers";

export const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;

/** Allowed upload types. Anything else is refused rather than stored as an opaque blob. */
export const ALLOWED_TYPES: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

export const evidenceKey = (orgId: string, evidenceId: string) =>
  `orgs/${orgId}/evidence/${evidenceId}`;

/** Defence in depth: refuse any key that is not inside the org's prefix. */
export function assertOrgKey(orgId: string, key: string) {
  if (!key.startsWith(`orgs/${orgId}/`) || key.includes("..")) {
    throw new AppError(500, "bad_storage_key", "Storage key outside tenant prefix");
  }
}

/** File names are display-only; strip paths and control characters. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = [...base]
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x20 || code === 0x7f || '"<>|:*?'.includes(ch) ? "_" : ch;
    })
    .join("")
    .trim()
    .slice(0, 200);
  return cleaned || "file";
}

export async function uploadEvidence(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  input: { file: File; title?: string; controlId?: string | null },
) {
  if (input.controlId) requireControl(input.controlId);
  const { file } = input;
  if (file.size === 0) throw badRequest("The file is empty");
  if (file.size > MAX_EVIDENCE_BYTES)
    throw new AppError(413, "too_large", "Evidence files are limited to 25 MB");
  const contentType = (file.type || "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!ALLOWED_TYPES[contentType])
    throw new AppError(
      415,
      "unsupported_type",
      "Upload a PDF, image, text, CSV, DOCX or XLSX file",
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = newId("evd");
  const key = evidenceKey(orgId, id);
  assertOrgKey(orgId, key);
  const sha256 = await sha256Hex(bytes);
  await ctx.files.put(key, bytes, {
    httpMetadata: { contentType },
    customMetadata: { orgId, sha256 },
  });
  const fileName = safeFileName(file.name);
  const row = {
    id,
    orgId,
    controlId: input.controlId ?? null,
    title: input.title?.trim() || fileName,
    fileName,
    contentType,
    sizeBytes: file.size,
    sha256,
    r2Key: key,
    uploadedBy: actorUserId,
    createdAt: ctx.now(),
  };
  await ctx.db.insert(evidence).values(row);
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "evidence.upload",
    targetType: "evidence",
    targetId: id,
  });
  return toDto(row);
}

type EvidenceRow = typeof evidence.$inferSelect;
const toDto = ({ r2Key: _key, ...rest }: EvidenceRow) => rest;

export async function listEvidence(ctx: AppContext, orgId: string, controlId?: string) {
  const where = controlId
    ? and(eq(evidence.orgId, orgId), eq(evidence.controlId, controlId))
    : eq(evidence.orgId, orgId);
  const rows = await ctx.db
    .select()
    .from(evidence)
    .where(where)
    .orderBy(desc(evidence.createdAt))
    .all();
  return rows.map(toDto);
}

async function getRow(ctx: AppContext, orgId: string, id: string) {
  const row = await ctx.db
    .select()
    .from(evidence)
    .where(and(eq(evidence.id, id), eq(evidence.orgId, orgId)))
    .get();
  if (!row) throw notFound("Evidence");
  assertOrgKey(orgId, row.r2Key);
  return row;
}

export async function downloadEvidence(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
) {
  const row = await getRow(ctx, orgId, id);
  const obj = await ctx.files.get(row.r2Key);
  if (!obj) throw notFound("Evidence file");
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "evidence.download",
    targetType: "evidence",
    targetId: id,
  });
  return { row, body: obj.body };
}

export async function deleteEvidence(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
) {
  const row = await getRow(ctx, orgId, id);
  // Links first: the file may also serve the ISO 9001 checklist.
  await unlinkEvidenceEverywhere(ctx, orgId, id);
  // And any service provider whose service description or CRM it was.
  await unlinkProviderEvidence(ctx, orgId, id);
  // And the asset inventory, if it was the network diagram.
  await unlinkNetworkDiagram(ctx, orgId, id);
  await ctx.files.delete(row.r2Key);
  await ctx.db.delete(evidence).where(and(eq(evidence.id, id), eq(evidence.orgId, orgId)));
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "evidence.delete",
    targetType: "evidence",
    targetId: id,
  });
}
