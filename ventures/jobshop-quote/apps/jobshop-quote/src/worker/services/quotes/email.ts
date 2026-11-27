// Email a sent quote to the customer from the app: the estimator's message (by default the cover
// note) with the exact PDF that was frozen when the quote was marked sent, replies to the estimator.
//
// Rules:
// - Only an open, sent quote (not a draft, not won/lost/expired/superseded); the attachment is the
//   stored PDF, checked against the SHA-256 recorded at send. Nothing is re-rendered.
// - The sender must be an estimator (route) with a confirmed address: it becomes the Reply-To, so an
//   unconfirmed one could make customers reply to someone else.
// - At most 5 recipients; 30 emails per shop per hour and 5 per quote per day, counted from the
//   rows below (an attempt counts, sent or failed), so the app cannot be used to spray mail.
// - The shop's signature (rate card settings) goes under the message. On request the estimator
//   gets a copy at their own confirmed address: a second message after the customer's send, so a
//   failed copy is recorded on the row (`sender_copy`) but never fails the send itself.
// - A revision whose PDF prints "Changes from ..." repeats those same customer-safe lines in the
//   body (both quotes are frozen once sent, so the lines are the ones the PDF carries).
// - Sent back to the address that emailed the RFQ in, the quote is a reply to that email
//   (In-Reply-To/References and "Re: <subject>", shared/quote-email.ts `quoteEmailThread`), so it
//   lands in the customer's own thread. If the provider refuses those headers, the same message goes
//   once more without them: a refused header fails the request before anything is sent.
// - Each attempt is a `quote_emails` row written before the send, then marked sent or failed. Logs
//   carry ids and counts, never addresses or message text.
import type { QuoteEmailDto, QuoteEmailsDto } from "@shared/api";
import {
  cleanSignature,
  composeQuoteEmail,
  composeSenderCopy,
  defaultQuoteEmailMessage,
  isEmailable,
  oneLine,
  parseRecipients,
  QUOTE_EMAIL_LIMITS,
  quoteEmailSubject,
  quoteEmailThread,
  type ThreadableRfq,
} from "@shared/quote-email";
import { quoteFileLabel, quoteLabel } from "@shared/quote-label";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { quoteEmails, quoteLinks, quotes, rfqs, user } from "../../db/schema";
import { AppError, badRequest, conflict, forbidden, notFound } from "../../lib/errors";
import { sha256Hex } from "../../lib/hash";
import { newId } from "../../lib/ids";
import { toBase64 } from "../../ports/email";
import { requiresEmailVerification } from "../auth/auth";
import { getSettings } from "../ratecard";
import { createCustomerLink } from "./customer-link";
import { pdfChanges } from "./index";

const HOUR = 60 * 60 * 1000;

/**
 * Whether sending a quote needs the estimator's address confirmed (replies go to it). Everywhere
 * sign-up verifies addresses, and in the worker tests. Not in the plain-http offline demo, where
 * sign-up skips verification because its mail goes to an in-memory fake nobody can open: there no
 * one could ever confirm, and the quote email is only recorded, never delivered.
 */
export function senderMustBeVerified(
  env: Pick<AppContext["env"], "APP_ENV" | "APP_URL" | "FAKE_EXTERNALS">,
): boolean {
  return env.APP_ENV === "test" || requiresEmailVerification(env);
}

/** Whether a real provider is wired (false for the in-memory fake and the log-only sender). */
const canDeliver = (ctx: AppContext) => ctx.email.delivers;

/** The fake sender (tests, offline demo) stands in for a provider; the log-only sender does not. */
const canRecord = (ctx: AppContext) =>
  ctx.email.delivers || ctx.env.APP_ENV === "test" || ctx.env.FAKE_EXTERNALS === "true";

async function quoteRow(ctx: AppContext, orgId: string, quoteId: string) {
  const q = await ctx.db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId)))
    .get();
  if (!q) throw notFound("Quote");
  return q;
}

