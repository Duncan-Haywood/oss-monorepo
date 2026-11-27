// Customer links (shared/customer-link.ts): a bearer link to one sent quote where the customer
// reads it, downloads the exact PDF that was sent, and accepts (PO number, a quoted quantity per
// part) or declines. Accepting marks the quote won at the chosen breaks' total; declining marks it
// lost. The estimators who made or emailed the quote get an email either way.
//
// Rules:
// - The token is 32 random bytes; only its SHA-256 is stored, so the link is shown once (or goes
//   in a quote email). Every link of a quote stops working when the shop turns them off.
// - A link answers only while its quote is "sent" and not past its valid-until day (shop's time
//   zone): won/lost/expired/superseded quotes show their state, and a revision's old link does not
//   lead to the revision (the customer gets the revision's own email).
// - One answer per quote: the quote's status moves from "sent" in a conditional update, so two
//   answers at once cannot both land; the answer row is the record even if the shop later corrects
//   the outcome by hand.
// - The page sees customer-facing facts only, the same ones the PDF prints: never rates, costs,
//   markups, basis lines or internal notes about the RFQ.
// - Logs carry ids, never names, addresses or PO numbers.

import { formatMoney } from "@shared/currency";
import {
  type CreatedCustomerLinkDto,
  type CustomerLinksDto,
  type CustomerQuoteDto,
  type CustomerQuoteState,
  type CustomerResponseDto,
  type CustomerResponseInput,
  customerLinkPath,
  declinedReason,
  priceAcceptance,
} from "@shared/customer-link";
import { oneLine } from "@shared/quote-email";
import { quoteLabel } from "@shared/quote-label";
import { shopDay } from "@shared/time-zone";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { type AppContext, usesFakeEmail } from "../../context";
import {
  member,
  quoteEmails,
  quoteLines,
  quoteLinks,
  quoteResponses,
  quotes,
  user,
} from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { sha256Hex } from "../../lib/hash";
import { newId, newToken } from "../../lib/ids";
import { getSettings } from "../ratecard";

const HOUR = 60 * 60 * 1000;
/** base64url of 32 bytes is 43 characters; anything else is not one of ours. */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const appUrl = (env: { APP_URL: string }) => env.APP_URL.replace(/\/+$/, "");

export const customerLinkUrl = (env: { APP_URL: string }, token: string) =>
  `${appUrl(env)}${customerLinkPath(token)}`;

async function quoteRow(ctx: AppContext, orgId: string, quoteId: string) {
  const q = await ctx.db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId)))
    .get();
  if (!q) throw notFound("Quote");
  return q;
}

function responseDto(
  r: typeof quoteResponses.$inferSelect | undefined,
): CustomerResponseDto | null {
  if (!r) return null;
  return {
    decision: r.decision,
    name: r.name,
    email: r.email,
    poNumber: r.poNumber,
    choices: r.choices,
    amountCents: r.amountCents,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  };
}

const responseRow = (ctx: AppContext, orgId: string, quoteId: string) =>
  ctx.db
    .select()
    .from(quoteResponses)
    .where(and(eq(quoteResponses.orgId, orgId), eq(quoteResponses.quoteId, quoteId)))
    .get();

// ---- The shop's side ----

export async function listCustomerLinks(
  ctx: AppContext,
  orgId: string,
  quoteId: string,
): Promise<CustomerLinksDto> {
  const q = await quoteRow(ctx, orgId, quoteId);
  const rows = await ctx.db
    .select({ l: quoteLinks, name: user.name })
    .from(quoteLinks)
    .leftJoin(user, eq(user.id, quoteLinks.createdBy))
    .where(and(eq(quoteLinks.orgId, orgId), eq(quoteLinks.quoteId, quoteId)))
    .orderBy(desc(quoteLinks.createdAt))
    .limit(50)
    .all();
  return {
    links: rows.map(({ l, name }) => ({
      id: l.id,
      createdAt: l.createdAt.toISOString(),
      createdByName: name,
      emailed: l.quoteEmailId !== null,
      lastViewedAt: l.lastViewedAt?.toISOString() ?? null,
      revokedAt: l.revokedAt?.toISOString() ?? null,
    })),
    response: responseDto(await responseRow(ctx, orgId, quoteId)),
    canCreate: q.status === "sent",
  };
}

/**
 * A new link for an open, sent quote. Returns the URL (the only time the token exists outside the
 * customer's hands). `quoteEmailId` ties it to the quote email it goes out in.
 */
