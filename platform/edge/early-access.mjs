// The early-access list for the paid products (owner, 2026-11-24: for-profit
// products first; the paid apps are built but not yet deployed).
//
// Until a product opens, its marketing pages ask people who want it to leave
// an email address. Before this, the construction page sent them to the
// public feedback form, whose text is committed to a public repository: no
// contractor posts their billing setup there. This list is private:
//
//   POST   /early-access          the page's form: {product, email, role?, note?, consent, page?, website}
//   GET    /early-access/counts   sign-ups per product, numbers only. Public, so
//                                 agents can read demand without any secret.
//   GET    /early-access?after=   the rows, for a holder of INBOX_TOKEN (same
//                                 secret as the inbox). A 404 for everyone else.
//   DELETE /early-access?email=   erase one person from every product, same token
//                                 (GDPR art. 17; the privacy copy says to write to hello@).
//
// What a sign-up is, and is not: consent to be emailed when that product opens
// (CONSENT_TEXT, stored with the version shown). It is not a marketing opt-in
// for anything else, and nothing here sends mail. The mail Worker
// (`platform/email`) records marketing opt-ins only with the owner's token, on
// purpose; this list never feeds it automatically.
//
// Retention (GDPR art. 5(1)(e)): a row is kept RETENTION_DAYS (365) after the
// sign-up and then deleted, purged on every write and every read, like the
// inbox. One address per product: signing up twice changes nothing, and the
// answer is the same either way, so the form cannot be used to learn whether
// an address is already on the list.

import { storeOf } from './store.mjs';
import { sameSecret } from './inbox.mjs';

/** Products that take early-access sign-ups: the paid bets in portfolio/monetization/bets.md. */
export const EARLY_ACCESS_PRODUCTS = Object.freeze({
  payapps: 'PayApps: pay applications, retainage and lien waivers for subcontractors',
  'jobshop-quote': 'Job shop quoting: RFQ to quote for CNC and fabrication shops',
  cmmc: 'CMMC and ISO 9001 workspace for small defense suppliers',
  einvoice: 'E-invoice fix-and-explain',
  'seller-books': 'Reseller profit and Schedule C books',
  takeoff: 'Residential takeoff from plans',
});

export const CONSENT_VERSION = '2026-11-26';
/** The words shown beside the checkbox. Pages render this constant, so what was stored is what was shown. */
export const CONSENT_TEXT =
  'Email me once when this product opens. Maris Stella Labs keeps my address privately for at most a year and uses it for nothing else.';

export const RETENTION_DAYS = 365;
export const DEFAULT_DAILY_CAP = 200;
export const EMAIL_MAX = 254;
export const ROLE_MAX = 80;
export const NOTE_MAX = 1000;
const BODY_MAX = 4000;

// Deliberately plain: one @, a dot in the domain, no spaces or angle brackets.
// Whether the address works is learned when the one email is sent.
const EMAIL_RE = /^[A-Za-z0-9._%+'-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}$/;
const PAGE_RE = /^\/[A-Za-z0-9._~/%-]{0,200}$/;
// Control characters (C0 except tab and newline, DEL, C1) never reach storage.
const CONTROL_RE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

const clean = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(CONTROL_RE, '').trim().slice(0, max) : '');

/** Lower-cased, trimmed address, or '' when it is not one. */
export function normaliseEmail(v) {
  if (typeof v !== 'string') return '';
  const e = v.trim().toLowerCase();
  return e.length <= EMAIL_MAX && EMAIL_RE.test(e) ? e : '';
}

/**
 * Pure: a submitted form to the row to store, or why not. `{ drop: true }` is
 * the silent refusal for a filled honeypot, so a script gets the same answer
 * as a person.
 */
