// Repeat parts (src/shared/repeat-parts.ts): the shop's earlier quotes of a line's part number, and
// copying one's cost inputs onto a draft line. Every query is scoped by orgId; the source line must
// belong to the same shop, so another shop's line id is a 404, never its inputs.
import type { PartHistoryDto, PartHistoryItemDto, RfqPartHistoryDto } from "@shared/api";
import {
  copyInputs,
  isLookupablePartNumber,
  MAX_PART_HISTORY,
  type PrefillCandidate,
  partNumberKey,
  sameRevision,
} from "@shared/repeat-parts";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { machines, materials, quoteLines, quotes, rfqFiles, rfqParts, rfqs } from "../../db/schema";
import { notFound } from "../../lib/errors";
import { updateLine } from "./index";

async function getLine(ctx: AppContext, orgId: string, quoteId: string, lineId: string) {
  const line = await ctx.db
    .select()
    .from(quoteLines)
    .where(
      and(eq(quoteLines.id, lineId), eq(quoteLines.quoteId, quoteId), eq(quoteLines.orgId, orgId)),
    )
    .get();
  if (!line) throw notFound("Quote line");
  return line;
}

/** Earlier quotes (any status, other than this one) of this line's part number, newest first. */
export async function partHistory(
  ctx: AppContext,
  orgId: string,
  quoteId: string,
  lineId: string,
): Promise<PartHistoryDto> {
  const line = await getLine(ctx, orgId, quoteId, lineId);
  return {
    partNumber: line.partNumber,
    items: await historyForPart(ctx, orgId, line, quoteId),
  };
}

/**
 * The RFQ review screen's history (repeat parts, part 2): each part's earlier quotes before a quote
 * exists. The RFQ must be the shop's own; a part with a blank part number is left out.
 */
export async function rfqPartHistory(
  ctx: AppContext,
  orgId: string,
  rfqId: string,
): Promise<RfqPartHistoryDto> {
  const rfq = await ctx.db
    .select({ id: rfqs.id })
    .from(rfqs)
    .where(and(eq(rfqs.id, rfqId), eq(rfqs.orgId, orgId)))
    .get();
  if (!rfq) throw notFound("RFQ");
  const parts = await ctx.db
    .select({
      id: rfqParts.id,
      partNumber: rfqParts.partNumber,
      revision: rfqParts.revision,
    })
    .from(rfqParts)
    .where(and(eq(rfqParts.orgId, orgId), eq(rfqParts.rfqId, rfqId)))
    .orderBy(asc(rfqParts.position))
    .all();
  const out: RfqPartHistoryDto = { parts: [] };
  for (const p of parts) {
    if (!p.partNumber || !isLookupablePartNumber(p.partNumber)) continue;
    const items = await historyForPart(
      ctx,
      orgId,
      { partNumber: p.partNumber, revision: p.revision },
      null,
    );
    out.parts.push({ rfqPartId: p.id, partNumber: p.partNumber, items });
  }
  return out;
}

/** The shop's earlier quotes of a part number (excluding one quote), newest first, at most 10. */
async function historyForPart(
  ctx: AppContext,
  orgId: string,
  part: { partNumber: string; revision: string | null },
  excludeQuoteId: string | null,
): Promise<PartHistoryItemDto[]> {
  if (!isLookupablePartNumber(part.partNumber)) return [];
  const key = partNumberKey(part.partNumber);
  const rows = await ctx.db
    .select({ line: quoteLines, quote: quotes })
    .from(quoteLines)
    .innerJoin(quotes, and(eq(quotes.id, quoteLines.quoteId), eq(quotes.orgId, orgId)))
    .where(
      and(
        eq(quoteLines.orgId, orgId),
        excludeQuoteId ? ne(quoteLines.quoteId, excludeQuoteId) : undefined,
        // Narrowed in SQL by trim + upper case (ASCII, like most part numbers); partNumberKey
        // decides below, so inner runs of spaces compare the same way everywhere.
        eq(sql`upper(trim(${quoteLines.partNumber}))`, key),
      ),
    )
    .orderBy(desc(sql`coalesce(${quotes.sentAt}, ${quotes.createdAt})`), desc(quotes.quoteNumber))
    .limit(MAX_PART_HISTORY * 2)
    .all();
  const matches = rows.filter((r) => partNumberKey(r.line.partNumber) === key);
  if (matches.length === 0) return [];

  // Names for lines that never priced (no snapshot), and which machines are retired: the shop's
  // own rows, retired ones included.
  const [machineRows, materialRows] = await Promise.all([
    ctx.db
      .select({ id: machines.id, name: machines.name, active: machines.active })
      .from(machines)
      .where(eq(machines.orgId, orgId))
      .all(),
    ctx.db
      .select({ id: materials.id, name: materials.name })
      .from(materials)
      .where(eq(materials.orgId, orgId))
      .all(),
  ]);
  // The earlier quotes' RFQ files, so a part won at another revision can be checked drawing
  // against drawing (repeat parts, part 4). At most MAX_PART_HISTORY RFQ ids; the shop's own rows.
  const shown = matches.slice(0, MAX_PART_HISTORY);
  const rfqIds = [...new Set(shown.map((r) => r.quote.rfqId).filter((id): id is string => !!id))];
  const fileRows =
    rfqIds.length === 0
      ? []
      : await ctx.db
          .select({ id: rfqFiles.id, rfqId: rfqFiles.rfqId, fileName: rfqFiles.fileName })
          .from(rfqFiles)
          .where(and(eq(rfqFiles.orgId, orgId), inArray(rfqFiles.rfqId, rfqIds)))
          .orderBy(asc(rfqFiles.createdAt), asc(rfqFiles.id))
          .all();
  const filesByRfq = new Map<string, { id: string; fileName: string }[]>();
  for (const f of fileRows) {
    const list = filesByRfq.get(f.rfqId) ?? [];
    list.push({ id: f.id, fileName: f.fileName });
    filesByRfq.set(f.rfqId, list);
  }
  const machineName = new Map(machineRows.map((m) => [m.id, m.name]));
  const activeMachine = new Set(machineRows.filter((m) => m.active).map((m) => m.id));
  const materialName = new Map(materialRows.map((m) => [m.id, m.name]));

  return shown.map(({ line: l, quote: q }) => {
    const snapMachines = new Map(l.snapshot?.machines.map((m) => [m.id, m.name]) ?? []);
    const snapMaterials = new Map(l.snapshot?.materials.map((m) => [m.id, m.name]) ?? []);
    const matId = l.inputs.material?.materialId ?? null;
    const item: PartHistoryItemDto = {
      lineId: l.id,
      quoteId: q.id,
      quoteNumber: q.quoteNumber,
      revNumber: q.revNumber,
      status: q.status,
      customerCompany: q.customerCompany,
      quotedAt: (q.sentAt ?? q.createdAt).toISOString(),
      revision: l.revision,
      sameRevision: sameRevision(l.revision, part.revision),
      description: l.description,
      breaks: (l.breaks ?? []).map((b) => ({
        quantity: b.quantity,
        unitPriceCents: b.unitPriceCents,
      })),
      operations: l.inputs.operations.map((o) => ({
        machine: snapMachines.get(o.machineId) ?? machineName.get(o.machineId) ?? "Unknown machine",
        setupMinutes: o.setupMinutes,
        cycleMinutesPerPart: o.cycleMinutesPerPart,
        retired: !activeMachine.has(o.machineId),
      })),
      material: matId
        ? (snapMaterials.get(matId) ?? materialName.get(matId) ?? "Unknown material")
        : l.inputs.customerSuppliedMaterial
          ? "Customer-supplied"
          : null,
      poNumber: q.status === "won" ? q.poNumber : null,
      lostReason: q.status === "lost" ? q.lostReason : null,
      rfqId: q.rfqId,
      rfqFiles: q.rfqId ? (filesByRfq.get(q.rfqId) ?? []) : [],
    };
    return item;
  });
}

