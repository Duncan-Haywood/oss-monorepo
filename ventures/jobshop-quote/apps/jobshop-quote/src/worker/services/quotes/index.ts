// Quotes: create from an RFQ's confirmed parts, edit line cost inputs (priced by the deterministic
// engine from the shop's rate card), cover note (LLM explains, grounding-checked), send (PDF frozen in
// R2 with its SHA-256), and the quote log with won/lost. Every query is scoped by orgId.
import type { QuoteDetailDto, QuoteDto, QuoteLineDto, QuoteStatsDto } from "@shared/api";
import {
  blankFromBoundingBox,
  blankFromFlatPattern,
  type CostInputs,
  computeCost,
  costInputsSchema,
  type DrillingMachine,
  type MaterialCutSpeed,
  type MaterialDrillFeed,
  type MaterialRemovalRate,
  type RateCard,
  type RoughingMachine,
  type SheetMetalMachine,
  suggestBendingOperation,
  suggestCuttingOperation,
  suggestDrillingOperation,
  suggestRoughingOperation,
  suggestTappingOperation,
  type TappingMachine,
} from "@shared/costing";
import {
  type CoverNoteFacts,
  coverNoteContext,
  coverNoteProblem,
  templateCoverNote,
} from "@shared/cover-note";
import { QUOTE_STATUSES, type QuoteStatus } from "@shared/enums";
import { DEFAULT_FOLLOW_UP_DAYS, firstFollowUpOn } from "@shared/follow-up";
import {
  canSuggestBlank,
  flatBlankMeasures,
  flatMeasures,
  holeLocationMeasures,
} from "@shared/geometry";
import { partsPerSheetFromNest, type SheetStock, sheetStockOf } from "@shared/nest";
import { customerChangeSummary } from "@shared/quote-change-summary";
import { isRevisable, REVISABLE_STATUSES } from "@shared/quote-label";
import {
  copyInputs,
  type PrefillSource,
  pickPrefillSource,
  prefillLabelStale,
  prefillSource,
  shouldPrefillOnSave,
} from "@shared/repeat-parts";
import { addDays, shopDay } from "@shared/time-zone";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  machines,
  materials,
  quoteLines,
  quotes,
  rfqFiles,
  rfqParts,
  rfqs,
  routings,
  shopSettings,
} from "../../db/schema";
import { AppError, conflict, notFound } from "../../lib/errors";
import { sha256Hex } from "../../lib/hash";
import { newId } from "../../lib/ids";
import { validationError } from "../../lib/validate";
import {
  getRateCardDto,
  getSettings,
  listCutSpeeds,
  listDrillFeeds,
  listRemovalRates,
  loadRateCard,
} from "../ratecard";
import { logoForPdf } from "../ratecard/logo";
import { quoteChanges } from "./changes";
import { wonLinesForParts } from "./history";
import { type PdfChanges, quoteFileLabel, quoteLabel, renderQuotePdf } from "./pdf";
import { COVER_NOTE_SYSTEM, coverNotePrompt } from "./prompts";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** The last day a quote written now stays good: the shop's today plus its quoteValidDays. */
export const validUntilFrom = (
  now: Date,
  settings: { quoteValidDays: number; timeZone: string | null },
) => addDays(shopDay(now, settings.timeZone), settings.quoteValidDays);

function quoteDto(q: typeof quotes.$inferSelect): QuoteDto {
  return {
    id: q.id,
    rfqId: q.rfqId,
    quoteNumber: q.quoteNumber,
    revNumber: q.revNumber,
    supersedesQuoteId: q.supersedesQuoteId,
    supersededByQuoteId: q.supersededByQuoteId,
    status: q.status,
    customerCompany: q.customerCompany,
    customerContact: q.customerContact,
    customerEmail: q.customerEmail,
    leadTimeText: q.leadTimeText,
    validUntil: q.validUntil,
    notes: q.notes,
    coverNote: q.coverNote,
    coverNoteSource: q.coverNoteSource,
    showChangesOnPdf: q.showChangesOnPdf,
    headlineTotalCents: q.headlineTotalCents,
    sentAt: q.sentAt?.toISOString() ?? null,
    sentPdfSha256: q.sentPdfSha256,
    decidedAt: q.decidedAt?.toISOString() ?? null,
    lostReason: q.lostReason,
    poNumber: q.poNumber,
    wonAmountCents: q.wonAmountCents,
    followUpOn: q.followUpOn,
    createdAt: q.createdAt.toISOString(),
  };
}

function lineDto(l: typeof quoteLines.$inferSelect): QuoteLineDto {
  return {
    id: l.id,
    position: l.position,
    rfqPartId: l.rfqPartId,
    partNumber: l.partNumber,
    revision: l.revision,
    description: l.description,
    inputs: l.inputs,
    breaks: l.breaks,
    basis: l.basis,
    issues: l.issues,
    snapshot: l.snapshot,
    prefilledFrom: l.prefilledFrom,
    routingIds: l.routingIds,
  };
}

/** Parse untrusted cost inputs into the engine's schema (400 with zod issues on failure). */
export function parseInputs(raw: unknown): CostInputs {
  const r = costInputsSchema.safeParse(raw);
  if (!r.success) throw validationError(r.error.issues);
  return r.data;
}

/** Price inputs against a rate card: the columns a quote line stores. */
export function priceLine(card: RateCard, inputs: CostInputs) {
  const out = computeCost(card, inputs);
  return out.ok
    ? {
        breaks: out.result.breaks,
        basis: out.result.basis,
        issues: [],
        snapshot: out.result.snapshot,
      }
    : { breaks: null, basis: [], issues: out.issues, snapshot: null };
}

async function getQuoteRow(ctx: AppContext, orgId: string, quoteId: string) {
  const q = await ctx.db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId)))
    .get();
  if (!q) throw notFound("Quote");
  return q;
}

