// Inbound RFQ email, sender allowlist (services/inbound, docs/EMAIL.md). A shop can say which
// senders may turn an email into an RFQ: whole addresses ("buyer@acme.com") or whole domains
// ("@acme.com", which also covers subdomains such as "mail.acme.com"). An empty list accepts
// everyone, as before. Pure, so the settings form and the worker check entries the same way.
//
// The From header and the envelope sender can both be forged, so a match counts only when
// Cloudflare's SPF/DKIM/DMARC results back that address (shared/sender-auth.ts, applied in
// services/inbound). The address's random token stays the first secret.

/** Most entries a shop can keep. */
export const MAX_ALLOWED_SENDERS = 100;
/** Refused senders remembered for the settings card, newest first. */
export const MAX_REFUSED_SENDERS = 10;

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const LOCAL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}$/;

function validDomain(d: string): boolean {
  if (d.length > 253) return false;
  const labels = d.split(".");
  if (labels.length < 2) return false;
  if (!/^[a-z]{2,63}$/.test(labels.at(-1) ?? "")) return false;
  return labels.every((l) => LABEL.test(l));
}

/**
 * One entry as typed, normalised to "local@domain" or "@domain"; null if it is neither.
 * A bare "acme.com" or "*.acme.com" is read as the domain "@acme.com".
 */
export function parseSenderEntry(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (s.startsWith("<") && s.endsWith(">")) s = s.slice(1, -1).trim();
  if (s.startsWith("*.")) s = `@${s.slice(2)}`;
  if (!s.includes("@")) s = `@${s}`;
  const at = s.lastIndexOf("@");
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  if (!validDomain(domain)) return null;
  if (local === "") return `@${domain}`;
  if (!LOCAL.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes(".."))
    return null;
  return `${local}@${domain}`;
}

/** A refused sender remembered for the settings card. */
export interface RefusedSender {
  address: string;
  at: string;
  /**
   * "not_listed": no claimed sender is on the list (an admin can allow it). "unverified": it claimed
   * a listed address that SPF/DKIM/DMARC did not back (shared/sender-auth.ts), so allowing it again
   * would not help. Rows saved before this field read as "not_listed".
   */
  why?: "not_listed" | "unverified";
}

export interface SenderListResult {
  /** Normalised, de-duplicated, in the order typed. */
  entries: string[];
  /** What could not be read, as typed. */
  invalid: string[];
}

/** Split text the admin typed (one per line, or separated by commas, semicolons or spaces). */
export function parseSenderList(text: string): SenderListResult {
  const entries: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    if (!raw) continue;
    const e = parseSenderEntry(raw);
    if (!e) invalid.push(raw);
    else if (!entries.includes(e)) entries.push(e);
  }
  return { entries, invalid };
}

/** Whether one address is covered by one normalised entry. */
export function entryCovers(entry: string, address: string): boolean {
  const addr = address.trim().toLowerCase();
  const at = addr.lastIndexOf("@");
  if (at <= 0) return false;
  if (!entry.startsWith("@")) return entry === addr;
  const domain = addr.slice(at + 1);
  const want = entry.slice(1);
  return domain === want || domain.endsWith(`.${want}`);
}

/**
 * Whether mail claiming any of `senders` (the envelope sender and the From header's address) may
 * become an RFQ. An empty list allows everyone; otherwise one sender must be covered by one entry.
 * Either may match, so a shop's own mailbox forwarding a customer's RFQ (envelope from the shop,
 * From the customer) passes when either is on the list.
 */
export function senderAllowed(list: readonly string[], senders: readonly (string | null)[]) {
  if (list.length === 0) return true;
  return senders.some((s) => s !== null && list.some((e) => entryCovers(e, s)));
}