export async function createCustomerLink(
  ctx: AppContext,
  orgId: string,
  userId: string,
  quoteId: string,
  quoteEmailId: string | null = null,
): Promise<{ id: string; url: string }> {
  const q = await quoteRow(ctx, orgId, quoteId);
  if (q.status !== "sent") {
    throw conflict(
      q.status === "draft"
        ? "Mark the quote sent first: the customer sees the quote as sent"
        : `This quote is ${q.status}; only an open, sent quote takes a customer's answer`,
    );
  }
  const token = newToken();
  const id = newId("qlk");
  await ctx.db.insert(quoteLinks).values({
    id,
    orgId,
    quoteId,
    tokenHash: await sha256Hex(token),
    quoteEmailId,
    createdBy: userId,
    createdAt: ctx.now(),
  });
  ctx.logger.info("quote.customer_link_created", { orgId, quoteId, emailed: !!quoteEmailId });
  return { id, url: customerLinkUrl(ctx.env, token) };
}

export async function createCustomerLinkDto(
  ctx: AppContext,
  orgId: string,
  userId: string,
  quoteId: string,
): Promise<CreatedCustomerLinkDto> {
  const { url } = await createCustomerLink(ctx, orgId, userId, quoteId);
  return { url, links: await listCustomerLinks(ctx, orgId, quoteId) };
}

/** Turn off every link of the quote (they answer 404 from then on). */
export async function revokeCustomerLinks(
  ctx: AppContext,
  orgId: string,
  quoteId: string,
): Promise<CustomerLinksDto> {
  await quoteRow(ctx, orgId, quoteId);
  await ctx.db
    .update(quoteLinks)
    .set({ revokedAt: ctx.now() })
    .where(
      and(
        eq(quoteLinks.orgId, orgId),
        eq(quoteLinks.quoteId, quoteId),
        isNull(quoteLinks.revokedAt),
      ),
    );
  ctx.logger.info("quote.customer_links_revoked", { orgId, quoteId });
  return listCustomerLinks(ctx, orgId, quoteId);
}

// ---- The customer's side (no session: the token is the credential) ----

/** The link behind a token, or 404. Revoked links and malformed tokens look the same as unknown ones. */
async function linkFor(ctx: AppContext, token: string) {
  if (!TOKEN_RE.test(token)) throw notFound("Quote");
  const link = await ctx.db
    .select()
    .from(quoteLinks)
    .where(eq(quoteLinks.tokenHash, await sha256Hex(token)))
    .get();
  if (!link || link.revokedAt) throw notFound("Quote");
  return link;
}

function stateOf(
  q: typeof quotes.$inferSelect,
  response: typeof quoteResponses.$inferSelect | undefined,
  today: string,
): CustomerQuoteState {
  if (response) return response.decision;
  if (q.status === "sent") {
    return q.validUntil && /^\d{4}-\d{2}-\d{2}$/.test(q.validUntil) && q.validUntil < today
      ? "expired"
      : "open";
  }
  if (q.status === "won" || q.status === "lost" || q.status === "expired") return q.status;
  if (q.status === "superseded") return "superseded";
  // A draft never has a link (links are made from sent quotes only).
  throw notFound("Quote");
}

async function customerView(
  ctx: AppContext,
  link: typeof quoteLinks.$inferSelect,
): Promise<CustomerQuoteDto> {
  const { orgId, quoteId } = link;
  const [q, settings, lines, response] = await Promise.all([
    quoteRow(ctx, orgId, quoteId),
    getSettings(ctx, orgId),
    ctx.db
      .select()
      .from(quoteLines)
      .where(and(eq(quoteLines.orgId, orgId), eq(quoteLines.quoteId, quoteId)))
      .orderBy(asc(quoteLines.position), asc(quoteLines.createdAt))
      .all(),
    responseRow(ctx, orgId, quoteId),
  ]);
  const today = shopDay(ctx.now(), settings.timeZone);
  return {
    state: stateOf(q, response, today),
    shop: {
      displayName: settings.displayName,
      addressLines: settings.addressLines ?? [],
      phone: settings.phone,
      email: settings.email,
      currency: settings.currency,
    },
    quote: {
      label: quoteLabel(q.quoteNumber, q.revNumber),
      customerCompany: q.customerCompany,
      customerContact: q.customerContact,
      sentOn: q.sentAt ? shopDay(q.sentAt, settings.timeZone) : null,
      validUntil: q.validUntil,
      leadTimeText: q.leadTimeText,
      notes: q.notes,
      terms: settings.quoteTerms,
      replacesLabel: q.revNumber > 1 ? quoteLabel(q.quoteNumber, q.revNumber - 1) : null,
    },
    lines: lines.map((l) => ({
      id: l.id,
      partNumber: l.partNumber,
      revision: l.revision,
      description: l.description,
      breaks: (l.breaks ?? []).map((b) => ({
        quantity: b.quantity,
        unitPriceCents: b.unitPriceCents,
        totalCents: b.totalCents,
      })),
    })),
    response: responseDto(response),
  };
}