async function getDraft(ctx: AppContext, orgId: string, quoteId: string) {
  const q = await getQuoteRow(ctx, orgId, quoteId);
  if (q.status !== "draft") throw conflict("This quote was sent and can no longer be edited");
  return q;
}

/** SQL guard for writes to a quote's lines: the quote is (still) a draft of this org. */
const quoteIsDraft = (orgId: string, quoteId: string) =>
  sql`exists (select 1 from ${quotes} where ${quotes.id} = ${quoteId} and ${quotes.orgId} = ${orgId} and ${quotes.status} = 'draft')`;

/** Bumps the draft's revision; affects no row once the quote was sent. */
const bumpRevision = (ctx: AppContext, orgId: string, quoteId: string) =>
  ctx.db
    .update(quotes)
    .set({ revision: sql`${quotes.revision} + 1` })
    .where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId), eq(quotes.status, "draft")))
    .returning({ id: quotes.id });

const sentConflict = () => conflict("This quote was sent and can no longer be edited");

export async function getQuote(
  ctx: AppContext,
  orgId: string,
  quoteId: string,
): Promise<QuoteDetailDto> {
  const q = await getQuoteRow(ctx, orgId, quoteId);
  const lines = await ctx.db
    .select()
    .from(quoteLines)
    .where(and(eq(quoteLines.orgId, orgId), eq(quoteLines.quoteId, quoteId)))
    .orderBy(asc(quoteLines.position), asc(quoteLines.createdAt))
    .all();
  return { ...quoteDto(q), lines: lines.map(lineDto) };
}

/** Next quote number for the shop, allocated atomically. */
async function allocateQuoteNumber(ctx: AppContext, orgId: string): Promise<number> {
  const [row] = await ctx.db
    .update(shopSettings)
    .set({ nextQuoteNumber: sql`${shopSettings.nextQuoteNumber} + 1` })
    .where(eq(shopSettings.orgId, orgId))
    .returning({ next: shopSettings.nextQuoteNumber });
  if (!row) throw notFound("Shop settings");
  return row.next - 1;
}

async function refreshHeadline(ctx: AppContext, orgId: string, quoteId: string) {
  const lines = await ctx.db
    .select({ breaks: quoteLines.breaks })
    .from(quoteLines)
    .where(and(eq(quoteLines.orgId, orgId), eq(quoteLines.quoteId, quoteId)))
    .all();
  const priced = lines.length > 0 && lines.every((l) => l.breaks?.[0]);
  const total = priced ? lines.reduce((s, l) => s + (l.breaks?.[0]?.totalCents ?? 0), 0) : null;
  await ctx.db
    .update(quotes)
    .set({ headlineTotalCents: total })
    .where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId), eq(quotes.status, "draft")));
}

