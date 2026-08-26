// A link back to one bid, carried in the URL fragment.
//
// Everything the calculator reads goes after the `#`. Browsers never send a
// fragment to a server — not in the request line, not in the Referer header —
// so copying a link keeps the promise the rest of this tool makes. The wage
// you pay your installer and the price you are considering stay between you
// and whoever you send the link to. A query string would not do this: it
// reaches the host of every page the recipient clicks through to next.
//
// There is deliberately no list of fields here. `encodeBid` takes whatever
// `readInput()` returned, and `applyBid` writes back whatever ids the page
// actually has. An allowlist is the known failure mode in this repository: a
// field gets added to a calculator and forgotten in the list, the link drops
// it in silence, and the recipient prices the job off a different number than
// the sender saw. That is a wrong bid rather than an error message, which is
// the worst shape a bug can take in a tool people quote money from.

// Marks a fragment as a bid rather than an in-page anchor, so `#faq` and
// `#pricing` keep working and are never mistaken for a (empty) shared bid.
export const BID_MARKER = 'bid';

// The one control that must never travel. Whether a visitor opted out of the
// local, aggregate-only usage count is their choice about their own browser,
// not part of the job being priced; carrying it would let a link quietly turn
// counting back on for someone who had switched it off.
export const NEVER_SHARED = new Set(['usageOptOut']);

/**
 * Snapshot every control on the page.
 *
 * Reading the DOM rather than a list of field names is the whole point: a
 * field added to the calculator next month is in the link the day it ships,
 * with nothing here to update and nothing to forget. That is the failure this
 * module exists to rule out — a dropped field does not raise an error, it
 * hands the recipient a different price.
 */
export function readShareValues(doc, skip = NEVER_SHARED) {
  const values = {};
  if (!doc || typeof doc.querySelectorAll !== 'function') return values;
  for (const field of doc.querySelectorAll('input[id], select[id], textarea[id]')) {
    if (skip.has(field.id)) continue;
    values[field.id] = field.type === 'checkbox' || field.type === 'radio'
      ? field.checked
      : field.value;
  }
  return values;
}

// A hand-built fragment is untrusted input. These bounds keep a hostile or
// corrupt link from turning into unbounded work before anything is applied.
const MAX_FIELDS = 250;
const MAX_LENGTH = 12000;

// Assigning these to a plain object is how prototype pollution starts.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Encode a `readInput()` result as a URL fragment.
 * Values are stringified; booleans become `1`/`0` because a checkbox reads
 * back through the DOM, not through this format.
 */
export function encodeBid(values = {}) {
  const params = new URLSearchParams();
  params.set(BID_MARKER, '1');
  for (const [key, value] of Object.entries(values)) {
    if (UNSAFE_KEYS.has(key)) continue;
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'boolean') params.set(key, value ? '1' : '0');
    else if (typeof value === 'number') {
      if (!Number.isFinite(value)) continue;
      params.set(key, String(value));
    } else if (typeof value === 'string') params.set(key, value);
    // Anything else (an object, a function) is not a form value and is
    // dropped rather than serialised as "[object Object]".
  }
  return params.toString();
}

/**
 * Build the full link to copy. Any fragment already on `href` is replaced, so
 * copying twice does not stack two bids in one URL.
 */
export function bidLink(href, values = {}) {
  const base = String(href || '').split('#')[0];
  return `${base}#${encodeBid(values)}`;
}

/**
 * Read a fragment back. Returns null for anything that is not a bid link —
 * an ordinary anchor, an empty hash, or a fragment too long to trust — so the
 * caller can simply fall through to its normal defaults.
 */
export function decodeBid(hash) {
  const text = String(hash || '').replace(/^#/, '');
  if (!text || text.length > MAX_LENGTH) return null;
  let params;
  try {
    params = new URLSearchParams(text);
  } catch {
    return null;
  }
  if (params.get(BID_MARKER) !== '1') return null;

  const values = Object.create(null);
  let count = 0;
  for (const [key, value] of params) {
    if (key === BID_MARKER || UNSAFE_KEYS.has(key)) continue;
    if (count >= MAX_FIELDS) break;
    values[key] = value;
    count += 1;
  }
  return values;
}

/**
 * Write decoded values back onto the page.
 *
 * Only ids the page actually declares are touched, so a link from an older or
 * newer version of the calculator restores what still exists instead of
 * failing whole. Two details matter for correctness:
 *
 * - A `<select>` is left alone when the link names an option it does not
 *   have. Assigning an unknown value to a select silently blanks it, which
 *   would quietly reprice the job against no scope at all.
 * - A restored field is marked `dataset.edited` only when it actually differs
 *   from what the page already had. The calculators use that flag to decide
 *   whether a preset kit may overwrite a field, so marking every field would
 *   freeze the recipient out of switching presets on fields the sender never
 *   touched.
 *
 * Returns a small report rather than nothing, so the caller can tell the user
 * whether a link restored anything at all.
 */
export function applyBid(doc, values) {
  const report = { restored: 0, changed: 0, skipped: [] };
  if (!doc || !values) return report;

  for (const [id, raw] of Object.entries(values)) {
    const field = doc.getElementById(id);
    if (!field) {
      report.skipped.push(id);
      continue;
    }

    if (field.type === 'checkbox' || field.type === 'radio') {
      const next = raw === '1' || raw === 'true';
      const differs = field.checked !== next;
      field.checked = next;
      report.restored += 1;
      if (differs) {
        report.changed += 1;
        if (field.dataset) field.dataset.edited = '1';
      }
      continue;
    }

    if (isSelect(field) && !hasOption(field, raw)) {
      report.skipped.push(id);
      continue;
    }

    const differs = field.value !== raw;
    field.value = raw;
    report.restored += 1;
    if (differs) {
      report.changed += 1;
      if (field.dataset) field.dataset.edited = '1';
    }
  }

  return report;
}

function isSelect(field) {
  const tag = field.tagName;
  return typeof tag === 'string' && tag.toUpperCase() === 'SELECT';
}

function hasOption(field, value) {
  const options = field.options;
  if (!options || typeof options.length !== 'number') return true;
  for (let index = 0; index < options.length; index += 1) {
    if (options[index] && options[index].value === value) return true;
  }
  return false;
}

/**
 * Copy text using the async clipboard when the browser allows it, falling
 * back to a hidden textarea. Returns true when something was copied so the
 * caller can show a status line honestly instead of always claiming success.
 */
export async function copyText(doc, text) {
  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or an insecure origin: fall through to the textarea.
  }
  try {
    const fallback = doc.createElement('textarea');
    fallback.value = text;
    fallback.setAttribute('readonly', '');
    fallback.style.position = 'fixed';
    fallback.style.opacity = '0';
    doc.body.append(fallback);
    fallback.select();
    const copied = doc.execCommand('copy');
    fallback.remove();
    return copied !== false;
  } catch {
    return false;
  }
}