/** The customer's page. Records when the link was last opened (at most once an hour). */
export async function viewCustomerQuote(ctx: AppContext, token: string): Promise<CustomerQuoteDto> {
  const link = await linkFor(ctx, token);
  const view = await customerView(ctx, link);
  const now = ctx.now();
  if (!link.lastViewedAt || now.getTime() - link.lastViewedAt.getTime() >= HOUR) {
    await ctx.db.update(quoteLinks).set({ lastViewedAt: now }).where(eq(quoteLinks.id, link.id));
  }
  return view;
}

/** The exact PDF that was sent, checked against its recorded SHA-256. */
export async function customerQuotePdf(ctx: AppContext, token: string) {
  const link = await linkFor(ctx, token);
  const q = await quoteRow(ctx, link.orgId, link.quoteId);
  const key = q.sentPdfKey;
  if (!key?.startsWith(`orgs/${link.orgId}/`) || !q.sentPdfSha256) throw notFound("Quote PDF");
  const obj = await ctx.env.FILES.get(key);
  if (!obj) throw notFound("Quote PDF");
  const bytes = new Uint8Array(await obj.arrayBuffer());
  if ((await sha256Hex(bytes)) !== q.sentPdfSha256) {
    ctx.logger.error("quote.customer_pdf_hash_mismatch", { orgId: link.orgId, quoteId: q.id });
    throw conflict("This quote's PDF could not be checked; ask the shop for a copy");
  }
  return { bytes, fileName: `${quoteLabel(q.quoteNumber, q.revNumber).replace(/\s+/g, "-")}.pdf` };
}

export async function respondToQuote(
  ctx: AppContext,
  token: string,
  input: CustomerResponseInput,
): Promise<CustomerQuoteDto> {
  const link = await linkFor(ctx, token);
  const { orgId, quoteId } = link;
  const view = await customerView(ctx, link);
  if (view.state !== "open") {
    throw conflict(
      view.state === "expired"
        ? `This quote was valid until ${view.quote.validUntil}; reply to the quote email for a new one`
        : view.state === "superseded"
          ? "This quote was replaced by a newer revision; open the link in that revision's email"
          : "This quote has already been answered",
    );
  }

  const now = ctx.now();
  let set: Partial<typeof quotes.$inferInsert>;
  let row: typeof quoteResponses.$inferInsert;
  if (input.decision === "accept") {
    const priced = priceAcceptance(view.lines, input.choices);
    if (!priced.ok) throw badRequest(priced.error);
    set = {
      status: "won",
      poNumber: input.poNumber,
      wonAmountCents: priced.amountCents,
      lostReason: null,
      decidedAt: now,
    };
    row = {
      id: newId("qrs"),
      orgId,
      quoteId,
      linkId: link.id,
      decision: "accepted",
      name: input.name,
      email: input.email,
      poNumber: input.poNumber,
      choices: priced.choices,
      amountCents: priced.amountCents,
      note: input.note,
      createdAt: now,
    };
  } else {
    set = {
      status: "lost",
      lostReason: declinedReason(input.note),
      poNumber: null,
      wonAmountCents: null,
      decidedAt: now,
    };
    row = {
      id: newId("qrs"),
      orgId,
      quoteId,
      linkId: link.id,
      decision: "declined",
      name: input.name,
      email: input.email,
      poNumber: null,
      choices: [],
      amountCents: null,
      note: input.note,
      createdAt: now,
    };
  }

  // Only the answer that moves the quote out of "sent" is recorded.
  const moved = await ctx.db
    .update(quotes)
    .set(set)
    .where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId), eq(quotes.status, "sent")))
    .returning({ id: quotes.id });
  if (moved.length === 0) throw conflict("This quote has already been answered");
  await ctx.db.insert(quoteResponses).values(row);
  ctx.logger.info("quote.customer_responded", { orgId, quoteId, decision: row.decision });

  await notifyShop(ctx, orgId, quoteId, row);
  return customerView(ctx, link);
}