export async function createQuote(
  ctx: AppContext,
  orgId: string,
  userId: string,
  input: { rfqId: string | null; customerCompany?: string | undefined },
) {
  const settings = await getSettings(ctx, orgId);
  const card = await loadRateCard(ctx, orgId);
  let rfq: typeof rfqs.$inferSelect | undefined;
  let parts: (typeof rfqParts.$inferSelect)[] = [];
  const geometryByFile = new Map<string, NonNullable<(typeof rfqFiles.$inferSelect)["geometry"]>>();
  if (input.rfqId) {
    rfq = await ctx.db
      .select()
      .from(rfqs)
      .where(and(eq(rfqs.id, input.rfqId), eq(rfqs.orgId, orgId)))
      .get();
    if (!rfq) throw notFound("RFQ");
    parts = await ctx.db
      .select()
      .from(rfqParts)
      .where(
        and(eq(rfqParts.orgId, orgId), eq(rfqParts.rfqId, rfq.id), eq(rfqParts.confirmed, true)),
      )
      .orderBy(asc(rfqParts.position))
      .all();
    if (parts.length === 0) {
      throw conflict("Review and confirm at least one part before quoting");
    }
    const files = await ctx.db
      .select({ id: rfqFiles.id, geometry: rfqFiles.geometry })
      .from(rfqFiles)
      .where(and(eq(rfqFiles.orgId, orgId), eq(rfqFiles.rfqId, rfq.id)))
      .all();
    for (const f of files) if (f.geometry) geometryByFile.set(f.id, f.geometry);
  }
  const roughingMachines: (RoughingMachine &
    SheetMetalMachine &
    DrillingMachine &
    TappingMachine)[] =
    geometryByFile.size > 0
      ? await ctx.db
          .select({
            id: machines.id,
            name: machines.name,
            defaultSetupMinutes: machines.defaultSetupMinutes,
            removalRateIn3PerMin: machines.removalRateIn3PerMin,
            cutSpeedInPerMin: machines.cutSpeedInPerMin,
            pierceSeconds: machines.pierceSeconds,
            secondsPerBend: machines.secondsPerBend,
            secondsPerHole: machines.secondsPerHole,
            drillFeedInPerMin: machines.drillFeedInPerMin,
            secondsPerTappedHole: machines.secondsPerTappedHole,
            peckDepthDiameters: machines.peckDepthDiameters,
            secondsPerPeck: machines.secondsPerPeck,
          })
          .from(machines)
          .where(and(eq(machines.orgId, orgId), eq(machines.active, true)))
          .all()
      : [];
  // Sheet and plate materials the shop gave a thickness: a DXF flat pattern sizes their blank.
  const sheetThickness = new Map<string, number>();
  // Per-sheet materials with a sheet size and nest gap: a DXF part's parts per sheet from a nest.
  const sheetStock = new Map<string, SheetStock>();
  const materialNames = new Map<string, string>();
  let speedsByMaterial: MaterialCutSpeed[] = [];
  let ratesByMaterial: MaterialRemovalRate[] = [];
  let feedsByMaterial: MaterialDrillFeed[] = [];
  if (geometryByFile.size > 0) {
    const rows = await ctx.db
      .select({
        id: materials.id,
        name: materials.name,
        sheetThicknessIn: materials.sheetThicknessIn,
        pricingBasis: materials.pricingBasis,
        sheetWidthIn: materials.sheetWidthIn,
        sheetLengthIn: materials.sheetLengthIn,
        nestGapIn: materials.nestGapIn,
      })
      .from(materials)
      .where(eq(materials.orgId, orgId))
      .all();
    for (const r of rows) {
      materialNames.set(r.id, r.name);
      if (r.sheetThicknessIn) sheetThickness.set(r.id, r.sheetThicknessIn);
      const stock = r.pricingBasis === "per_stock" ? sheetStockOf(r) : null;
      if (stock) sheetStock.set(r.id, stock);
    }
    // Cut speed per material and thickness (rate card): overrides a machine's default cut speed.
    speedsByMaterial = await listCutSpeeds(ctx, orgId);
    // Removal rate per material (rate card): overrides a roughing machine's default rate.
    ratesByMaterial = await listRemovalRates(ctx, orgId);
    // Drill feed per material (rate card): overrides a drilling machine's default feed.
    feedsByMaterial = await listDrillFeeds(ctx, orgId);
  }
  const customerCompany =
    input.customerCompany?.trim() || rfq?.customerCompany || rfq?.customerEmail || "Customer";
  // Repeat parts, part 2 (opt-in per shop): a part the shop has won before, same part number and
  // revision, starts from that won line's inputs, priced from today's rate card like any copy.
  const wonLines = settings.prefillRepeatParts
    ? await wonLinesForParts(
        ctx,
        orgId,
        parts.map((p) => p.partNumber),
      )
    : [];
  const quoteId = newId("quo");
  const quoteNumber = await allocateQuoteNumber(ctx, orgId);
  const validUntil = validUntilFrom(ctx.now(), settings);
  const lineRows = parts.map((p, i) => {
    const quantities = p.quantities.length > 0 ? p.quantities : settings.defaultQuantities;
    const won = pickPrefillSource(p, wonLines);
    if (won) {
      const inputs = copyInputs(won.inputs, { quantities });
      return {
        id: newId("qln"),
        orgId,
        quoteId,
        rfqPartId: p.id,
        position: i,
        partNumber: p.partNumber || `Part ${i + 1}`,
        revision: p.revision,
        description: p.description,
        inputs,
        prefilledFrom: prefillSource(won),
        // The won line's routing record comes with its inputs (win/loss by routing).
        routingIds: won.routingIds,
        ...priceLine(card, inputs),
      };
    }
    const geometry = p.geometryFileId ? geometryByFile.get(p.geometryFileId) : undefined;
    // CAD suggestions (the estimator edits them): a blank from a solid's bounding box, and a roughing
    // operation from the volume removed when the shop has measured one machine's removal rate.
    // A DXF flat pattern: the flat size times the sheet thickness on the chosen material's row.
    const flatBlank = geometry ? flatBlankMeasures(geometry) : null;
    const blank =
      geometry && canSuggestBlank(geometry)
        ? blankFromBoundingBox(geometry.boundingBoxIn)
        : flatBlank && p.materialId
          ? blankFromFlatPattern(flatBlank, sheetThickness.get(p.materialId) ?? null)
          : null;
    const cutMaterial = p.materialId
      ? { id: p.materialId, name: materialNames.get(p.materialId) ?? "this material" }
      : null;
    const rough =
      geometry && p.materialId
        ? suggestRoughingOperation(
            {
              volumeIn3: geometry.volumeIn3,
              volumeConfidence: geometry.confidence?.volume ?? null,
            },
            blank,
            roughingMachines,
            cutMaterial,
            ratesByMaterial,
          )
        : null;
    // A DXF flat pattern: a cutting operation from the cut length and pierces, and a bending one
    // from the bend lines, each only when exactly one machine has the shop's rate for it.
    const flat = geometry ? flatMeasures(geometry) : null;
    const cut = flat
      ? suggestCuttingOperation(flat, roughingMachines, cutMaterial, speedsByMaterial)
      : null;
    const bend = flat ? suggestBendingOperation(flat, roughingMachines) : null;
    // A STEP solid: a drilling operation from its hole locations, when one machine has a time per
    // hole or a feed (the line material's feed first); on the roughing machine it shares that
    // operation's setup.
    const holes = geometry ? holeLocationMeasures(geometry) : null;
    const drill = holes
      ? suggestDrillingOperation(
          holes,
          roughingMachines,
          rough ? [rough.machineId] : [],
          cutMaterial,
          feedsByMaterial,
        )
      : null;
    // Tapping: the hole sizes the estimator marked threaded on the RFQ (STEP rarely says), at the
    // one machine with a time per tapped hole; it shares a setup with roughing or drilling there.
    const tap = holes
      ? suggestTappingOperation(
          holes,
          p.tappedHoleDiametersIn,
          roughingMachines,
          [rough?.machineId, drill?.machineId].filter((id): id is string => !!id),
        )
      : null;
    const inputs: CostInputs = {
      quantities,
      customerSuppliedMaterial: false,
      material: p.materialId
        ? {
            materialId: p.materialId,
            blank,
            partsPerStock: partsPerSheetFromNest(flatBlank, sheetStock.get(p.materialId)),
          }
        : null,
      operations: [rough, drill, tap, cut, bend].filter(
        (o): o is NonNullable<typeof o> => o !== null,
      ),
      // The shop's default fallout (rate card settings); the estimator changes it per line.
      ...(settings.defaultFalloutBps ? { falloutBps: settings.defaultFalloutBps } : {}),
      finishing: p.finishingOpIds.map((opId) => ({ opId })),
      extras: [],
    };
    return {
      id: newId("qln"),
      orgId,
      quoteId,
      rfqPartId: p.id,
      position: i,
      partNumber: p.partNumber || `Part ${i + 1}`,
      revision: p.revision,
      description: p.description,
      inputs,
      prefilledFrom: null,
      ...priceLine(card, inputs),
    };
  });
  await ctx.db.batch([
    ctx.db.insert(quotes).values({
      id: quoteId,
      orgId,
      rfqId: rfq?.id ?? null,
      quoteNumber,
      customerCompany,
      customerContact: rfq?.customerContact ?? null,
      customerEmail: rfq?.customerEmail ?? null,
      leadTimeText: settings.defaultLeadTimeText,
      validUntil,
      createdBy: userId,
    }),
    ...lineRows.map((l) => ctx.db.insert(quoteLines).values(l)),
  ]);
  await refreshHeadline(ctx, orgId, quoteId);
  return getQuote(ctx, orgId, quoteId);
}

