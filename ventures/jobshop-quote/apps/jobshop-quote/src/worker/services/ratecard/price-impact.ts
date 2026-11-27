// Material price lists, part 2: "quotes this changes" (shared/material-price-impact.ts). Reads the
// shop's open quotes (drafts and sent quotes not yet won, lost, expired or superseded), their lines'
// inputs and rate snapshots, and today's materials, and lists each material whose card price
// differs from the price a line was priced at. Read only: nothing re-prices, sent quotes keep their
// price. Two queries on the quotes and their lines (no IN list, so no D1 parameter limit).
// The import preview (part 2b) reads the same rows and asks the same question of the prices an
// import would set, before anything is saved.
import type { MaterialPriceImpactDto, MaterialPriceImpactPreviewBody } from "@shared/api";
import {
  materialPriceImpact,
  OPEN_QUOTE_STATUSES,
  type OpenQuoteStatus,
  PRICE_IMPACT_MAX_QUOTES,
  proposedPriceImpact,
} from "@shared/material-price-impact";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../context";
import { materials, quoteLines, quotes } from "../../db/schema";

/** The shop's open quotes (newest first, one past the cap), their lines, and today's materials. */
async function loadOpenQuotes(ctx: AppContext, orgId: string) {
  const open = inArray(quotes.status, [...OPEN_QUOTE_STATUSES]);
  const [quoteRows, lineRows, materialRows] = await Promise.all([
    ctx.db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        revNumber: quotes.revNumber,
        status: quotes.status,
        customerCompany: quotes.customerCompany,
      })
      .from(quotes)
      .where(and(eq(quotes.orgId, orgId), open))
      .orderBy(desc(quotes.quoteNumber), desc(quotes.revNumber))
      .limit(PRICE_IMPACT_MAX_QUOTES + 1)
      .all(),
    ctx.db
      .select({
        quoteId: quoteLines.quoteId,
        inputs: quoteLines.inputs,
        snapshot: quoteLines.snapshot,
      })
      .from(quoteLines)
      .innerJoin(quotes, eq(quotes.id, quoteLines.quoteId))
      .where(and(eq(quoteLines.orgId, orgId), eq(quotes.orgId, orgId), open))
      .all(),
    ctx.db
      .select({
        id: materials.id,
        name: materials.name,
        pricingBasis: materials.pricingBasis,
        pricePerLbCents: materials.pricePerLbCents,
        stockPriceCents: materials.stockPriceCents,
        pricePerFootCents: materials.pricePerFootCents,
        pricePerCwtCents: materials.pricePerCwtCents,
        pricePerMetreCents: materials.pricePerMetreCents,
      })
      .from(materials)
      .where(eq(materials.orgId, orgId))
      .all(),
  ]);
  const kept = quoteRows.slice(0, PRICE_IMPACT_MAX_QUOTES).map((q) => ({
    ...q,
    status: q.status as OpenQuoteStatus,
  }));
  return {
    quotes: kept,
    lines: lineRows,
    materials: materialRows,
    truncated: quoteRows.length > PRICE_IMPACT_MAX_QUOTES,
  };
}

export async function getMaterialPriceImpact(
  ctx: AppContext,
  orgId: string,
  minPct: number,
): Promise<MaterialPriceImpactDto> {
  const d = await loadOpenQuotes(ctx, orgId);
  return {
    minPct,
    materials: materialPriceImpact(d.quotes, d.lines, d.materials, minPct),
    quotesRead: d.quotes.length,
    truncated: d.truncated,
  };
}

/**
 * The open quotes an import's prices would touch, per material, before the import is saved. Ids
 * that are not this shop's materials are ignored (never an error: the preview only reads), so one
 * shop can learn nothing about another's.
 */
export async function previewMaterialPriceImpact(
  ctx: AppContext,
  orgId: string,
  body: MaterialPriceImpactPreviewBody,
): Promise<MaterialPriceImpactDto> {
  const d = await loadOpenQuotes(ctx, orgId);
  return {
    minPct: 0,
    materials: proposedPriceImpact(d.quotes, d.lines, d.materials, body.prices),
    quotesRead: d.quotes.length,
    truncated: d.truncated,
  };
}
