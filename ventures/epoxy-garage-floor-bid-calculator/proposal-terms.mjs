// Carry the proposal terms in a bid link, on a calculator that does not use the
// shared bid spec.
//
// Why this exists
// ---------------
// The proposal panel `adopt.mjs` generates asks for five things that are not
// part of any calculator's arithmetic: the deposit percentage, how long the
// price is held, the not-included list, the payment terms, and a notes block.
// They are the terms of the offer rather than the price of the work, which is
// why every share encoder on this site was built without them — and why, for a
// while, all 48 adopting tools dropped all five.
//
// The consequence is not a cosmetic one. Driven in Chromium on 2026-08-29
// against `artificial-turf-bid-calculator`, a bid priced at a 50% deposit held
// for 15 days reopened from its own link at the venture's defaults, and the
// customer proposal the recipient printed asked for $1,640.44 on acceptance
// where the sender's sheet said $2,734.07. The headline figure matched to the
// cent, so nothing on either page suggested a disagreement.
//
// 36 of those tools share a bid spec, and the fix there is part of it: a `text`
// kind beside `numbers`, `flags` and `choices`, and `withProposalTerms` folding
// the five ids in. The other 12 predate that spec and each keep a hand-written
// allowlist in their own `share.mjs` — three different encodings between them
// (a JSON payload, a query string derived from `calc.mjs`, and a third from a
// cost-id list). Rewriting all three to a shared spec would mean touching the
// input handling of twelve working calculators to fix a field none of them
// compute with.
//
// So the terms travel *beside* whatever the venture already writes, in one
// parameter the venture's own decoder never sees:
//
//   #<the venture's own payload>&pfterms=<the five terms, url-encoded>
//
// The value is URI-encoded as a whole, so a `&` or `=` inside a payment-terms
// clause cannot be mistaken for a parameter boundary, and a venture that
// serializes JSON gets its payload back byte-for-byte after `splitTerms`.
//
// One list, guarded rather than shared
// ------------------------------------
// The ids here are also declared in `adopt.mjs` (which builds the panel) and in
// the 36 vendored `share.mjs` copies (which carry them in the shared spec).
// Three declarations, because a venture directory is published on its own and
// an import across the tree would 404 on the live site — the same reason
// `proposal.mjs` is vendored rather than imported. `term-ids.test.mjs` is what
// makes them one list in practice: add a term to the panel without adding it
// here, and it fails.

/** Numeric terms: the deposit split and how long the price is held. */
export const PROPOSAL_TERM_NUMBERS = Object.freeze(['depositPercent', 'validDays']);

/** Prose terms, all three of them textareas on the panel. */
export const PROPOSAL_TERM_TEXT = Object.freeze([
  'proposalExclusions', 'paymentTerms', 'proposalNotes',
]);

/**
 * A ceiling on one block of prose, matching `MAX_LINK_VALUE` in
 * `platform/pages/link.mjs` and `MAX_TERM_TEXT` in the shared bid spec, so all
 * three share mechanisms on this site agree about what fits in a fragment.
 */
export const MAX_TERM_TEXT = 512;

/** The parameter the terms ride in. Prefixed, so a venture id cannot collide. */
export const TERMS_PARAM = 'pfterms';

/** What the setter calls these fields — the label on the panel, not the id. */
const TERM_LABELS = Object.freeze({
  proposalExclusions: 'not-included list',
  paymentTerms: 'payment terms',
  proposalNotes: 'notes',
});

/**
 * Only a finite, non-negative number, the same contract every calculator here
 * enforces on input. A deposit of `-5` or `NaN` never reaches the panel.
 */
function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

/**
 * Prose as typed, newlines included — an exclusions list is a list, and it
 * prints as one on the customer's sheet. Two things come out: the control
 * characters no textarea produces and no proposal should render, and the
 * surrounding whitespace, so a field holding a stray newline reads as empty
 * rather than as terms the sender wrote.
 *
 * Over-long is `null` — dropped, never truncated. Half a payment-terms clause
 * presented to the recipient as the sender's terms is worse than an empty
 * field, and `overlongTermsNote` is what tells the sender which one stayed
 * behind rather than letting the customer find out.
 */
function usableText(value) {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!clean) return null;
  return clean.length > MAX_TERM_TEXT ? null : clean;
}

/**
 * The five terms as a query string, or `''` when the setter has typed none of
 * them worth carrying. Pure: no DOM, no storage.
 */