export async function listQuotes(ctx: AppContext, orgId: string, status?: string) {
  const valid = status && (QUOTE_STATUSES as readonly string[]).includes(status);
  const rows = await ctx.db
    .select()
    .from(quotes)
    .where(
      valid
        ? and(eq(quotes.orgId, orgId), eq(quotes.status, status as QuoteStatus))
        : eq(quotes.orgId, orgId),
    )
    .orderBy(desc(quotes.quoteNumber))
    .limit(500)
    .all();
  return rows.map(quoteDto);
}

export async function updateQuote(
  ctx: AppContext,
  orgId: string,
  quoteId: string,
  patch: Partial<
    Pick<
      typeof quotes.$inferInsert,
      | "customerCompany"
      | "customerContact"
      | "customerEmail"
      | "leadTimeText"
      | "validUntil"
      | "notes"
      | "coverNote"
      | "showChangesOnPdf"
    >
  >,
) {
  await getDraft(ctx, orgId, quoteId);
  const set = { ...patch, ...(patch.coverNote !== undefined ? { coverNoteSource: "user" } : {}) };
  if (Object.keys(set).length > 0) {
    const res = await ctx.db
      .update(quotes)
      .set({ ...set, revision: sql`${quotes.revision} + 1` })
      .where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId), eq(quotes.status, "draft")))
      .returning({ id: quotes.id });
    if (res.length === 0) throw sentConflict();
  }
  return getQuote(ctx, orgId, quoteId);
}

/**
 * Repeat parts, part 3: a line added by hand (or given its part number later) starts from the last
 * won line of the same part number and revision, like a line made from an RFQ (opt-in per shop). It
 * keeps this line's quantities and is priced from today's rate card by the caller. Null when the
 * shop has not opted in or nothing matches.
 */
async function prefillHandLine(
  ctx: AppContext,
  orgId: string,
  part: { partNumber: string; revision: string | null },
  inputs: CostInputs,
): Promise<{
  inputs: CostInputs;
  prefilledFrom: PrefillSource;
  routingIds: string[] | null;
} | null> {
  const settings = await getSettings(ctx, orgId);
  if (!settings.prefillRepeatParts) return null;
  const won = pickPrefillSource(part, await wonLinesForParts(ctx, orgId, [part.partNumber]));
  if (!won) return null;
  return {
    inputs: copyInputs(won.inputs, inputs),
    prefilledFrom: prefillSource(won),
    routingIds: won.routingIds,
  };
}

export async function addLine(
  ctx: AppContext,
  orgId: string,
  quoteId: string,
  input: {
    partNumber: string;
    revision: string | null;
    description: string | null;
    inputs: unknown;
  },
) {
  await getDraft(ctx, orgId, quoteId);
  const typed = parseInputs(input.inputs);
  const prefill = shouldPrefillOnSave(
    { partNumber: "", prefilled: false },
    { partNumber: input.partNumber, inputs: typed },
  )
    ? await prefillHandLine(ctx, orgId, input, typed)
    : null;
  const inputs = prefill?.inputs ?? typed;
  const card = await loadRateCard(ctx, orgId);
  const existing = await ctx.db
    .select({ position: quoteLines.position })
    .from(quoteLines)
    .where(and(eq(quoteLines.orgId, orgId), eq(quoteLines.quoteId, quoteId)))
    .all();
  const lineId = newId("qln");
  const [, bumped] = await ctx.db.batch([
    ctx.db.insert(quoteLines).values({
      id: lineId,
      orgId,
      quoteId,
      position: Math.max(-1, ...existing.map((e) => e.position)) + 1,
      partNumber: input.partNumber,
      revision: input.revision,
      description: input.description,
      inputs,
      prefilledFrom: prefill?.prefilledFrom ?? null,
      routingIds: prefill?.routingIds ?? null,
      ...priceLine(card, inputs),
    }),
    bumpRevision(ctx, orgId, quoteId),
  ]);
  if (bumped.length === 0) {
    // Sent in the meantime: take the line back out.
    await ctx.db
      .delete(quoteLines)
      .where(and(eq(quoteLines.id, lineId), eq(quoteLines.orgId, orgId)));
    throw sentConflict();
  }
  await refreshHeadline(ctx, orgId, quoteId);
  return getQuote(ctx, orgId, quoteId);
}

/**
 * The ids from `ids` that are this shop's saved routings, deduplicated, in the order given; null
 * stays null (no record). One query, scoped by orgId, so a line can never name another shop's
 * routing.
 */
