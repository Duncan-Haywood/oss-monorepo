// Emailing a sent quote to the customer: who it may go to, and what the message says. Pure, so the
// worker (services/quotes/email.ts) and the quote page share the same rules.
//
// The message is the estimator's own text (by default the quote's cover note) plus a fixed footer
// that names the shop, the quote and the attached PDF. Nothing here prices anything: the numbers
// are in the attached PDF, the exact document frozen when the quote was marked sent.

import { acceptLinkLine } from "./customer-link";

/** At most this many recipients per send (the customer's buyer, engineer, a shared inbox...). */
export const MAX_QUOTE_EMAIL_RECIPIENTS = 5;
/** The estimator's message, plain text. */
export const MAX_QUOTE_EMAIL_MESSAGE = 8000;
/** The shop's email signature (rate card settings), plain text. */
export const MAX_EMAIL_SIGNATURE = 1000;
/** Per shop, per rolling hour, and per quote, per rolling day (sent or failed attempts count). */
export const QUOTE_EMAIL_LIMITS = {
  perShopPerHour: 30,
  perQuotePerDay: 5,
} as const;

/** Statuses a quote can be emailed from: the open, sent quote only. */
export const EMAILABLE_STATUSES = ["sent"] as const;

export function isEmailable(status: string): boolean {
  return (EMAILABLE_STATUSES as readonly string[]).includes(status);
}

/** One bare address (the same rule as the worker's email port). */
const ADDRESS_RE =
  /^[^\s@"'<>(),;:\\[\]]{1,64}@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

export const isQuoteEmailAddress = (s: string) => s.length <= 254 && ADDRESS_RE.test(s);

export type RecipientsResult = { ok: true; to: string[] } | { ok: false; error: string };

/**
 * Recipients typed into one box ("a@x.com, b@x.com" or one per line), or a list. Trimmed,
 * lower-cased for the duplicate check (the first spelling is kept), each one a bare address.
 */
export function parseRecipients(input: string | string[]): RecipientsResult {
  const parts = (Array.isArray(input) ? input : [input])
    .flatMap((s) => s.split(/[\s,;]+/))
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const to: string[] = [];
  for (const p of parts) {
    if (!isQuoteEmailAddress(p))
      return { ok: false, error: `"${p.slice(0, 80)}" is not an email address` };
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    to.push(p);
  }
  if (to.length === 0) return { ok: false, error: "Add the customer's email address" };
  if (to.length > MAX_QUOTE_EMAIL_RECIPIENTS) {
    return { ok: false, error: `Send to at most ${MAX_QUOTE_EMAIL_RECIPIENTS} addresses at once` };
  }
  return { ok: true, to };
}

export interface QuoteEmailFacts {
  shopName: string;
  /** "Q-1001" or "Q-1001 Rev 2". */
  quoteLabel: string;
  /** The PDF's file name, "Q-1001.pdf". */
  fileName: string;
  /** The estimator who sends it; replies go to them. */
  senderName: string;
  senderEmail: string;
  validUntil: string | null;
  /** Set for a revision: "Q-1001" (what it replaces). */
  replacesLabel: string | null;
  /**
   * The shop's signature block (rate card settings: name, address, phone, certifications), placed
   * under the estimator's message on every quote email. Null or blank for none.
   */
  signature?: string | null;
  /**
   * The "Changes from Q-1001" section the attached PDF prints (a revision with the toggle on and
   * something the customer can see changed), repeated in the body so the buyer sees what moved
   * before opening the attachment. Null, or no items, when the PDF carries none.
   */
  changes?: QuoteEmailChanges | null;
  /**
   * The customer link's URL (shared/customer-link.ts) when the email carries one: the footer then
   * says where to accept or decline online.
   */
  acceptUrl?: string | null;
}

/** The same customer-safe lines as the PDF section (shared/quote-change-summary.ts). */
export interface QuoteEmailChanges {
  /** "Q-1001": the revision this one replaces, as the PDF names it. */
  fromLabel: string;
  items: string[];
}

/** At most this many change lines in the body; the PDF has the rest. */
export const MAX_EMAIL_CHANGE_LINES = 20;

/**
 * The body's "Changes from ..." block as plain lines (heading, then "- item"), or [] when there is
 * nothing to say. Each item is made one line; past the cap a last line points to the PDF.
 */
export function quoteEmailChangeLines(c: QuoteEmailChanges | null | undefined): string[] {
  const items = (c?.items ?? []).map((i) => oneLine(i, 300)).filter(Boolean);
  if (!c || items.length === 0) return [];
  const shown = items.slice(0, MAX_EMAIL_CHANGE_LINES).map((i) => `- ${i}`);
  const rest = items.length - shown.length;
  if (rest > 0) shown.push(`- and ${rest} more, listed in the attached PDF`);
  return [`Changes from ${oneLine(c.fromLabel, 80)}:`, ...shown];
}

export interface ComposedQuoteEmail {
  subject: string;
  text: string;
  html: string;
}

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);

