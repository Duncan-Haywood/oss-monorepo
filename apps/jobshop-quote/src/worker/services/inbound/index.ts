// Inbound RFQ email: each shop gets `rfq+{token}@{INBOUND_EMAIL_DOMAIN}`. One literal Email Routing rule,
// `rfq@{domain}` with subaddressing on (scripts/email-routing.mjs; a catch-all is apex-only, so it
// cannot serve a subdomain), hands the shops' mail to this worker's `email` handler (src/worker/index.ts), which calls
// receiveEmail. The message is parsed (src/shared/mime.ts) into a new RFQ in that shop's inbox with
// its body and readable attachments. No AI read happens here: the estimator presses "Read with AI",
// so whoever learns the address cannot spend the shop's RFQ allowance or AI budget (docs/EMAIL.md).
// A shop may also list who can email in (shared/sender-allowlist.ts); mail from anyone else is refused,
// and a listed address counts only when Cloudflare's SPF/DKIM/DMARC results vouch for it
// (shared/sender-auth.ts), so a forged From cannot get past the list.
import type { InboundEmailDto } from "@shared/api";
import { addressOf, parseEmail } from "@shared/mime";
import { threadChain } from "@shared/quote-email";
import {
  MAX_REFUSED_SENDERS,
  parseSenderEntry,
  type RefusedSender,
  senderAllowed,
} from "@shared/sender-allowlist";
import { firstOfJoined, verifySenders } from "@shared/sender-auth";
import { and, count, eq, gte } from "drizzle-orm";
import type { AppContext } from "../../context";
import { rfqs, shopSettings } from "../../db/schema";
import { AppError } from "../../lib/errors";
import {
  createEmailedRfq,
  isAcceptedFile,
  MAX_FILE_BYTES,
  MAX_FILES,
  type UploadedFile,
} from "../rfq";
import { notifyRfqArrival, rfqArrivalNotifyFor, saveRfqArrivalNotify } from "./notify";

/** Cloudflare Email Routing's own ceiling for a message. */
export const MAX_RAW_BYTES = 25 * 1024 * 1024;
/** Emailed RFQs a shop accepts in 24 hours; more are refused (a flood guard, not a plan limit). */
export const DAILY_LIMIT = 50;
/** Body characters kept; the rest is noted as cut. */
export const MAX_BODY_CHARS = 100_000;
/** Inline images smaller than this with a Content-ID are signature logos, not drawings. */
export const SIGNATURE_IMAGE_BYTES = 40 * 1024;

const TOKEN_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"; // gitleaks:allow (Crockford base32 alphabet, not a key)
const TOKEN_LENGTH = 16; // 80 bits
/**
 * `rfq+{token}` (what we hand out: Email Routing matches it to the `rfq@` rule by subaddressing) or
 * the older `rfq-{token}` (served only by an apex catch-all). A `+tag` after the token is ignored.
 */
const LOCAL_PART = /^rfq[+-]([0-9a-z]{16})(?:\+[^@]*)?$/;

export function newInboundToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH));
  let out = "";
  for (const b of bytes) out += TOKEN_ALPHABET[b & 31];
  return out;
}

/** The domain mail is received on, or null while inbound email is not set up. */
export function inboundDomain(env: AppContext["env"]): string | null {
  const d = (env.INBOUND_EMAIL_DOMAIN ?? "").trim().toLowerCase();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
}

export const inboundAddress = (domain: string, token: string) => `rfq+${token}@${domain}`;

/** The token in a recipient address on our domain; null for anything else. */
export function tokenFromRecipient(to: string, domain: string): string | null {
  const addr = to.trim().toLowerCase();
  const at = addr.lastIndexOf("@");
  if (at < 0 || addr.slice(at + 1) !== domain) return null;
  return LOCAL_PART.exec(addr.slice(0, at))?.[1] ?? null;
}

async function emailedLast24h(ctx: AppContext, orgId: string) {
  const since = new Date(ctx.now().getTime() - 24 * 60 * 60 * 1000);
  const row = await ctx.db
    .select({ n: count() })
    .from(rfqs)
    .where(and(eq(rfqs.orgId, orgId), eq(rfqs.source, "email"), gte(rfqs.createdAt, since)))
    .get();
  return row?.n ?? 0;
}