export async function shopRoutingIds(
  ctx: AppContext,
  orgId: string,
  ids: readonly string[] | null,
): Promise<string[] | null> {
  if (ids === null) return null;
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await ctx.db
    .select({ id: routings.id })
    .from(routings)
    .where(and(eq(routings.orgId, orgId), inArray(routings.id, unique)))
    .all();
  const known = new Set(rows.map((r) => r.id));
  return unique.filter((id) => known.has(id));
}

export async function updateLine(
  ctx: AppContext,
  orgId: string,
  quoteId: string,
  lineId: string,
  patch: {
    partNumber?: string | undefined;
    revision?: string | null | undefined;
    description?: string | null | undefined;
    inputs?: unknown;
    /** The saved routings the line is built from; filtered to this shop's routings. */
    routingIds?: readonly string[] | null | undefined;
  },
  /**
   * Set by copyLineFrom: the inputs now come from the line the estimator picked, so a "Pre-filled
   * from" label naming another quote is dropped (repeat parts, part 4).
   */
  opts: { dropPrefillLabel?: boolean } = {},
) {
  await getDraft(ctx, orgId, quoteId);
  const line = await ctx.db
    .select()
    .from(quoteLines)
    .where(
      and(eq(quoteLines.id, lineId), eq(quoteLines.quoteId, quoteId), eq(quoteLines.orgId, orgId)),
    )
    .get();
  if (!line) throw notFound("Quote line");
  const typed = patch.inputs !== undefined ? parseInputs(patch.inputs) : line.inputs;
  const partNumber = patch.partNumber ?? line.partNumber;
  const revision = patch.revision !== undefined ? patch.revision : line.revision;
  const prefill = shouldPrefillOnSave(
    { partNumber: line.partNumber, prefilled: line.prefilledFrom !== null },
    { partNumber, inputs: typed },
  )
    ? await prefillHandLine(ctx, orgId, { partNumber, revision }, typed)
    : null;
  const inputs = prefill?.inputs ?? typed;
  // Repeat parts, part 4: a pre-filled line whose part number or revision changed no longer comes
  // from the won quote its label names. Its inputs stay; the label goes.
  const dropLabel =
    !prefill &&
    line.prefilledFrom !== null &&
    (opts.dropPrefillLabel === true ||
      prefillLabelStale(
        { partNumber: line.partNumber, revision: line.revision },
        { partNumber, revision },
      ));
  // A pre-fill replaces the inputs, so the won line's routing record replaces the line's too.
  const routingIds = prefill
    ? { routingIds: prefill.routingIds }
    : patch.routingIds !== undefined
      ? { routingIds: await shopRoutingIds(ctx, orgId, patch.routingIds) }
      : {};
  const card = await loadRateCard(ctx, orgId);
  const [updated] = await ctx.db.batch([
    ctx.db
      .update(quoteLines)
      .set({
        ...(patch.partNumber !== undefined ? { partNumber: patch.partNumber } : {}),
        ...(patch.revision !== undefined ? { revision: patch.revision } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(prefill ? { prefilledFrom: prefill.prefilledFrom } : {}),
        ...(dropLabel ? { prefilledFrom: null } : {}),
        ...routingIds,
        inputs,
        ...priceLine(card, inputs),
      })
      .where(
        and(eq(quoteLines.id, lineId), eq(quoteLines.orgId, orgId), quoteIsDraft(orgId, quoteId)),
      )
      .returning({ id: quoteLines.id }),
    bumpRevision(ctx, orgId, quoteId),
  ]);
  if (updated.length === 0) throw sentConflict();
  await refreshHeadline(ctx, orgId, quoteId);
  return getQuote(ctx, orgId, quoteId);
}

export async function deleteLine(ctx: AppContext, orgId: string, quoteId: string, lineId: string) {
  await getDraft(ctx, orgId, quoteId);
  const [res] = await ctx.db.batch([
    ctx.db
      .delete(quoteLines)
      .where(
        and(
          eq(quoteLines.id, lineId),
          eq(quoteLines.quoteId, quoteId),
          eq(quoteLines.orgId, orgId),
          quoteIsDraft(orgId, quoteId),
        ),
      )
      .returning({ id: quoteLines.id }),
    bumpRevision(ctx, orgId, quoteId),
  ]);
  if (res.length === 0) throw notFound("Quote line");
  await refreshHeadline(ctx, orgId, quoteId);
  return getQuote(ctx, orgId, quoteId);
}

/** Re-price every line of a draft from the current rate card. */
export async function recalculate(ctx: AppContext, orgId: string, quoteId: string) {
  await getDraft(ctx, orgId, quoteId);
  const card = await loadRateCard(ctx, orgId);
  const lines = await ctx.db
    .select()
    .from(quoteLines)
    .where(and(eq(quoteLines.orgId, orgId), eq(quoteLines.quoteId, quoteId)))
    .all();
  const results = await ctx.db.batch([
    bumpRevision(ctx, orgId, quoteId),
    ...lines.map((l) =>
      ctx.db
        .update(quoteLines)
        .set(priceLine(card, l.inputs))
        .where(
          and(eq(quoteLines.id, l.id), eq(quoteLines.orgId, orgId), quoteIsDraft(orgId, quoteId)),
        ),
    ),
  ]);
  if (results[0].length === 0) throw sentConflict();
  await refreshHeadline(ctx, orgId, quoteId);
  return getQuote(ctx, orgId, quoteId);
}

function assertPriced(q: QuoteDetailDto) {
  if (q.lines.length === 0) throw conflict("Add at least one line");
  const unpriced = q.lines.filter((l) => !l.breaks || l.issues.length > 0);
  if (unpriced.length > 0) {
    throw new AppError(
      409,
      "unpriced_lines",
      `Finish the cost inputs for ${unpriced.map((l) => l.partNumber).join(", ")}`,
    );
  }
}

/** What a line's price covers, by name only: never rates, costs or markup. */
function includesOf(l: QuoteDetailDto["lines"][number]): string[] {
  const snap = l.snapshot;
  if (!snap) return [];
  const name = <T extends { id: string; name: string }>(rows: T[], id: string) =>
    rows.find((r) => r.id === id)?.name;
  const out: string[] = [];
  if (l.inputs.material) {
    const m = name(snap.materials, l.inputs.material.materialId);
    if (m) out.push(`material: ${m}`);
  } else if (l.inputs.customerSuppliedMaterial) out.push("material supplied by customer");
  for (const op of l.inputs.operations) {
    const m = name(snap.machines, op.machineId);
    if (m) out.push(op.label ? `${op.label} (${m})` : m);
  }
  for (const f of l.inputs.finishing) {
    const n = name(snap.finishingOps, f.opId);
    if (n) out.push(n);
  }
  for (const e of l.inputs.extras) out.push(e.label);
  return out;
}

function coverFacts(shopName: string, q: QuoteDetailDto, currency: string | null): CoverNoteFacts {
  return {
    shopName,
    customerName: q.customerContact || q.customerCompany,
    quoteNumber: quoteLabel(q.quoteNumber, q.revNumber),
    validUntil: q.validUntil,
    leadTimeText: q.leadTimeText,
    notes: q.notes,
    currency,
    lines: q.lines.map((l) => ({
      partNumber: l.partNumber,
      description: l.description,
      breaks: (l.breaks ?? []).map((b) => ({
        quantity: b.quantity,
        unitPriceCents: b.unitPriceCents,
        totalCents: b.totalCents,
      })),
      includes: includesOf(l),
    })),
  };
}

/**
 * Draft the cover note with the LLM from the computed quote only. A note that states any number not
 * in the facts is discarded for the deterministic template (and the reason is logged).
 */
export async function draftCoverNote(ctx: AppContext, orgId: string, quoteId: string) {
  await getDraft(ctx, orgId, quoteId);
  const q = await getQuote(ctx, orgId, quoteId);
  assertPriced(q);
  const settings = await getSettings(ctx, orgId);
  const facts = coverFacts(settings.displayName, q, settings.currency);
  const context = coverNoteContext(facts);
  let note: string;
  let source: "llm" | "template";
  try {
    const { text } = await ctx.llm.generateText({
      purpose: "quote.cover_note",
      orgId,
      system: COVER_NOTE_SYSTEM,
      context,
      prompt: coverNotePrompt(),
      effort: "low",
      maxTokens: 1000,
    });
    const problem = coverNoteProblem(text, context);
    if (problem) {
      ctx.logger.warn("quote.cover_note_rejected", { orgId, quoteId, problem });
      note = templateCoverNote(facts);
      source = "template";
    } else {
      note = text.trim();
      source = "llm";
    }
  } catch (e) {
    if (e instanceof AppError && e.code === "llm_not_configured") throw e;
    ctx.logger.warn("quote.cover_note_failed", { orgId, quoteId, error: String(e).slice(0, 200) });
    note = templateCoverNote(facts);
    source = "template";
  }
  const saved = await ctx.db
    .update(quotes)
    .set({ coverNote: note, coverNoteSource: source, revision: sql`${quotes.revision} + 1` })
    .where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId), eq(quotes.status, "draft")))
    .returning({ id: quotes.id });
  if (saved.length === 0) throw sentConflict();
  return getQuote(ctx, orgId, quoteId);
}

