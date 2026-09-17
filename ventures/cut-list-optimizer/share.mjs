// Shareable cutting-plan link.
//
// A cutting plan is rarely used by the person who typed it. The parts list is
// worked out at a desk or from a drawing, and the cuts are made by whoever is
// on the saw — a colleague, a second shop, a CNC operator, the customer's own
// joiner. This tool could already hand that person *text*: "Copy plan" and the
// CSV export both produce a list of cuts. What neither carries is the plan
// itself. The recipient cannot see the layout diagram, cannot check which
// offcut a part was nested into, and cannot try a different sheet size or kerf
// without retyping every part from the message they were sent.
//
// This link reopens the tool with both panels filled in and the plan
// recalculated, so the person cutting sees the same diagram as the person who
// planned it and can change a number if the rack turns out different.
//
// Same convention as the portfolio's other share links: the payload rides in
// the URL fragment, which browsers never send to a server or log in a Referer
// header, and only a fixed, validated shape is read back — a crafted fragment
// cannot inject an unexpected field into the form.
//
// On what a link carries, since the portfolio is careful about this: part
// dimensions, stock sizes, kerf, and a material cost per sheet or per length.
// That is shop-floor detail, not a cost structure — this tool holds no wage,
// no overhead, and no margin, which is why it can offer a link where
// `shop-rate-calculator` deliberately does not. The cost fields are the one
// judgement call, and they are what makes the shared plan's "cheapest sheet
// size" ranking mean anything, so they ride along.

import { DRAFT_FIELDS } from './draft.mjs';

/** Fields whose value is a checkbox state rather than text. */
export const BOOLEAN_FIELD_IDS = Object.freeze(['sheet-rotate']);

/** The panel the link should open on. Not a form field, so it is named apart. */
export const TAB_PARAM = 'tab';

/** The two panels, and the one a link falls back to. */
export const TABS = Object.freeze(['sheet', 'linear']);

/**
 * The fields a link may carry — the form's own list, imported rather than
 * copied. See the note on `DRAFT_FIELDS` in `draft.mjs`.
 */
export const SHARED_FIELD_IDS = DRAFT_FIELDS;

/**
 * Encode the form's values, and the panel in view, as a fragment payload.
 *
 * An empty field is omitted rather than sent as an empty string, so a link
 * built while one panel is untouched does not blank out the recipient's own
 * figures in that panel. A checkbox is always sent: `false` is a real choice
 * there ("do not rotate parts"), not an absence, and dropping it would let the
 * recipient's own default flip a plan the sender had settled.
 */
export function encodeInputs(values, tab) {
  const params = new URLSearchParams();
  for (const id of SHARED_FIELD_IDS) {
    const value = values?.[id];
    if (BOOLEAN_FIELD_IDS.includes(id)) {
      params.set(id, value ? '1' : '0');
      continue;
    }
    if (value === undefined || value === null) continue;
    const text = String(value);
    if (text === '') continue;
    params.set(id, text);
  }
  if (TABS.includes(tab)) params.set(TAB_PARAM, tab);
  return params.toString();
}

/**
 * Read a fragment (or query string) back into a values map plus a tab.
 *
 * Anything unrecognised is dropped rather than thrown, so a link truncated by a
 * chat app still opens the tool on the fields that survived instead of failing
 * outright. `parsePanels` and `parseCuts` still validate every dimension before
 * a plan is computed from it, so a nonsense value shows the tool's own error
 * rather than a wrong plan.
 */
export function decodeInputs(source) {
  const empty = { values: {}, tab: null };
  if (typeof source !== 'string') return empty;
  const params = new URLSearchParams(source.replace(/^[?#]/, ''));
  const values = {};
  for (const id of SHARED_FIELD_IDS) {
    if (!params.has(id)) continue;
    values[id] = BOOLEAN_FIELD_IDS.includes(id)
      ? params.get(id) === '1'
      : params.get(id);
  }
  const tab = params.get(TAB_PARAM);
  return { values, tab: TABS.includes(tab) ? tab : null };
}

/**
 * Build the full shareable URL for a page, a set of values, and a panel.
 *
 * Any existing fragment or query string on `href` is dropped: a link built from
 * a page that was itself opened from a link must carry the plan on screen now,
 * not the one it arrived with.
 */
export function shareUrl(href, values, tab) {
  const payload = encodeInputs(values, tab);
  const base = String(href ?? '').split('#')[0].split('?')[0];
  return payload ? `${base}#${payload}` : base;
}

/**
 * Roughly how many characters a link will occupy, for the page's own warning.
 *
 * A parts list is free text and a long one is normal — a kitchen is eighty
 * parts — so a link can outgrow what a browser or a chat app will carry. The
 * limit is not specified anywhere and varies by client; 2000 is the figure that
 * is safe essentially everywhere and is what the page warns against, offering
 * the CSV export instead rather than copying a link that silently truncates.
 */
export const SAFE_URL_LENGTH = 2000;

/** Whether a built URL is short enough to survive being pasted around. */
export function isSafeLength(url) {
  return String(url ?? '').length <= SAFE_URL_LENGTH;
}
