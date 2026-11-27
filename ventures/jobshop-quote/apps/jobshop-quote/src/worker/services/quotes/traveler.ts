// Job traveler for a won quote (GET /quotes/:id/traveler.pdf). The quantity per line is the one on
// the purchase order (`qty.<lineId>`), else the break the customer picked when accepting online (a
// part they did not order is left off), else the line's only quantity break; a line quoted at several
// breaks with none of these is refused with its part number, never guessed. Names come from each
// line's price-time snapshot first, then today's rate card. Scoped by orgId through getQuote.
import { quoteFileLabel } from "@shared/quote-label";
import { shopDay } from "@shared/time-zone";
import {
  isValidOrderQuantity,
  mergeNames,
  planQuantities,
  type TravelerNames,
  travelerLine,
} from "@shared/traveler";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { quoteResponses } from "../../db/schema";
import { badRequest, conflict } from "../../lib/errors";
import { getRateCardDto } from "../ratecard";
import { getQuote } from "./index";
import { renderTravelerPdf } from "./traveler-pdf";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface TravelerQuery {
  /** Requested due date, YYYY-MM-DD; printed as given. */
  due?: string;
  /** Quantity to make per line id. */
  quantities: Record<string, number>;
}

/** Read `due` and `qty.<lineId>` from the query string; bad values are a 400, not a default. */
export function parseTravelerQuery(query: Record<string, string>): TravelerQuery {
  const out: TravelerQuery = { quantities: {} };
  for (const [k, v] of Object.entries(query)) {
    if (k === "due") {
      if (v === "") continue;
      if (!ISO_DAY.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
        throw badRequest("The due date must be YYYY-MM-DD");
      }
      out.due = v;
    } else if (k.startsWith("qty.")) {
      if (v === "") continue;
      const n = Number(v);
      if (!/^\d+$/.test(v) || !isValidOrderQuantity(n)) {
        throw badRequest("Each quantity must be a whole number from 1 to 1,000,000");
      }
      out.quantities[k.slice(4)] = n;
    }
  }
  return out;
}

export async function travelerPdf(
  ctx: AppContext,
  orgId: string,
  quoteId: string,
  query: TravelerQuery,
) {
  const q = await getQuote(ctx, orgId, quoteId);
  if (q.status !== "won")
    throw conflict("A traveler is printed for a won quote: record the win first");
  if (q.lines.length === 0) throw conflict("This quote has no parts");
  for (const id of Object.keys(query.quantities)) {
    if (!q.lines.some((l) => l.id === id))
      throw badRequest("A quantity names a line not on this quote");
  }
  const card = await getRateCardDto(ctx, orgId);
  const current: TravelerNames = {
    machines: card.machines,
    materials: card.materials,
    finishingOps: card.finishingOps,
  };
  const response = await ctx.db
    .select({ decision: quoteResponses.decision, choices: quoteResponses.choices })
    .from(quoteResponses)
    .where(and(eq(quoteResponses.orgId, orgId), eq(quoteResponses.quoteId, quoteId)))
    .get();
  const accepted = response?.decision === "accepted" ? response.choices : null;
  const { plan, missing } = planQuantities(q.lines, query.quantities, accepted);
  if (missing.length > 0) {
    throw badRequest(
      `Enter the quantity ordered for ${missing.join(", ")}: quoted at more than one quantity`,
      { lines: missing },
    );
  }
  if (plan.length === 0) throw conflict("No part on this quote was ordered");
  const lines = plan.map((p) =>
    travelerLine(p.line, p.quantity, mergeNames(p.line.snapshot, current)),
  );
  const bytes = renderTravelerPdf(
    card.settings,
    {
      quoteNumber: q.quoteNumber,
      revNumber: q.revNumber,
      customerCompany: q.customerCompany,
      poNumber: q.poNumber,
      dueDate: query.due ?? null,
      printedOn: shopDay(ctx.now(), card.settings.timeZone),
    },
    lines,
  );
  return { bytes, label: `${quoteFileLabel(q.quoteNumber, q.revNumber)} traveler` };
}
