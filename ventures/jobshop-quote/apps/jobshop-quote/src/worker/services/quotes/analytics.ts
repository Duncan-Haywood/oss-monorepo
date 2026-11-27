// Win/loss analytics (src/shared/win-loss.ts does the counting): the shop's decided quotes, their
// lines, and the window they were decided in. Every query is scoped by orgId, so one shop never sees
// another's quotes or prices.
import type { WinLossDto, WinLossWindow } from "@shared/api";
import { costInputsSchema, emptyCostInputs } from "@shared/costing";
import { quoteLabel } from "@shared/quote-label";
import {
  type DecidedQuote,
  type WinLossRouting,
  winLossCsv,
  winLossReport,
} from "@shared/win-loss";
import { and, desc, eq, gte, inArray, type SQL } from "drizzle-orm";
import type { AppContext } from "../../context";
import { quoteLines, quotes, routings, shopSettings, user } from "../../db/schema";

/** Most recent decided quotes read for one report; older ones are left out and the page says so. */
export const MAX_ANALYTICS_QUOTES = 2_000;
const DAY_MS = 86_400_000;
const DECIDED = ["won", "lost", "expired"] as const;

export function windowStart(window: WinLossWindow, now: Date): Date | null {
  if (window === "all") return null;
  return new Date(now.getTime() - Number(window) * DAY_MS);
}

/** The shop's decided quotes in the window, newest decision first, capped at MAX_ANALYTICS_QUOTES. */
async function decidedQuotes(
  ctx: AppContext,
  orgId: string,
  window: WinLossWindow,
): Promise<{ since: Date | null; truncated: boolean; quotes: DecidedQuote[] }> {
  const since = windowStart(window, ctx.now());
  const where: SQL[] = [eq(quotes.orgId, orgId), inArray(quotes.status, [...DECIDED])];
  if (since) where.push(gte(quotes.decidedAt, since));
  const rows = await ctx.db
    .select({
      id: quotes.id,
      quoteNumber: quotes.quoteNumber,
      revNumber: quotes.revNumber,
      status: quotes.status,
      customerCompany: quotes.customerCompany,
      decidedAt: quotes.decidedAt,
      headlineTotalCents: quotes.headlineTotalCents,
      wonAmountCents: quotes.wonAmountCents,
      lostReason: quotes.lostReason,
      estimatorId: quotes.createdBy,
      // The creator's display name; members of one shop see each other's names on the members page.
      estimatorName: user.name,
    })
    .from(quotes)
    .leftJoin(user, eq(user.id, quotes.createdBy))
    .where(and(...where))
    .orderBy(desc(quotes.decidedAt), desc(quotes.quoteNumber))
    .limit(MAX_ANALYTICS_QUOTES + 1)
    .all();
  const truncated = rows.length > MAX_ANALYTICS_QUOTES;
  const kept = rows.slice(0, MAX_ANALYTICS_QUOTES);

  // The same filter joined to the lines (one query, no long IN list: D1 caps bound parameters).
  const lineRows =
    kept.length === 0
      ? []
      : await ctx.db
          .select({
            quoteId: quoteLines.quoteId,
            position: quoteLines.position,
            partNumber: quoteLines.partNumber,
            revision: quoteLines.revision,
            inputs: quoteLines.inputs,
            breaks: quoteLines.breaks,
            snapshot: quoteLines.snapshot,
            routingIds: quoteLines.routingIds,
          })
          .from(quoteLines)
          .innerJoin(quotes, and(eq(quotes.id, quoteLines.quoteId), eq(quotes.orgId, orgId)))
          .where(and(eq(quoteLines.orgId, orgId), ...where))
          .all();

  const byQuote = new Map<string, DecidedQuote>();
  for (const r of kept) {
    byQuote.set(r.id, {
      id: r.id,
      label: quoteLabel(r.quoteNumber, r.revNumber),
      customerCompany: r.customerCompany,
      outcome: r.status as DecidedQuote["outcome"],
      decidedAt: r.decidedAt?.toISOString() ?? null,
      headlineTotalCents: r.headlineTotalCents,
      wonAmountCents: r.wonAmountCents,
      lostReason: r.lostReason,
      estimatorId: r.estimatorId,
      estimatorName: r.estimatorName,
      lines: [],
    });
  }
  lineRows.sort((a, b) => a.position - b.position);
  for (const l of lineRows) {
    const q = byQuote.get(l.quoteId);
    if (!q) continue; // beyond the cap
    q.lines.push({
      partNumber: l.partNumber,
      revision: l.revision,
      // A line stored under an older input schema still counts for its customer, markup and
      // prices; only its material and machine rows are left out.
      inputs: costInputsSchema.safeParse(l.inputs).data ?? emptyCostInputs(),
      breaks: l.breaks,
      snapshot: l.snapshot,
      routingIds: l.routingIds,
    });
  }
  return { since, truncated, quotes: [...byQuote.values()] };
}

/** The shop's time zone for month edges (null: UTC). */
async function shopTimeZone(ctx: AppContext, orgId: string): Promise<string | null> {
  const row = await ctx.db
    .select({ timeZone: shopSettings.timeZone })
    .from(shopSettings)
    .where(eq(shopSettings.orgId, orgId))
    .get();
  return row?.timeZone ?? null;
}

/** The shop's saved routings as they are today (the report's routing and part-family rows). */
async function shopRoutings(ctx: AppContext, orgId: string): Promise<WinLossRouting[]> {
  return ctx.db
    .select({
      id: routings.id,
      name: routings.name,
      partFamily: routings.partFamily,
      operations: routings.operations,
    })
    .from(routings)
    .where(eq(routings.orgId, orgId))
    .orderBy(routings.name)
    .all();
}

export async function winLoss(
  ctx: AppContext,
  orgId: string,
  window: WinLossWindow,
): Promise<WinLossDto> {
  const [{ since, truncated, quotes: decided }, saved, zone] = await Promise.all([
    decidedQuotes(ctx, orgId, window),
    shopRoutings(ctx, orgId),
    shopTimeZone(ctx, orgId),
  ]);
  return {
    window,
    since: since?.toISOString() ?? null,
    truncated,
    ...winLossReport(decided, saved, zone),
  };
}

/** The same quotes as the report, one CSV row each (shared/win-loss.ts winLossCsv). */
export async function winLossCsvExport(
  ctx: AppContext,
  orgId: string,
  window: WinLossWindow,
): Promise<{ csv: string; truncated: boolean }> {
  const [{ truncated, quotes: decided }, saved, zone] = await Promise.all([
    decidedQuotes(ctx, orgId, window),
    shopRoutings(ctx, orgId),
    shopTimeZone(ctx, orgId),
  ]);
  return { csv: winLossCsv(decided, saved, zone), truncated };
}