/**
 * Email the quote's estimators (whoever made it and whoever emailed it from the app, while still
 * members with a confirmed address). A failure is logged and never fails the customer's answer.
 */
async function notifyShop(
  ctx: AppContext,
  orgId: string,
  quoteId: string,
  r: typeof quoteResponses.$inferInsert,
) {
  if (!ctx.email.delivers && !usesFakeEmail(ctx.env)) return;
  try {
    const q = await quoteRow(ctx, orgId, quoteId);
    const senders = await ctx.db
      .selectDistinct({ id: quoteEmails.sentBy })
      .from(quoteEmails)
      .where(and(eq(quoteEmails.orgId, orgId), eq(quoteEmails.quoteId, quoteId)))
      .all();
    const ids = [
      ...new Set([q.createdBy, ...senders.map((s) => s.id)].filter((x): x is string => !!x)),
    ];
    if (ids.length === 0) return;
    const people = await ctx.db
      .select({ email: user.email, verified: user.emailVerified })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, orgId), inArray(member.userId, ids)))
      .all();
    const to = people.filter((p) => p.verified).map((p) => p.email);
    if (to.length === 0) return;
    const settings = await getSettings(ctx, orgId);
    const mail = responseEmail({
      label: quoteLabel(q.quoteNumber, q.revNumber),
      customerCompany: q.customerCompany,
      quoteUrl: `${appUrl(ctx.env)}/app/${encodeURIComponent(orgId)}/quotes/${encodeURIComponent(quoteId)}`,
      currency: settings.currency,
      response: r,
    });
    await ctx.email.send({ to, subject: mail.subject, text: mail.text });
    ctx.logger.info("quote.customer_response_notified", { orgId, quoteId, recipients: to.length });
  } catch (e) {
    ctx.logger.error("quote.customer_response_notify_failed", {
      orgId,
      quoteId,
      error: String(e instanceof Error ? e.message : e)
        .replace(/[^\s@<>"']+@[^\s@<>"']+/g, "[address]")
        .slice(0, 300),
    });
  }
}

/** The shop's email about a customer's answer (plain text; every value is the customer's or the quote's). */
export function responseEmail(f: {
  label: string;
  customerCompany: string;
  quoteUrl: string;
  currency: string | null;
  response: Pick<
    typeof quoteResponses.$inferInsert,
    "decision" | "name" | "email" | "poNumber" | "choices" | "amountCents" | "note"
  >;
}): { subject: string; text: string } {
  const r = f.response;
  const clean = oneLine;
  const who = `${clean(r.name, 120)}${r.email ? ` (${clean(r.email, 254)})` : ""}`;
  const lines: string[] = [];
  let subject: string;
  if (r.decision === "accepted") {
    subject = `Quote ${f.label} accepted by ${clean(f.customerCompany, 120)}${r.poNumber ? `, PO ${clean(r.poNumber, 80)}` : ""}`;
    lines.push(`${who} accepted quote ${f.label} online for ${clean(f.customerCompany, 120)}.`);
    lines.push(`PO number: ${r.poNumber ? clean(r.poNumber, 80) : "none given"}`);
    lines.push("");
    lines.push("Ordered:");
    for (const c of r.choices ?? []) {
      lines.push(
        `- ${clean(c.partNumber, 120)}: ${c.quantity} at ${formatMoney(c.unitPriceCents, f.currency)} = ${formatMoney(c.totalCents, f.currency)}`,
      );
    }
    if (r.amountCents != null) lines.push(`Total: ${formatMoney(r.amountCents, f.currency)}`);
    lines.push("");
    lines.push("The quote is now marked won at this total.");
  } else {
    subject = `Quote ${f.label} declined by ${clean(f.customerCompany, 120)}`;
    lines.push(`${who} declined quote ${f.label} online for ${clean(f.customerCompany, 120)}.`);
    lines.push("The quote is now marked lost.");
  }
  if (r.note) {
    lines.push("");
    lines.push(r.decision === "accepted" ? "Their note:" : "Their reason:");
    lines.push(clean(r.note, 1000));
  }
  lines.push("");
  lines.push(`Open the quote: ${f.quoteUrl}`);
  lines.push(
    "This was typed by whoever opened the quote's customer link; check the PO before you start work.",
  );
  return { subject: clean(subject), text: `${lines.join("\n")}\n` };
}