/**
 * The "Changes from ..." section for a revision's PDF when the estimator turned it on: always
 * against the revision it replaces (the one the PDF says it "Replaces"), customer-safe items only.
 */
export async function pdfChanges(
  ctx: AppContext,
  orgId: string,
  q: Pick<QuoteDetailDto, "id" | "showChangesOnPdf" | "supersedesQuoteId">,
): Promise<PdfChanges | null> {
  if (!q.showChangesOnPdf || !q.supersedesQuoteId) return null;
  const [d, settings] = await Promise.all([
    quoteChanges(ctx, orgId, q.id, q.supersedesQuoteId),
    getSettings(ctx, orgId),
  ]);
  return {
    fromLabel: quoteLabel(d.from.quoteNumber, d.from.revNumber),
    items: customerChangeSummary(d, settings.currency),
  };
}

export async function quotePdf(ctx: AppContext, orgId: string, quoteId: string) {
  const q = await getQuote(ctx, orgId, quoteId);
  if (q.status !== "draft" && q.sentPdfSha256) {
    // The exact document that was sent.
    const row = await getQuoteRow(ctx, orgId, quoteId);
    if (row.sentPdfKey?.startsWith(`orgs/${orgId}/`)) {
      const obj = await ctx.env.FILES.get(row.sentPdfKey);
      if (obj) {
        return {
          bytes: new Uint8Array(await obj.arrayBuffer()),
          label: quoteFileLabel(q.quoteNumber, q.revNumber),
        };
      }
    }
  }
  const card = await getRateCardDto(ctx, orgId);
  const issued = shopDay(q.sentAt ? Date.parse(q.sentAt) : ctx.now(), card.settings.timeZone);
  return {
    bytes: renderQuotePdf(
      card.settings,
      q,
      issued,
      await pdfChanges(ctx, orgId, q),
      await logoForPdf(ctx, orgId),
    ),
    label: quoteFileLabel(q.quoteNumber, q.revNumber),
  };
}

/**
 * Mark a draft as sent: freeze it, store the exact PDF in R2 with its SHA-256, mark the RFQ quoted.
 * Emailing it to the customer is a separate step on the sent quote (services/quotes/email.ts).
 */