/** `userId` is the signed-in member, for their own `notifyMe`; without one it reads false. */
export async function getInboundEmail(
  ctx: AppContext,
  orgId: string,
  userId?: string,
): Promise<InboundEmailDto> {
  const domain = inboundDomain(ctx.env);
  const row = await ctx.db
    .select({
      token: shopSettings.inboundToken,
      allowed: shopSettings.inboundAllowedSenders,
      refused: shopSettings.inboundRefusedSenders,
    })
    .from(shopSettings)
    .where(eq(shopSettings.orgId, orgId))
    .get();
  return {
    available: domain !== null,
    address: domain && row?.token ? inboundAddress(domain, row.token) : null,
    last24h: await emailedLast24h(ctx, orgId),
    dailyLimit: DAILY_LIMIT,
    notifyMe: userId ? await rfqArrivalNotifyFor(ctx, orgId, userId) : false,
    allowedSenders: row?.allowed ?? [],
    refusedSenders: row?.refused ?? [],
  };
}

/**
 * Replace the shop's sender allowlist (admins). Every entry must read as an address or a domain;
 * otherwise nothing is saved and the 400 names the entries. A sender now on the list leaves the
 * refused list, so the card stops offering to add it.
 */
export async function setAllowedSenders(
  ctx: AppContext,
  orgId: string,
  input: readonly string[],
  userId?: string,
) {
  const entries: string[] = [];
  const invalid: string[] = [];
  for (const raw of input) {
    if (!raw.trim()) continue;
    const e = parseSenderEntry(raw);
    if (!e) invalid.push(raw.trim());
    else if (!entries.includes(e)) entries.push(e);
  }
  if (invalid.length > 0) {
    throw new AppError(
      400,
      "invalid_sender",
      `Not an email address or a domain: ${invalid.slice(0, 5).join(", ")}`,
      { invalid },
    );
  }
  const row = await ctx.db
    .select({ refused: shopSettings.inboundRefusedSenders })
    .from(shopSettings)
    .where(eq(shopSettings.orgId, orgId))
    .get();
  // An empty list lets everyone in, so nothing stays refused.
  const refused =
    entries.length === 0
      ? []
      : (row?.refused ?? []).filter((r) => !senderAllowed(entries, [r.address]));
  await ctx.db
    .update(shopSettings)
    .set({ inboundAllowedSenders: entries, inboundRefusedSenders: refused })
    .where(eq(shopSettings.orgId, orgId));
  ctx.logger.info("inbound.senders_set", { orgId, entries: entries.length });
  return getInboundEmail(ctx, orgId, userId);
}

/** Remember a refused sender for the settings card: newest first, one row per address. */
async function rememberRefused(
  ctx: AppContext,
  orgId: string,
  previous: RefusedSender[],
  address: string,
  why: RefusedSender["why"],
) {
  const next: RefusedSender[] = [
    { address: address.slice(0, 320), at: ctx.now().toISOString(), why },
    ...previous.filter((r) => r.address !== address),
  ].slice(0, MAX_REFUSED_SENDERS);
  await ctx.db
    .update(shopSettings)
    .set({ inboundRefusedSenders: next })
    .where(eq(shopSettings.orgId, orgId));
}

/** The signed-in member turns their own "email me when an RFQ arrives" on or off. */
export async function setRfqArrivalNotify(
  ctx: AppContext,
  orgId: string,
  userId: string,
  on: boolean,
) {
  await saveRfqArrivalNotify(ctx, orgId, userId, on);
  return getInboundEmail(ctx, orgId, userId);
}

/** Turn the address on, or replace it: mail to the old address is refused from now on. */
export async function rotateInboundEmail(ctx: AppContext, orgId: string, userId?: string) {
  if (!inboundDomain(ctx.env)) {
    throw new AppError(
      503,
      "inbound_email_not_configured",
      "Receiving RFQs by email is not set up on this server yet",
    );
  }
  await ctx.db
    .update(shopSettings)
    .set({ inboundToken: newInboundToken() })
    .where(eq(shopSettings.orgId, orgId));
  ctx.logger.info("inbound.address_rotated", { orgId });
  return getInboundEmail(ctx, orgId, userId);
}