/** The quote's RFQ, as far as threading needs it (null for a quote not made from an RFQ). */
async function threadableRfq(
  ctx: AppContext,
  orgId: string,
  rfqId: string | null,
): Promise<ThreadableRfq | null> {
  if (!rfqId) return null;
  const row = await ctx.db
    .select({
      source: rfqs.source,
      messageId: rfqs.messageId,
      threadReferences: rfqs.threadReferences,
      subject: rfqs.subject,
      fromAddress: rfqs.fromAddress,
    })
    .from(rfqs)
    .where(and(eq(rfqs.id, rfqId), eq(rfqs.orgId, orgId)))
    .get();
  return row ?? null;
}

async function sender(ctx: AppContext, userId: string) {
  const me = await ctx.db.select().from(user).where(eq(user.id, userId)).get();
  if (!me) throw notFound("User");
  return me;
}

function emailDto(row: typeof quoteEmails.$inferSelect, sentByName: string | null): QuoteEmailDto {
  return {
    id: row.id,
    to: row.toAddresses,
    replyTo: row.replyTo,
    subject: row.subject,
    pdfSha256: row.pdfSha256,
    status: row.status,
    delivered: row.delivered,
    error: row.error,
    sentByName,
    senderCopy: row.senderCopy ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The quote's email history (newest first) and the form's prefills. */
export async function listQuoteEmails(
  ctx: AppContext,
  orgId: string,
  userId: string,
  quoteId: string,
): Promise<QuoteEmailsDto> {
  const q = await quoteRow(ctx, orgId, quoteId);
  const me = await sender(ctx, userId);
  const settings = await getSettings(ctx, orgId);
  const rows = await ctx.db
    .select({ e: quoteEmails, name: user.name })
    .from(quoteEmails)
    .leftJoin(user, eq(user.id, quoteEmails.sentBy))
    .where(and(eq(quoteEmails.orgId, orgId), eq(quoteEmails.quoteId, quoteId)))
    .orderBy(desc(quoteEmails.createdAt))
    .limit(50)
    .all();
  const rfq = await threadableRfq(ctx, orgId, q.rfqId);
  const thread = rfq?.fromAddress ? quoteEmailThread(rfq, [rfq.fromAddress]) : null;
  return {
    items: rows.map((r) => emailDto(r.e, r.name)),
    canDeliver: canDeliver(ctx),
    defaultTo: q.customerEmail ?? "",
    defaultMessage: defaultQuoteEmailMessage(
      q.coverNote,
      q.customerContact,
      quoteLabel(q.quoteNumber, q.revNumber),
      me.name,
    ),
    replyTo: me.email,
    signature: cleanSignature(settings.emailSignature),
    changes: await emailChanges(ctx, orgId, q),
    rfqThread:
      thread && rfq?.fromAddress
        ? { from: rfq.fromAddress, subject: thread.subject ?? mailSubjectFallback(q, settings) }
        : null,
  };
}

/** The subject a threaded email keeps when the RFQ email had none: the quote's own. */
function mailSubjectFallback(
  q: typeof quotes.$inferSelect,
  settings: Awaited<ReturnType<typeof getSettings>>,
) {
  return quoteEmailSubject({
    shopName: settings.displayName,
    quoteLabel: quoteLabel(q.quoteNumber, q.revNumber),
  });
}

/**
 * The "Changes from ..." lines the PDF carries, for the body. Only a sent quote's: a draft's toggle
 * can still change, and the email only ever goes out with the PDF frozen at send.
 */
async function emailChanges(ctx: AppContext, orgId: string, q: typeof quotes.$inferSelect) {
  if (!isEmailable(q.status)) return null;
  const c = await pdfChanges(ctx, orgId, q);
  return c && c.items.length > 0 ? c : null;
}

async function countSince(ctx: AppContext, where: ReturnType<typeof and>) {
  const row = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(quoteEmails)
    .where(where)
    .get();
  return Number(row?.n ?? 0);
}

export async function emailQuote(
  ctx: AppContext,
  orgId: string,
  userId: string,
  quoteId: string,
  input: { to: string | string[]; message: string; copyMe?: boolean; customerLink?: boolean },
): Promise<QuoteEmailDto> {
  const q = await quoteRow(ctx, orgId, quoteId);
  if (!isEmailable(q.status)) {
    throw conflict(
      q.status === "draft"
        ? "Mark the quote sent first: the email attaches the PDF frozen at that moment"
        : `This quote is ${q.status}; only an open, sent quote can be emailed`,
    );
  }
  const recipients = parseRecipients(input.to);
  if (!recipients.ok) throw badRequest(recipients.error);

  const me = await sender(ctx, userId);
  if (!me.emailVerified && senderMustBeVerified(ctx.env)) {
    throw forbidden("Confirm your email address first: customers' replies go to it");
  }
  if (!canRecord(ctx)) {
    throw new AppError(503, "email_not_configured", "Email is not set up on this server");
  }

  const now = ctx.now();
  const perShop = await countSince(
    ctx,
    and(eq(quoteEmails.orgId, orgId), gt(quoteEmails.createdAt, new Date(now.getTime() - HOUR))),
  );
  if (perShop >= QUOTE_EMAIL_LIMITS.perShopPerHour) {
    throw new AppError(
      429,
      "rate_limited",
      `Your shop has emailed ${QUOTE_EMAIL_LIMITS.perShopPerHour} quotes in the last hour; try again later`,
    );
  }
  const perQuote = await countSince(
    ctx,
    and(
      eq(quoteEmails.orgId, orgId),
      eq(quoteEmails.quoteId, quoteId),
      gt(quoteEmails.createdAt, new Date(now.getTime() - 24 * HOUR)),
    ),
  );
  if (perQuote >= QUOTE_EMAIL_LIMITS.perQuotePerDay) {
    throw new AppError(
      429,
      "rate_limited",
      `This quote was emailed ${QUOTE_EMAIL_LIMITS.perQuotePerDay} times today; try again tomorrow`,
    );
  }

  // The exact sent document, checked against the hash recorded when it was frozen.
  const key = q.sentPdfKey;
  if (!key?.startsWith(`orgs/${orgId}/`) || !q.sentPdfSha256) {
    throw conflict("The sent PDF of this quote is missing");
  }
  const obj = await ctx.env.FILES.get(key);
  if (!obj) throw conflict("The sent PDF of this quote is missing");
  const bytes = new Uint8Array(await obj.arrayBuffer());
  if ((await sha256Hex(bytes)) !== q.sentPdfSha256) {
    ctx.logger.error("quote.email_pdf_hash_mismatch", { orgId, quoteId });
    throw conflict("The stored PDF does not match the one recorded as sent; not emailing it");
  }

  const settings = await getSettings(ctx, orgId);
  // Its own customer link for this email (customer-link.ts); tied to the email row below, and
  // turned off again if the send fails, so no link exists that never reached anyone.
  const link = input.customerLink ? await createCustomerLink(ctx, orgId, userId, quoteId) : null;
  const label = quoteLabel(q.quoteNumber, q.revNumber);
  const fileName = `${quoteFileLabel(q.quoteNumber, q.revNumber)}.pdf`;
  const mail = composeQuoteEmail(
    {
      shopName: settings.displayName,
      quoteLabel: label,
      fileName,
      senderName: me.name,
      senderEmail: me.email,
      validUntil: q.validUntil,
      replacesLabel: q.revNumber > 1 ? quoteLabel(q.quoteNumber, q.revNumber - 1) : null,
      signature: settings.emailSignature,
      changes: await emailChanges(ctx, orgId, q),
      acceptUrl: link?.url ?? null,
    },
    input.message,
  );

  const thread = quoteEmailThread(await threadableRfq(ctx, orgId, q.rfqId), recipients.to);
  if (thread?.subject) mail.subject = thread.subject;

  const id = newId("qem");
  await ctx.db.insert(quoteEmails).values({
    id,
    orgId,
    quoteId,
    sentBy: userId,
    toAddresses: recipients.to,
    replyTo: me.email,
    subject: mail.subject,
    pdfSha256: q.sentPdfSha256,
    status: "sending",
    delivered: false,
    createdAt: now,
  });
  if (link) {
    await ctx.db
      .update(quoteLinks)
      .set({ quoteEmailId: id })
      .where(and(eq(quoteLinks.id, link.id), eq(quoteLinks.orgId, orgId)));
  }

  const attachments = [
    { filename: fileName, content: toBase64(bytes), contentType: "application/pdf" },
  ];
  const fromName = `${oneLine(settings.displayName, 80)} via Job Shop Quote`;
  let update: Partial<typeof quoteEmails.$inferInsert>;
  try {
    const message = {
      to: recipients.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      replyTo: me.email,
      fromName,
      attachments,
    };
    let res: { id: string };
    if (thread) {
      try {
        res = await ctx.email.send({
          ...message,
          headers: { "In-Reply-To": thread.inReplyTo, References: thread.references },
        });
      } catch (e) {
        // A provider that refuses a header refuses the whole request, so nothing went out.
        if (!/header/i.test(String(e instanceof Error ? e.message : e))) throw e;
        ctx.logger.warn("quote.email_thread_headers_refused", { orgId, quoteId });
        res = await ctx.email.send(message);
      }
    } else {
      res = await ctx.email.send(message);
    }
    update = { status: "sent", delivered: ctx.email.delivers, providerMessageId: res.id };
    ctx.logger.info("quote.emailed", {
      orgId,
      quoteId,
      recipients: recipients.to.length,
      delivered: ctx.email.delivers,
      threaded: thread !== null,
    });
  } catch (e) {
    // Provider errors can quote the recipient; keep addresses out of the row and the log.
    const error = String(e instanceof Error ? e.message : e)
      .replace(/[^\s@<>"']+@[^\s@<>"']+/g, "[address]")
      .slice(0, 300);
    update = { status: "failed", error };
    ctx.logger.warn("quote.email_failed", { orgId, quoteId, error });
    if (link) {
      await ctx.db
        .update(quoteLinks)
        .set({ revokedAt: ctx.now() })
        .where(and(eq(quoteLinks.id, link.id), eq(quoteLinks.orgId, orgId)));
    }
  }
  if (update.status === "sent" && input.copyMe) {
    // Only after the customer's send went through: a copy of a failed send would mislead.
    const copy = composeSenderCopy(mail, recipients.to);
    try {
      await ctx.email.send({
        to: [me.email],
        subject: copy.subject,
        text: copy.text,
        html: copy.html,
        fromName,
        attachments,
      });
      update.senderCopy = "sent";
    } catch (e) {
      update.senderCopy = "failed";
      ctx.logger.warn("quote.email_copy_failed", {
        orgId,
        quoteId,
        error: String(e instanceof Error ? e.message : e)
          .replace(/[^\s@<>"']+@[^\s@<>"']+/g, "[address]")
          .slice(0, 300),
      });
    }
  }
  await ctx.db
    .update(quoteEmails)
    .set(update)
    .where(and(eq(quoteEmails.id, id), eq(quoteEmails.orgId, orgId)));
  const row = await ctx.db.select().from(quoteEmails).where(eq(quoteEmails.id, id)).get();
  if (!row) throw notFound("Quote email");
  if (row.status === "failed") {
    throw new AppError(
      502,
      "email_failed",
      "The email could not be sent; nothing reached the customer",
      {
        email: emailDto(row, me.name),
      },
    );
  }
  return emailDto(row, me.name);
}
