// Who may be sent what: the one rule set every sender checks before SES is
// called (`prompts/goals.md`, pivot point 7: CAN-SPAM in the US, GDPR and
// PECR in the EU and UK, the honest-marketing hard limit). Pure, so the rules
// are tested directly.
//
// Three streams, each on its own sending domain and configuration set
// (`platform/aws/email/`), so a complaint spike in one cannot damage the
// reputation of another:
//
//   transactional  receipts, password resets, alerts a user asked for.
//                  Blocked only by a hard bounce or a complaint: a receipt
//                  is owed even to someone who unsubscribed from marketing.
//   marketing      newsletters, nurture sequences, product news. Needs a
//                  recorded opt-in (consent with source, time and the wording
//                  version shown), for consumers and businesses alike: the
//                  stricter rule everywhere is simpler than per-country ones.
//   cold           first-contact B2B outreach. Business addresses only, never
//                  to a consumer, and never to an EU/UK recipient without a
//                  documented legitimate-interest assessment id. Every message
//                  names the sender, carries a postal address and a one-click
//                  unsubscribe; the adapter adds both, it does not trust the
//                  caller to.
//
// Any unsubscribe or a complaint stops marketing and cold for good; there is
// no re-subscribe except a fresh opt-in.

export const STREAMS = Object.freeze(['transactional', 'marketing', 'cold']);
// Countries where GDPR or PECR rules govern unsolicited email (EU, EEA, UK, CH).
export const GDPR_COUNTRIES = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH'.split(' '));
const EMAIL_RE = /^[^\s@<>"]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,}$/;

/** Normalise an address for matching (lower case, trimmed). Null if not an address. */
export function normalizeAddress(addr) {
  const a = String(addr || '').trim().toLowerCase();
  return EMAIL_RE.test(a) ? a : null;
}

/**
 * Pure: may this message go? `state` is what the consent store knows about
 * the recipient: `{ suppressed: {all?, marketing?, cold?} (reasons), consent: {marketing?} }`.
 * `recipient` describes who they are: `{ kind: 'business'|'consumer'|'unknown', country?, liaId? }`.
 * Returns `{ ok: true }` or `{ ok: false, reason }`.
 */
export function maySend({ stream, to, state = {}, recipient = {} }) {
  if (!STREAMS.includes(stream)) return { ok: false, reason: 'unknown-stream' };
  if (!normalizeAddress(to)) return { ok: false, reason: 'bad-address' };
  const s = state.suppressed || {};
  if (s.all) return { ok: false, reason: `suppressed:${s.all}` };
  if (stream === 'transactional') return { ok: true };
  if (s[stream]) return { ok: false, reason: `suppressed:${s[stream]}` };
  if (s.unsubscribed) return { ok: false, reason: 'suppressed:unsubscribed' };
  if (stream === 'marketing') {
    return state.consent?.marketing ? { ok: true } : { ok: false, reason: 'no-opt-in' };
  }
  // cold
  if (recipient.kind !== 'business') return { ok: false, reason: 'cold-needs-business-recipient' };
  if (GDPR_COUNTRIES.has(String(recipient.country || '').toUpperCase()) && !recipient.liaId) {
    return { ok: false, reason: 'cold-eu-uk-needs-legitimate-interest-assessment' };
  }
  if (!recipient.country) return { ok: false, reason: 'cold-needs-recipient-country' };
  return { ok: true };
}

/** The suppression scopes an event sets: a bounce or complaint is global, an unsubscribe is per stream or all non-transactional. */
export function suppressionFor(event) {
  switch (event.type) {
    case 'hard-bounce': return [['all', 'hard-bounce']];
    case 'complaint': return [['all', 'complaint']];
    case 'unsubscribe':
      return event.stream && event.stream !== 'all'
        ? [[event.stream, 'unsubscribed']]
        : [['unsubscribed', 'unsubscribed']];
    default: return [];
  }
}

/**
 * The footer and headers a marketing or cold message must carry: who sent it,
 * where they are, and a one-click unsubscribe (RFC 8058, which Gmail and
 * Yahoo require of bulk senders). Transactional mail gets none added.
 */
export function complianceParts({ stream, sender, postalAddress, unsubscribeUrl, mailto }) {
  if (stream === 'transactional') return { text: '', html: '', headers: [] };
  if (!sender || !postalAddress || !unsubscribeUrl) throw new Error(`${stream} mail needs sender, postalAddress and unsubscribeUrl`);
  const why = stream === 'marketing' ? 'You are receiving this because you signed up.' : 'You are receiving this one-off business message because your address is published for business enquiries.';
  const text = `\n\n--\n${sender}, ${postalAddress}\n${why}\nUnsubscribe: ${unsubscribeUrl}\n`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<hr><p style="font-size:12px;color:#666">${esc(sender)}, ${esc(postalAddress)}<br>${esc(why)}<br><a href="${esc(unsubscribeUrl)}">Unsubscribe</a></p>`;
  const list = [`<${unsubscribeUrl}>`, ...(mailto ? [`<mailto:${mailto}?subject=unsubscribe>`] : [])].join(', ');
  return { text, html, headers: [{ Name: 'List-Unsubscribe', Value: list }, { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' }] };
}