/** Part numbers per won-lines query (D1 allows 100 bound parameters; two more are used). */
const PREFILL_KEYS_PER_QUERY = 50;

/**
 * Pre-fill sources for a new quote (repeat parts, part 2): the shop's won lines whose part number
 * matches one of these, as candidates for `pickPrefillSource`. One query; scoped by orgId.
 */
export async function wonLinesForParts(
  ctx: AppContext,
  orgId: string,
  partNumbers: readonly (string | null)[],
): Promise<PrefillCandidate[]> {
  const keys = [
    ...new Set(
      partNumbers
        .filter((p): p is string => !!p && isLookupablePartNumber(p))
        .map((p) => partNumberKey(p)),
    ),
  ];
  if (keys.length === 0) return [];
  // D1 caps bound parameters per query, and an RFQ's part count is not capped: chunk the keys.
  const rows: { line: typeof quoteLines.$inferSelect; quote: typeof quotes.$inferSelect }[] = [];
  for (let i = 0; i < keys.length; i += PREFILL_KEYS_PER_QUERY) {
    const chunk = keys.slice(i, i + PREFILL_KEYS_PER_QUERY);
    rows.push(
      ...(await ctx.db
        .select({ line: quoteLines, quote: quotes })
        .from(quoteLines)
        .innerJoin(quotes, and(eq(quotes.id, quoteLines.quoteId), eq(quotes.orgId, orgId)))
        .where(
          and(
            eq(quoteLines.orgId, orgId),
            eq(quotes.status, "won"),
            inArray(sql`upper(trim(${quoteLines.partNumber}))`, chunk),
          ),
        )
        .orderBy(desc(sql`coalesce(${quotes.decidedAt}, ${quotes.sentAt}, ${quotes.createdAt})`))
        .limit(500)
        .all()),
    );
  }
  return rows.map(({ line: l, quote: q }) => ({
    lineId: l.id,
    quoteId: q.id,
    quoteNumber: q.quoteNumber,
    revNumber: q.revNumber,
    customerCompany: q.customerCompany,
    partNumber: l.partNumber,
    revision: l.revision,
    wonAt: q.decidedAt,
    decidedAt: q.decidedAt ?? q.sentAt ?? q.createdAt,
    inputs: l.inputs,
  }));
}

/**
 * Copy an earlier line's cost inputs onto a draft line: this line keeps its quantities, part number,
 * revision and description, and is priced from today's rate card (services/quotes updateLine). The
 * source may be on any quote of the same shop, sent or not.
 */
export async function copyLineFrom(
  ctx: AppContext,
  orgId: string,
  quoteId: string,
  lineId: string,
  sourceLineId: string,
) {
  const line = await getLine(ctx, orgId, quoteId, lineId);
  const source = await ctx.db
    .select({ inputs: quoteLines.inputs })
    .from(quoteLines)
    .where(and(eq(quoteLines.id, sourceLineId), eq(quoteLines.orgId, orgId)))
    .get();
  if (!source || sourceLineId === lineId) throw notFound("Earlier quote line");
  return updateLine(
    ctx,
    orgId,
    quoteId,
    lineId,
    { inputs: copyInputs(source.inputs, line.inputs) },
    // Copying from another line than the one the label names makes the label untrue.
    { dropPrefillLabel: line.prefilledFrom?.lineId !== sourceLineId },
  );
}