export function encodeTerms(values) {
  const params = new URLSearchParams();
  for (const id of PROPOSAL_TERM_NUMBERS) {
    const value = usableNumber(values?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  for (const id of PROPOSAL_TERM_TEXT) {
    const value = usableText(values?.[id]);
    if (value !== null) params.set(id, value);
  }
  return params.toString();
}

/**
 * Back to values, re-validated exactly as on the way out.
 *
 * A fragment is the one part of these pages a stranger can write, so this
 * treats it as hostile: an id the panel does not offer, a deposit that is not a
 * number, a control character, or a megabyte of prose all drop out here rather
 * than reaching a document the contractor is about to print for a customer.
 */
export function decodeTerms(source) {
  if (typeof source !== 'string') return {};
  const params = new URLSearchParams(source.replace(/^[?#]/, ''));
  const values = {};
  for (const id of PROPOSAL_TERM_NUMBERS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) values[id] = String(value);
  }
  for (const id of PROPOSAL_TERM_TEXT) {
    if (!params.has(id)) continue;
    const value = usableText(params.get(id));
    if (value !== null) values[id] = value;
  }
  return values;
}

/**
 * Append the terms to a hash the venture's own encoder produced.
 *
 * Returns the payload unchanged when there is nothing to carry, so a page that
 * has not adopted the proposal panel — or a setter who left the terms at their
 * defaults with nothing typed — gets exactly the link it got before.
 */
export function withTerms(payload, values) {
  const encoded = encodeTerms(values);
  const base = typeof payload === 'string' ? payload : '';
  if (!encoded) return base;
  const segment = `${TERMS_PARAM}=${encodeURIComponent(encoded)}`;
  return base ? `${base}&${segment}` : segment;
}

/**
 * The venture's own payload and the terms, separated.
 *
 * The venture half comes back byte-for-byte: the ventures on this path
 * serialize JSON and hand it to `JSON.parse`, so a stray `&pfterms=...` left on
 * the end would not merely add a field — it would fail the parse and the whole
 * bid would refuse to open.
 */
export function splitTerms(hash) {
  const raw = typeof hash === 'string' ? hash.replace(/^[#?]/, '') : '';
  const marker = `${TERMS_PARAM}=`;
  let at = raw.indexOf(marker);
  // Only a whole key counts: `xpfterms=` belongs to some other parameter.
  while (at > 0 && raw[at - 1] !== '&') at = raw.indexOf(marker, at + 1);
  if (at < 0) return { payload: raw, terms: '' };
  const before = at > 0 && raw[at - 1] === '&' ? at - 1 : at;
  const after = raw.indexOf('&', at + marker.length);
  const encoded = after < 0 ? raw.slice(at + marker.length) : raw.slice(at + marker.length, after);
  let terms = '';
  try {
    terms = decodeURIComponent(encoded);
  } catch {
    // A hand-mangled fragment is not terms. The bid still opens.
  }
  const payload = raw.slice(0, before) + (after < 0 ? '' : raw.slice(after));
  return { payload: payload.replace(/^&/, ''), terms };
}

/**
 * The terms this page is showing, read off the panel.
 *
 * `lookup` is the page's own `el` — id to element, or null — kept as an
 * argument so this module needs no DOM to test. A page without the panel has no
 * such elements and yields `{}`, which encodes to `''` and changes no link.
 */
export function readTerms(lookup) {
  const values = {};
  if (typeof lookup !== 'function') return values;
  for (const id of [...PROPOSAL_TERM_NUMBERS, ...PROPOSAL_TERM_TEXT]) {
    let field = null;
    try {
      field = lookup(id);
    } catch {
      // `el` throws on some pages when the id is absent. Absent is the answer.
    }
    if (field && typeof field.value === 'string') values[id] = field.value;
  }
  return values;
}

/**
 * Write the terms onto the panel and let the page recompute.
 *
 * Both events, bubbling, exactly as a person typing would: the proposal region
 * listens on the document and redraws the deposit row from them. Returns how
 * many fields were written, so a caller can say so.
 */
export function applyTerms(values, lookup) {
  if (typeof lookup !== 'function') return 0;
  let written = 0;
  for (const [id, value] of Object.entries(values || {})) {
    let field = null;
    try {
      field = lookup(id);
    } catch {
      field = null;
    }
    if (!field) continue;
    field.value = String(value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    written += 1;
  }
  return written;
}

/** Which prose terms are too long to ride in a link. */
export function overlongTerms(values) {
  return PROPOSAL_TERM_TEXT.filter((id) => {
    const raw = values?.[id];
    return typeof raw === 'string' && raw.trim().length > MAX_TERM_TEXT;
  });
}

/**
 * The sentence a page shows when a term did not fit, or `''` when all of them
 * did. Assembled here rather than in each page: this wording ships on every
 * calculator with a proposal, and the alternative is the same sentence written
 * forty-eight times and corrected in one of them.
 */
export function overlongTermsNote(values) {
  const left = overlongTerms(values).map((id) => TERM_LABELS[id] ?? id);
  if (left.length === 0) return '';
  const named = left.length === 1
    ? left[0]
    : `${left.slice(0, -1).join(', ')} and ${left[left.length - 1]}`;
  return `your ${named} ${left.length === 1 ? 'is' : 'are'} too long to fit in a link `
    + `and stayed behind — send ${left.length === 1 ? 'it' : 'them'} separately if the wording matters`;
}
