// Customer links: the customer opens a sent quote from a link (in the quote email, or copied by an
// estimator), reads it, and accepts it with a PO number and the quantity they order of each part,
// or declines it with a reason. Accepting marks the quote won at the amount of the breaks chosen;
// declining marks it lost. Pure parts here (schemas, DTOs, the arithmetic of an acceptance), so the
// worker (services/quotes/customer-link.ts) and both pages share one rule.
//
// Nothing here prices anything new: an acceptance can only pick breaks the sent quote already
// carries (the lines of a sent quote are frozen, the same numbers the PDF prints).
import { z } from "zod";

const name = z.string().trim().min(1, "Type your name").max(120);
const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .transform((s) => s || null)
  .pipe(z.email("That email address does not look right").nullable())
  .nullable()
  .default(null);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s || null)
    .nullable()
    .default(null);

export const MAX_RESPONSE_NOTE = 1000;

export const customerResponseSchema = z.discriminatedUnion("decision", [
  z
    .object({
      decision: z.literal("accept"),
      name,
      email: optionalEmail,
      poNumber: optionalText(80),
      /** The lines ordered and the break of each; lines left out are not ordered. */
      choices: z
        .array(
          z
            .object({
              lineId: z.string().min(1).max(64),
              quantity: z.number().int().min(1).max(10_000_000),
            })
            .strict(),
        )
        .min(1, "Pick a quantity for at least one part")
        .max(200),
      note: optionalText(MAX_RESPONSE_NOTE),
    })
    .strict(),
  z
    .object({
      decision: z.literal("decline"),
      name,
      email: optionalEmail,
      note: optionalText(MAX_RESPONSE_NOTE),
    })
    .strict(),
]);
export type CustomerResponseInput = z.infer<typeof customerResponseSchema>;

/** A line as the acceptance arithmetic needs it. */
export interface AcceptableLine {
  id: string;
  partNumber: string;
  breaks: { quantity: number; unitPriceCents: number; totalCents: number }[] | null;
}

export interface PricedChoice {
  lineId: string;
  partNumber: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export type AcceptanceResult =
  | { ok: true; choices: PricedChoice[]; amountCents: number }
  | { ok: false; error: string };

/**
 * The lines and breaks an acceptance names, priced from the sent quote's own breaks, in the quote's
 * line order. Refused: a line not on this quote, a line named twice, a quantity that is not one of
 * the line's breaks (the customer cannot set their own quantity: that is a new quote).
 */
export function priceAcceptance(
  lines: AcceptableLine[],
  choices: { lineId: string; quantity: number }[],
): AcceptanceResult {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const picked = new Map<string, number>();
  for (const c of choices) {
    const line = byId.get(c.lineId);
    if (!line) return { ok: false, error: "A part you picked is not on this quote" };
    if (picked.has(c.lineId)) return { ok: false, error: `${line.partNumber} is picked twice` };
    if (!line.breaks?.some((b) => b.quantity === c.quantity)) {
      return {
        ok: false,
        error: `${line.partNumber} is not quoted at a quantity of ${c.quantity}; pick one of the quoted quantities, or reply to the quote email for another`,
      };
    }
    picked.set(c.lineId, c.quantity);
  }
  if (picked.size === 0) return { ok: false, error: "Pick a quantity for at least one part" };
  const out: PricedChoice[] = [];
  for (const line of lines) {
    const qty = picked.get(line.id);
    if (qty === undefined) continue;
    const b = line.breaks?.find((x) => x.quantity === qty);
    if (!b) continue;
    out.push({
      lineId: line.id,
      partNumber: line.partNumber,
      quantity: b.quantity,
      unitPriceCents: b.unitPriceCents,
      totalCents: b.totalCents,
    });
  }
  return { ok: true, choices: out, amountCents: out.reduce((s, c) => s + c.totalCents, 0) };
}

/** The lost reason a quote gets when the customer declines online (the shop's win/loss report reads it). */
export function declinedReason(note: string | null): string {
  const n = note?.replace(/\s+/g, " ").trim();
  return (n ? `Declined online: ${n}` : "Declined online").slice(0, 500);
}

/** Where the link's page stands. "open" is the only state that takes an answer. */
export type CustomerQuoteState =
  | "open"
  | "accepted"
  | "declined"
  | "won"
  | "lost"
  | "expired"
  | "superseded";

export interface CustomerResponseDto {
  decision: "accepted" | "declined";
  name: string;
  email: string | null;
  poNumber: string | null;
  choices: PricedChoice[];
  amountCents: number | null;
  note: string | null;
  createdAt: string;
}

/** GET /api/quote-links/:token: what the customer's page shows. Customer-facing facts only. */
export interface CustomerQuoteDto {
  state: CustomerQuoteState;
  shop: {
    displayName: string;
    addressLines: string[];
    phone: string | null;
    email: string | null;
    /** ISO 4217; null is USD. */
    currency: string | null;
  };
  quote: {
    label: string;
    customerCompany: string;
    customerContact: string | null;
    /** The shop's calendar day it was sent. */
    sentOn: string | null;
    validUntil: string | null;
    leadTimeText: string | null;
    notes: string | null;
    terms: string | null;
    /** Set on a revision: the label of the quote it replaces. */
    replacesLabel: string | null;
  };
  lines: {
    id: string;
    partNumber: string;
    revision: string | null;
    description: string | null;
    breaks: { quantity: number; unitPriceCents: number; totalCents: number }[];
  }[];
  response: CustomerResponseDto | null;
}

/** The shop's view of a quote's customer links (GET /quotes/:id/customer-links). */
export interface CustomerLinksDto {
  links: {
    id: string;
    createdAt: string;
    createdByName: string | null;
    /** True when the link went out in a quote email from the app. */
    emailed: boolean;
    lastViewedAt: string | null;
    revokedAt: string | null;
  }[];
  response: CustomerResponseDto | null;
  /** Whether a new link can be made now (the quote is open, i.e. sent). */
  canCreate: boolean;
}

/** POST /quotes/:id/customer-links: the new link, shown once (only its hash is stored). */
export interface CreatedCustomerLinkDto {
  url: string;
  links: CustomerLinksDto;
}

/** The customer page's path for a token; the worker prefixes APP_URL. */
export const customerLinkPath = (token: string) => `/q/${encodeURIComponent(token)}`;

/** The line the quote email adds under its footer when it carries a customer link. */
export const acceptLinkLine = (url: string) => `Accept or decline this quote online: ${url}`;