export async function disableInboundEmail(ctx: AppContext, orgId: string, userId?: string) {
  await ctx.db
    .update(shopSettings)
    .set({ inboundToken: null })
    .where(eq(shopSettings.orgId, orgId));
  ctx.logger.info("inbound.address_disabled", { orgId });
  return getInboundEmail(ctx, orgId, userId);
}

export interface InboundMessage {
  /** Envelope sender (SMTP MAIL FROM). */
  from: string;
  /** Envelope recipient (SMTP RCPT TO). */
  to: string;
  rawSize: number;
  raw: ReadableStream<Uint8Array> | Uint8Array;
  /**
   * `message.headers.get("authentication-results")`: repeated headers joined with ", ", Cloudflare's
   * first. Optional; without it the first such header in the raw message is read.
   */
  authenticationResults?: string | null;
}

export const REFUSED_NOT_LISTED =
  "This shop takes RFQs by email only from senders it has listed; contact the shop";
export const REFUSED_UNVERIFIED =
  "This shop takes RFQs by email only from listed senders whose mail passes SPF, DKIM or DMARC; your message did not, so contact the shop";

export type ReceiveResult =
  | { ok: true; rfqId: string; duplicate: boolean }
  | { ok: false; reason: string };

/** Turn one inbound message into an RFQ, or say why it is refused (the SMTP reject text). */
export async function receiveEmail(ctx: AppContext, msg: InboundMessage): Promise<ReceiveResult> {
  const domain = inboundDomain(ctx.env);
  const token = domain ? tokenFromRecipient(msg.to, domain) : null;
  // One answer for "no such address" and "turned off", so the reply reveals nothing about shops.
  const unknown = { ok: false as const, reason: "No such RFQ address" };
  if (!token) return unknown;
  const shop = await ctx.db
    .select({
      orgId: shopSettings.orgId,
      allowed: shopSettings.inboundAllowedSenders,
      refused: shopSettings.inboundRefusedSenders,
    })
    .from(shopSettings)
    .where(eq(shopSettings.inboundToken, token))
    .get();
  if (!shop) return unknown;
  const orgId = shop.orgId;
  const log = ctx.logger.child({ orgId });

  if (msg.rawSize > MAX_RAW_BYTES) {
    log.info("inbound.refused_size", { rawSize: msg.rawSize });
    return { ok: false, reason: "Message too large: send drawings of 25 MB or less in total" };
  }
  if ((await emailedLast24h(ctx, orgId)) >= DAILY_LIMIT) {
    log.warn("inbound.refused_daily_limit", { limit: DAILY_LIMIT });
    return { ok: false, reason: "This shop's RFQ inbox is full for today; try again tomorrow" };
  }

  const raw =
    msg.raw instanceof Uint8Array
      ? msg.raw
      : new Uint8Array(await new Response(msg.raw).arrayBuffer());
  if (raw.byteLength > MAX_RAW_BYTES) {
    return { ok: false, reason: "Message too large: send drawings of 25 MB or less in total" };
  }
  const email = parseEmail(raw);
  const envelopeFrom = addressOf(msg.from);
  const headerFrom = addressOf(email.from);
  const auth = verifySenders(
    firstOfJoined(msg.authenticationResults ?? null) ?? email.authenticationResults,
    envelopeFrom,
    headerFrom,
  );
  if (!senderAllowed(shop.allowed, [envelopeFrom, headerFrom])) {
    log.info("inbound.refused_sender", { allowlist: shop.allowed.length });
    const shown = headerFrom ?? envelopeFrom;
    if (shown) await rememberRefused(ctx, orgId, shop.refused, shown, "not_listed");
    return { ok: false, reason: REFUSED_NOT_LISTED };
  }
  // On the list by what it claims; now one listed address must be shown to be real.
  const verified = [
    auth.envelopeVerified ? envelopeFrom : null,
    auth.fromVerified ? headerFrom : null,
  ];
  if (!senderAllowed(shop.allowed, verified)) {
    log.warn("inbound.refused_unverified", {
      allowlist: shop.allowed.length,
      checked: auth.checked,
      spf: auth.spf,
      dkim: auth.dkim,
      dmarc: auth.dmarc,
    });
    const shown = headerFrom ?? envelopeFrom;
    if (shown) await rememberRefused(ctx, orgId, shop.refused, shown, "unverified");
    return { ok: false, reason: REFUSED_UNVERIFIED };
  }
  const messageId = email.messageId?.slice(0, 300) ?? null;

  if (messageId) {
    const seen = await ctx.db
      .select({ id: rfqs.id })
      .from(rfqs)
      .where(and(eq(rfqs.orgId, orgId), eq(rfqs.messageId, messageId)))
      .get();
    if (seen) return { ok: true, rfqId: seen.id, duplicate: true };
  }

  const notes = [...email.notes];
  // With no list everyone is accepted, but the estimator is warned about a likely forgery.
  if (auth.checked && auth.dmarc === "fail") {
    notes.push(
      "This email failed its sender domain's DMARC check: the From address may be forged. Confirm the request with the customer before quoting.",
    );
  }
  const files: UploadedFile[] = [];
  for (const a of email.attachments) {
    if (a.bytes.byteLength === 0) continue;
    if (
      a.inline &&
      a.contentId &&
      a.contentType.startsWith("image/") &&
      a.bytes.byteLength < SIGNATURE_IMAGE_BYTES
    ) {
      continue; // a logo in the signature
    }
    const file = {
      name: a.fileName,
      type: a.contentType,
      bytes: a.bytes.slice().buffer as ArrayBuffer,
    };
    if (!isAcceptedFile(file)) {
      notes.push(`${a.fileName} was not stored: email PDF drawings, text, images or CAD files.`);
    } else if (a.bytes.byteLength > MAX_FILE_BYTES) {
      notes.push(`${a.fileName} was not stored: it is larger than 15 MB.`);
    } else if (files.length >= MAX_FILES) {
      notes.push(`${a.fileName} was not stored: an RFQ holds at most ${MAX_FILES} files.`);
    } else {
      files.push(file);
    }
  }

  let bodyText = email.text;
  if (bodyText.length > MAX_BODY_CHARS) {
    bodyText = bodyText.slice(0, MAX_BODY_CHARS);
    notes.push(`The email text was cut at ${MAX_BODY_CHARS.toLocaleString("en-US")} characters.`);
  }
  if (!bodyText.trim() && files.length === 0) {
    log.info("inbound.refused_empty", { notes: notes.length });
    return { ok: false, reason: "The email had no text or readable attachments" };
  }

  let rfqId: string;
  try {
    rfqId = await createEmailedRfq(ctx, orgId, {
      subject: email.subject,
      bodyText,
      fromAddress: envelopeFrom ?? headerFrom,
      messageId,
      threadReferences: threadChain(email.references, email.inReplyTo),
      intakeNotes: notes,
      files,
    });
  } catch (e) {
    // Two deliveries of one message at once: the unique (org, message id) index keeps one.
    if (messageId && /UNIQUE/i.test(String(e))) {
      const seen = await ctx.db
        .select({ id: rfqs.id })
        .from(rfqs)
        .where(and(eq(rfqs.orgId, orgId), eq(rfqs.messageId, messageId)))
        .get();
      if (seen) return { ok: true, rfqId: seen.id, duplicate: true };
    }
    throw e;
  }
  log.info("inbound.rfq_created", { rfqId, files: files.length, notes: notes.length });
  // Members who asked are told it arrived; a send failure never refuses the message (notify.ts).
  await notifyRfqArrival(ctx, {
    orgId,
    rfqId,
    subject: email.subject,
    fromAddress: envelopeFrom ?? headerFrom,
    filesStored: files.length,
    notes: notes.length,
  });
  return { ok: true, rfqId, duplicate: false };
}
