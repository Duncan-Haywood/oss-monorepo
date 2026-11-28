// Packing slip and certificate of conformance for a won quote (GET /quotes/:id/shipment.pdf). The
// rules are in shared/shipment.ts: the quantity shipped is the one typed, else the quantity ordered
// (the saved job's, else the break accepted online, else the line's only break); the ship date is
// the one typed, else the job's shipped day, else today in the shop's time zone. Scoped by orgId
// through getQuote; viewers may print, like the traveler.
import { quoteFileLabel } from "@shared/quote-label";
import {
  namedLineIds,
  parseShipmentQuery,
  planShipment,
  type ShipmentQuery,
  ShipmentQueryError,
} from "@shared/shipment";
import { shopDay } from "@shared/time-zone";
import { mergeNames, type TravelerNames } from "@shared/traveler";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { quoteResponses } from "../../db/schema";
import { badRequest, conflict } from "../../lib/errors";
import { getRateCardDto } from "../ratecard";
import { getQuote } from "./index";
import { renderShipmentPdf } from "./shipment-pdf";
import { getQuoteJob } from "./shop-load";

/** The query string as a ShipmentQuery; a bad value is a 400 naming the field. */
export function readShipmentQuery(query: Record<string, string>): ShipmentQuery {
  try {
    return parseShipmentQuery(query);
  } catch (e) {
    if (e instanceof ShipmentQueryError) throw badRequest(e.message);
    throw e;
  }
}

export async function shipmentPdf(
  ctx: AppContext,
  orgId: string,
  quoteId: string,
  query: ShipmentQuery,
) {
  const q = await getQuote(ctx, orgId, quoteId);
  if (q.status !== "won")
    throw conflict("A packing slip is printed for a won quote: record the win first");
  if (q.lines.length === 0) throw conflict("This quote has no parts");
  for (const id of namedLineIds(query)) {
    if (!q.lines.some((l) => l.id === id))
      throw badRequest("A quantity or lot number names a line not on this quote");
  }
  const [card, job, response] = await Promise.all([
    getRateCardDto(ctx, orgId),
    getQuoteJob(ctx, orgId, quoteId),
    ctx.db
      .select({ decision: quoteResponses.decision, choices: quoteResponses.choices })
      .from(quoteResponses)
      .where(and(eq(quoteResponses.orgId, orgId), eq(quoteResponses.quoteId, quoteId)))
      .get(),
  ]);
  const current: TravelerNames = {
    machines: card.machines,
    materials: card.materials,
    finishingOps: card.finishingOps,
  };
  const accepted = response?.decision === "accepted" ? response.choices : null;
  const plan = planShipment(q.lines, job.quantities, accepted, query, (line) =>
    mergeNames(q.lines.find((l) => l.id === line.id)?.snapshot ?? null, current),
  );
  if (plan.missing.length > 0) {
    throw badRequest(
      `Enter the quantity shipped for ${plan.missing.join(", ")}: quoted at more than one quantity`,
      { lines: plan.missing },
    );
  }
  if (plan.lines.length === 0) throw conflict("No part on this quote was ordered");
  const bytes = renderShipmentPdf(
    card.settings,
    {
      quoteNumber: q.quoteNumber,
      revNumber: q.revNumber,
      customerCompany: q.customerCompany,
      customerContact: q.customerContact,
      poNumber: q.poNumber,
      shipDate: query.ship ?? job.shippedOn ?? shopDay(ctx.now(), card.settings.timeZone),
      shipTo: query.shipTo,
      signer: query.signer ?? null,
      certificate: query.certificate,
    },
    plan.lines,
  );
  return { bytes, label: `${quoteFileLabel(q.quoteNumber, q.revNumber)} packing slip` };
}