export function earlyAccessRecord(input, now = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'body' };
  if (typeof input.website === 'string' && input.website.trim() !== '') return { drop: true };
  const product = typeof input.product === 'string' ? input.product : '';
  if (!Object.hasOwn(EARLY_ACCESS_PRODUCTS, product)) return { error: 'product' };
  const email = normaliseEmail(input.email);
  if (!email) return { error: 'email' };
  if (input.consent !== true) return { error: 'consent' };
  const page = typeof input.page === 'string' && PAGE_RE.test(input.page) ? input.page : '';
  return {
    record: {
      received: now.toISOString(),
      product,
      email,
      role: clean(input.role, ROLE_MAX),
      note: clean(input.note, NOTE_MAX),
      page,
      consent: CONSENT_VERSION,
    },
  };
}

/** The oldest `received` still kept at `now`. */
export function retentionCutoff(env, now = new Date()) {
  const days = Number.parseInt(env?.EARLY_ACCESS_RETENTION_DAYS || '', 10) || RETENTION_DAYS;
  return new Date(now.getTime() - days * 86400000).toISOString();
}

const json = (status, obj, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const notFound = () => new Response('not found\n', { status: 404 });

function authorized(request, env) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return Boolean(env.INBOX_TOKEN && token && sameSecret(token, env.INBOX_TOKEN));
}

/**
 * `POST /early-access`. `origins` are the site's allowed origins and `cors`
 * the response headers the Worker already computed for this request.
 */
export async function handleEarlyAccess(request, env, { headers, origins, cors, utcDay }, now = new Date()) {
  if (!origins.includes(headers.origin)) return json(403, { error: 'origin' }, cors);
  const raw = await request.text();
  if (raw.length > BODY_MAX) return json(413, { error: 'size' }, cors);
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return json(400, { error: 'body' }, cors);
  }
  const verdict = earlyAccessRecord(input, now);
  if (verdict.drop) return json(201, { ok: true }, cors);
  if (verdict.error) return json(400, { error: verdict.error }, cors);
  // Same per-sender limiter as the feedback form (3 a minute); the address is
  // used for the check and not stored.
  if (env.FEEDBACK_LIMITER) {
    const { success } = await env.FEEDBACK_LIMITER.limit({ key: headers['cf-connecting-ip'] || headers['x-edge-client-ip'] || 'unknown' });
    if (!success) return json(429, { error: 'slow-down' }, cors);
  }
  const store = storeOf(env);
  const cap = Number.parseInt(env.EARLY_ACCESS_DAILY_CAP || '', 10) || DEFAULT_DAILY_CAP;
  if (!(await store.takeDaily('early_access', utcDay, cap))) return json(429, { error: 'daily-cap' }, cors);
  await store.insertEarlyAccess(verdict.record);
  await store.purgeEarlyAccess(retentionCutoff(env, now));
  return json(201, { ok: true }, cors);
}

/** `GET /early-access/counts`: sign-ups per product, every listed product present. */
export async function earlyAccessCounts(env, now = new Date()) {
  const store = storeOf(env);
  await store.purgeEarlyAccess(retentionCutoff(env, now));
  const counts = Object.fromEntries(Object.keys(EARLY_ACCESS_PRODUCTS).map((p) => [p, 0]));
  for (const { product, n } of await store.countEarlyAccess()) if (Object.hasOwn(counts, product)) counts[product] = n;
  return json(200, { unit: 'distinct email addresses per product, kept at most a year; not customers', counts }, { 'access-control-allow-origin': '*' });
}

/** `GET /early-access?after=<id>`: the rows, for a holder of INBOX_TOKEN. */
export async function readEarlyAccess(request, env, now = new Date()) {
  if (!authorized(request, env)) return notFound();
  const store = storeOf(env);
  await store.purgeEarlyAccess(retentionCutoff(env, now));
  const after = Math.max(0, Number.parseInt(new URL(request.url).searchParams.get('after') || '0', 10) || 0);
  return json(200, { signups: await store.readEarlyAccess(after) });
}

/** `DELETE /early-access?email=<address>`: erase that address from every product. */
export async function deleteEarlyAccess(request, env) {
  if (!authorized(request, env)) return notFound();
  const email = normaliseEmail(new URL(request.url).searchParams.get('email') || '');
  if (!email) return new Response('email required\n', { status: 400 });
  return json(200, { deleted: await storeOf(env).deleteEarlyAccess(email) });
}