export async function sendQuote(ctx: AppContext, orgId: string, quoteId: string) {
  const row = await getDraft(ctx, orgId, quoteId);
  const q = await getQuote(ctx, orgId, quoteId);
  assertPriced(q);
  const previous = row.supersedesQuoteId
    ? await ctx.db
        .select()
        .from(quotes)
        .where(and(eq(quotes.id, row.supersedesQuoteId), eq(quotes.orgId, orgId)))
        .get()
    : undefined;
  if (previous && !isRevisable(previous.status)) {
    throw conflict(
      `${quoteLabel(previous.quoteNumber, previous.revNumber)} was marked ${previous.status} after this revision was started, so this revision cannot replace it`,
    );
  }
  const card = await getRateCardDto(ctx, orgId);
  const now = ctx.now();
  const bytes = renderQuotePdf(
    card.settings,
    q,
    shopDay(now, card.settings.timeZone),
    await pdfChanges(ctx, orgId, q),
    await logoForPdf(ctx, orgId),
  );
  const sha = await sha256Hex(bytes);
  // Content-addressed key: a concurrent send can never overwrite the PDF whose hash was recorded.
  const key = `orgs/${orgId}/quotes/${quoteId}/${quoteFileLabel(q.quoteNumber, q.revNumber)}-${sha.slice(0, 16)}.pdf`;
  await ctx.env.FILES.put(key, bytes, { httpMetadata: { contentType: "application/pdf" } });
  const headline = q.lines.reduce((s, l) => s + (l.breaks?.[0]?.totalCents ?? 0), 0);
  // Quote follow-up: due the shop's followUpDays after today's send (none when the shop set 0).
  const followUp = await ctx.db
    .select({ days: shopSettings.followUpDays })
    .from(shopSettings)
    .where(eq(shopSettings.orgId, orgId))
    .get();
  const followUpOn = firstFollowUpOn(
    shopDay(now, card.settings.timeZone),
    followUp?.days ?? DEFAULT_FOLLOW_UP_DAYS,
  );
  const send = ctx.db
    .update(quotes)
    .set({
      status: "sent",
      sentAt: now,
      sentPdfKey: key,
      sentPdfSha256: sha,
      headlineTotalCents: headline,
      followUpOn,
      followUpRemindedFor: null,
    })
    .where(
      and(
        eq(quotes.id, quoteId),
        eq(quotes.orgId, orgId),
        eq(quotes.status, "draft"),
        // Exactly the revision the PDF was rendered from: no edit slipped in between.
        eq(quotes.revision, row.revision),
      ),
    )
    .returning({ id: quotes.id });
  // Sending a revision retires the quote it replaces in the same batch. The second statement runs
  // only if the first one sent this revision with this exact PDF, so a failed send changes nothing.
  const [updated, retired] = previous
    ? await ctx.db.batch([
        send,
        ctx.db
          .update(quotes)
          .set({ status: "superseded", supersededByQuoteId: quoteId })
          .where(
            and(
              eq(quotes.id, previous.id),
              eq(quotes.orgId, orgId),
              inArray(quotes.status, [...REVISABLE_STATUSES]),
              sql`exists (select 1 from ${quotes} as r where r.id = ${quoteId} and r.org_id = ${orgId} and r.status = 'sent' and r.sent_pdf_key = ${key})`,
            ),
          )
          .returning({ id: quotes.id }),
      ])
    : [await send, null];
  if (retired && retired.length === 0 && updated.length > 0) {
    // The earlier quote was marked won in the instant between the check above and the send.
    ctx.logger.warn("quote.revision_previous_not_superseded", { orgId, quoteId });
  }
  if (updated.length === 0) {
    const current = await getQuoteRow(ctx, orgId, quoteId);
    if (current.sentPdfKey !== key) await ctx.env.FILES.delete(key);
    throw current.status === "draft"
      ? conflict("The quote changed while it was being sent; review it and send again")
      : conflict("This quote was already sent");
  }
  if (q.rfqId) {
    await ctx.db
      .update(rfqs)
      .set({ status: "quoted" })
      .where(and(eq(rfqs.id, q.rfqId), eq(rfqs.orgId, orgId)));
  }
  return getQuote(ctx, orgId, quoteId);
}

export type Outcome =
  | { outcome: "won"; poNumber: string | null; wonAmountCents: number | null }
  | { outcome: "lost"; reason: string | null }
  | { outcome: "expired" };

/** Record won / lost / expired on a sent quote (can be corrected later). */
export async function recordOutcome(ctx: AppContext, orgId: string, quoteId: string, o: Outcome) {
  const q = await getQuoteRow(ctx, orgId, quoteId);
  if (q.status === "draft") throw conflict("Send the quote before recording an outcome");
  if (q.status === "superseded") {
    throw conflict(
      `${quoteLabel(q.quoteNumber, q.revNumber)} was replaced by a later revision; record the outcome there`,
    );
  }
  const set =
    o.outcome === "won"
      ? {
          status: "won" as const,
          poNumber: o.poNumber,
          wonAmountCents: o.wonAmountCents ?? q.headlineTotalCents,
          lostReason: null,
        }
      : o.outcome === "lost"
        ? { status: "lost" as const, lostReason: o.reason, poNumber: null, wonAmountCents: null }
        : { status: "expired" as const, poNumber: null, wonAmountCents: null };
  await ctx.db
    .update(quotes)
    .set({ ...set, decidedAt: ctx.now() })
    .where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId)));
  return getQuote(ctx, orgId, quoteId);
}