/** One line: control characters become spaces (for the subject and names in it). */
export function oneLine(s: string, max = 200): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029 ? " " : ch;
  }
  return out.replace(/ {2,}/g, " ").trim().slice(0, max);
}

export function quoteEmailSubject(f: Pick<QuoteEmailFacts, "shopName" | "quoteLabel">): string {
  return oneLine(`Quote ${f.quoteLabel} from ${f.shopName}`);
}

/** The fixed footer under the estimator's message: what is attached and where replies go. */
export function quoteEmailFooter(f: QuoteEmailFacts): string[] {
  const lines = [`Attached: ${f.fileName}, quote ${f.quoteLabel} from ${oneLine(f.shopName)}.`];
  if (f.replacesLabel) lines.push(`This revision replaces ${f.replacesLabel}.`);
  if (f.validUntil) lines.push(`Prices are valid until ${f.validUntil}.`);
  if (f.acceptUrl) lines.push(acceptLinkLine(f.acceptUrl));
  lines.push(`Reply to this email to reach ${oneLine(f.senderName, 120)} (${f.senderEmail}).`);
  return lines;
}

/**
 * The email: subject, a plain-text body (the estimator's message, then the footer) and the same as
 * HTML with every character of the message escaped (no markup from the message survives).
 */
export function composeQuoteEmail(f: QuoteEmailFacts, message: string): ComposedQuoteEmail {
  const body = message.replace(/\r\n?/g, "\n").trim();
  const signature = cleanSignature(f.signature);
  const footer = quoteEmailFooter(f);
  const changes = quoteEmailChangeLines(f.changes);
  const changesText = changes.length ? `${changes.join("\n")}\n\n` : "";
  const text = `${body ? `${body}\n\n` : ""}${changesText}${signature ? `${signature}\n\n` : ""}--\n${footer.join("\n")}\n`;
  const paragraphs = body
    ? body
        .split(/\n{2,}/)
        .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
        .join("\n")
    : "";
  const [changesHead, ...changeItems] = changes;
  const changesHtml = changesHead
    ? `\n<p style="margin-bottom:4px"><strong>${escapeHtml(changesHead)}</strong></p>\n<ul style="margin-top:0">${changeItems
        .map((l) => `<li>${escapeHtml(l.replace(/^- /, ""))}</li>`)
        .join("")}</ul>`
    : "";
  const sigHtml = signature
    ? `\n<p style="color:#44403c">${escapeHtml(signature).replace(/\n/g, "<br>")}</p>`
    : "";
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1c1917">
${paragraphs}${changesHtml}${sigHtml}
<p style="margin-top:24px;border-top:1px solid #d6d3d1;padding-top:8px;font-size:12px;color:#57534e">${footer
    .map((l) =>
      f.acceptUrl && l === acceptLinkLine(f.acceptUrl)
        ? `<strong>Accept or decline this quote online:</strong> <a href="${escapeHtml(f.acceptUrl)}">${escapeHtml(f.acceptUrl)}</a>`
        : escapeHtml(l),
    )
    .join("<br>")}</p>
</body></html>`;
  return { subject: quoteEmailSubject(f), text, html };
}

/**
 * The signature as it goes into the email: line endings normalised, trailing spaces and blank lines
 * collapsed (a signature is one block, so the HTML keeps it in one paragraph), capped in length.
 * Null when nothing is left.
 */
export function cleanSignature(s: string | null | undefined): string | null {
  if (!s) return null;
  const lines = s
    .replace(/\r\n?/g, "\n")
    .slice(0, MAX_EMAIL_SIGNATURE)
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim() !== "");
  return lines.length ? lines.join("\n") : null;
}

/**
 * The estimator's own copy of a quote email: the same message and attachment, to their own
 * confirmed address, with a first line saying who the original went to. A separate message rather
 * than a Cc, so the customer never sees a second address and a failed copy cannot stop the send.
 */
export function composeSenderCopy(mail: ComposedQuoteEmail, to: string[]): ComposedQuoteEmail {
  const sentTo = to.join(", ");
  const note = `Your copy: this quote email was sent to ${sentTo}.`;
  return {
    subject: oneLine(`Copy: ${mail.subject}`),
    text: `${note}\n\n${mail.text}`,
    // A function replacement: an address may contain "$", which a string replacement would expand.
    html: mail.html.replace(
      /<body([^>]*)>/,
      (_m, attrs: string) =>
        `<body${attrs}>\n<p style="font-size:12px;color:#57534e;border-bottom:1px solid #d6d3d1;padding-bottom:8px">${escapeHtml(note)}</p>`,
    ),
  };
}

/** The message the form starts with: the quote's cover note, else a short default. */
export function defaultQuoteEmailMessage(
  coverNote: string | null,
  customerName: string | null,
  quoteLabel: string,
  senderName = "",
): string {
  if (coverNote?.trim()) return coverNote.trim();
  const sign = senderName.trim() ? `\n${oneLine(senderName, 120)}` : "";
  const hello = customerName?.trim() ? `Hello ${oneLine(customerName, 120)},` : "Hello,";
  return `${hello}\n\nThank you for the RFQ. Our quote ${quoteLabel} is attached.\n\nBest regards,${sign}`;
}

// ---- Threading the quote into the customer's RFQ email ------------------------------------------
//
// An RFQ that arrived at the shop's inbound address keeps its Message-ID (services/inbound). When
// the quote goes back to the person who sent that email, it goes as a reply to it: In-Reply-To and
// References name the RFQ's Message-ID (RFC 5322 § 3.6.4) and the subject is "Re: <their subject>",
// which Gmail also needs before it joins a thread. The quote's own label stays in the footer and the
// attachment's name. An RFQ an estimator forwarded in (envelope sender not among the recipients),
// a pasted one, or one without a usable Message-ID is not threaded: the customer never saw that
// message, so a reply to it would make no sense to them.
//
// When the RFQ was itself a reply (a buyer answering an earlier quote, or a thread with the
// buyer's own purchasing team), the quote keeps that thread's chain: RFC 5322 § 3.6.4 says a
// reply's References holds the parent's References followed by the parent's Message-ID, or, when
// the parent has no References but an In-Reply-To with a single msg-id, that In-Reply-To instead.
// Intake stores the parent's part of that chain (`threadChain`); the send appends the Message-ID.

/** The RFQ fields threading reads. */
export interface ThreadableRfq {
  source: "manual" | "email";
  messageId: string | null;
  /** The RFQ email's own thread chain (`threadChain`), space separated, or null. */
  threadReferences: string | null;
  subject: string | null;
  fromAddress: string | null;
}

export interface QuoteEmailThread {
  /** The RFQ email's Message-ID, angle brackets included. */
  inReplyTo: string;
  /** The RFQ's own chain, then its Message-ID, space separated (`limitReferences`). */
  references: string;
  /** "Re: <the RFQ email's subject>", or null to keep the quote's own subject (no subject on it). */
  subject: string | null;
}

/**
 * A Message-ID safe to repeat in a header: one `<id-left@id-right>` of visible ASCII with no
 * brackets, quotes, backslashes or spaces inside (RFC 5322 § 3.6.4 msg-id, dot-atom form, which is
 * what mail clients send), at most 250 characters. Anything else is not used.
 */
export function isSafeMessageId(s: string | null | undefined): s is string {
  return (
    typeof s === "string" &&
    s.length <= 250 &&
    /^<[\x21-\x7e]+>$/.test(s) &&
    /^<[^<>"\\@]+@[^<>"\\@]+>$/.test(s)
  );
}

/** "Re: <subject>" on one line; a subject already starting with "Re:" is kept as it is. */
export function replySubject(subject: string): string {
  const s = oneLine(subject, 180);
  return /^re\s*:/i.test(s) ? s : `Re: ${s}`;
}

/**
 * How a quote email threads into its RFQ's email for these recipients, or null when it should not:
 * only an emailed RFQ with a safe Message-ID, sent back to the address that emailed it.
 */
export function quoteEmailThread(
  rfq: ThreadableRfq | null | undefined,
  to: string[],
): QuoteEmailThread | null {
  if (rfq?.source !== "email" || !isSafeMessageId(rfq.messageId)) return null;
  const from = rfq.fromAddress?.trim().toLowerCase();
  if (!from || !to.some((a) => a.trim().toLowerCase() === from)) return null;
  const subject = rfq.subject && oneLine(rfq.subject) ? replySubject(rfq.subject) : null;
  const chain = messageIdsIn(rfq.threadReferences).filter((id) => id !== rfq.messageId);
  const references = limitReferences([...chain, rfq.messageId]).join(" ");
  return { inReplyTo: rfq.messageId, references, subject };
}

/** At most this many Message-IDs go in the References header the quote is sent with. */
export const MAX_REFERENCES = 20;
/**
 * And at most this many characters, so the header stays on one line well under RFC 5322's 998
 * character limit (§ 2.1.1) whatever the provider does about folding.
 */
export const MAX_REFERENCES_CHARS = 900;

/**
 * The safe Message-IDs (`isSafeMessageId`) in a References or In-Reply-To field, in order and
 * without repeats. Anything between them (comments, stray words some clients add) is dropped.
 */
export function messageIdsIn(field: string | null | undefined): string[] {
  if (!field) return [];
  const out: string[] = [];
  for (const m of field.matchAll(/<[^<>\s]*>/g)) {
    const id = m[0];
    if (isSafeMessageId(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * The part of a reply's References that comes from its parent (RFC 5322 § 3.6.4): the parent's
 * References, else its In-Reply-To when that holds exactly one Message-ID, else nothing. The
 * parent's own Message-ID is not included (it is stored on its own). Null when there is no chain.
 */
export function threadChain(
  references: string | null | undefined,
  inReplyTo: string | null | undefined,
): string | null {
  let ids = messageIdsIn(references);
  if (ids.length === 0) {
    const parents = messageIdsIn(inReplyTo);
    ids = parents.length === 1 ? parents : [];
  }
  ids = limitReferences(ids);
  return ids.length > 0 ? ids.join(" ") : null;
}

/**
 * A chain cut to `MAX_REFERENCES` ids and `MAX_REFERENCES_CHARS` characters: the first id (the
 * thread's root, which clients match on most) and then as many of the newest as fit, in order.
 */
export function limitReferences(ids: string[]): string[] {
  const fits = (list: string[]) =>
    list.length <= MAX_REFERENCES && list.join(" ").length <= MAX_REFERENCES_CHARS;
  if (fits(ids)) return ids;
  const [root, ...rest] = ids;
  if (root === undefined) return [];
  const tail: string[] = [];
  for (let i = rest.length - 1; i >= 0; i--) {
    const id = rest[i] as string;
    if (!fits([root, id, ...tail])) break;
    tail.unshift(id);
  }
  return [root, ...tail];
}