export async function quoteStats(ctx: AppContext, orgId: string): Promise<QuoteStatsDto> {
  const rows = await ctx.db
    .select({
      status: quotes.status,
      n: sql<number>`count(*)`,
      headline: sql<number>`coalesce(sum(${quotes.headlineTotalCents}), 0)`,
      won: sql<number>`coalesce(sum(${quotes.wonAmountCents}), 0)`,
    })
    .from(quotes)
    .where(eq(quotes.orgId, orgId))
    .groupBy(quotes.status)
    .all();
  const byStatus = Object.fromEntries(QUOTE_STATUSES.map((s) => [s, 0])) as Record<
    QuoteStatus,
    number
  >;
  let wonCents = 0;
  let quotedCents = 0;
  for (const r of rows) {
    byStatus[r.status] = Number(r.n);
    // A superseded quote's value is quoted again by its revision: count it once.
    if (r.status !== "draft" && r.status !== "superseded") quotedCents += Number(r.headline);
    if (r.status === "won") wonCents += Number(r.won);
  }
  const decided = byStatus.won + byStatus.lost;
  return {
    byStatus,
    decided,
    winRate: decided > 0 ? byStatus.won / decided : null,
    wonCents,
    quotedCents,
  };
}

/**
 * Start a revision of a sent, lost or expired quote: a new draft with the same quote number and the
 * next revision number ("Q-1001 Rev 2"), its lines copied exactly (inputs, prices and the rate
 * snapshot they were priced from; Re-price brings in today's card). The earlier quote stays as it is
 * until the revision is sent, when it becomes "superseded". A quote has at most one revision, so
 * asking again returns the one already started.
 */
export async function reviseQuote(
  ctx: AppContext,
  orgId: string,
  userId: string,
  quoteId: string,
): Promise<QuoteDetailDto> {
  const src = await getQuoteRow(ctx, orgId, quoteId);
  const existing = async () =>
    ctx.db
      .select({ id: quotes.id })
      .from(quotes)
      .where(and(eq(quotes.orgId, orgId), eq(quotes.supersedesQuoteId, src.id)))
      .get();
  const started = await existing();
  if (started) return getQuote(ctx, orgId, started.id);
  if (src.status === "draft") throw conflict("This quote is still a draft: edit it directly");
  if (src.status === "won") {
    throw conflict("This quote was won; quote a change to the order as a new quote");
  }
  if (!isRevisable(src.status)) throw conflict("Revise the latest revision of this quote");
  const settings = await getSettings(ctx, orgId);
  const lines = await ctx.db
    .select()
    .from(quoteLines)
    .where(and(eq(quoteLines.orgId, orgId), eq(quoteLines.quoteId, src.id)))
    .orderBy(asc(quoteLines.position), asc(quoteLines.createdAt))
    .all();
  const revId = newId("quo");
  const validUntil = validUntilFrom(ctx.now(), settings);
  try {
    await ctx.db.batch([
      ctx.db.insert(quotes).values({
        id: revId,
        orgId,
        rfqId: src.rfqId,
        quoteNumber: src.quoteNumber,
        revNumber: src.revNumber + 1,
        supersedesQuoteId: src.id,
        customerCompany: src.customerCompany,
        customerContact: src.customerContact,
        customerEmail: src.customerEmail,
        leadTimeText: src.leadTimeText,
        validUntil,
        notes: src.notes,
        // The old note names the old quote; draft a new one for the revision.
        coverNote: null,
        coverNoteSource: null,
        headlineTotalCents: src.headlineTotalCents,
        createdBy: userId,
      }),
      ...lines.map((l) =>
        ctx.db.insert(quoteLines).values({
          id: newId("qln"),
          orgId,
          quoteId: revId,
          rfqPartId: l.rfqPartId,
          position: l.position,
          partNumber: l.partNumber,
          revision: l.revision,
          description: l.description,
          inputs: l.inputs,
          breaks: l.breaks,
          basis: l.basis,
          issues: l.issues,
          snapshot: l.snapshot,
          prefilledFrom: l.prefilledFrom,
          routingIds: l.routingIds,
        }),
      ),
    ]);
  } catch (e) {
    // Two estimators pressed Revise at once: the unique index let one through; open that one.
    const raced = await existing();
    if (raced) return getQuote(ctx, orgId, raced.id);
    throw e;
  }
  return getQuote(ctx, orgId, revId);
}

/**
 * The daily expiry job (cron in wrangler.jsonc, src/worker/index.ts): every sent quote whose
 * valid-until day has passed on its shop's own calendar becomes "expired". A system sweep across
 * shops, the one place a quote query is not scoped to one org; it changes only status and
 * decidedAt. Quotes with no valid-until date never expire on their own. Returns how many it expired.
 *
 * No zone's calendar runs more than one day ahead of UTC (UTC+14 at most), so a quote past its day
 * anywhere has a valid-until day no later than UTC's today: that bounds the candidates, and each
 * one is then checked against its own shop's today.
 */
export async function expireQuotes(ctx: AppContext): Promise<number> {
  const now = ctx.now();
  const candidates = await ctx.db
    .select({ id: quotes.id, validUntil: quotes.validUntil, timeZone: shopSettings.timeZone })
    .from(quotes)
    .leftJoin(shopSettings, eq(shopSettings.orgId, quotes.orgId))
    .where(
      and(
        eq(quotes.status, "sent"),
        sql`${quotes.validUntil} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
        lte(quotes.validUntil, isoDay(now)),
      ),
    )
    .all();
  const due = candidates
    .filter((c) => c.validUntil !== null && c.validUntil < shopDay(now, c.timeZone))
    .map((c) => c.id);
  let expired = 0;
  // D1 binds at most 100 parameters per statement.
  for (let i = 0; i < due.length; i += EXPIRE_CHUNK) {
    const rows = await ctx.db
      .update(quotes)
      .set({ status: "expired", decidedAt: now })
      .where(and(inArray(quotes.id, due.slice(i, i + EXPIRE_CHUNK)), eq(quotes.status, "sent")))
      .returning({ id: quotes.id });
    expired += rows.length;
  }
  if (expired > 0) ctx.logger.info("quote.expired", { count: expired });
  return expired;
}

const EXPIRE_CHUNK = 90;
