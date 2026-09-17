// Carry the rates you just calculated into the media-kit builder.
//
// Same move as `ventures/brand-deal-rate-calculator/handoff.mjs`, for the
// other half of the same creator's business. `influencer-media-kit-generator`
// warns on "No platforms listed" and "No rate card"; this page has just
// computed both, for a newsletter rather than a social account.
//
// The two senders compose rather than compete, and that is the point of the
// receiver being append-only: an operator with an Instagram audience *and* a
// list follows both links and ends up with one kit carrying two reach rows and
// eight rate rows, instead of one overwriting the other.
//
// This is a sibling of that module, not a copy of it — the fields, the labels
// and the metric all differ, because a newsletter is priced per thousand opens
// rather than per thousand engaged followers. What must NOT drift between them
// is the wire contract: the same two target field names, the same fragment
// (never query) URL shape, the same relative link. `handoff.test.mjs` imports
// the other venture's module and asserts exactly that, so a change to either
// side fails a test rather than quietly producing two incompatible links.

import { NICHE_LABELS, NICHES, PLACEMENTS } from "./calculator.mjs";

/** The tool this page hands off to. Field names are the receiving form's own. */
export const HANDOFF = Object.freeze({
  slug: "influencer-media-kit-generator",
  label: "media kit generator",
  platformsField: "platformsRaw",
  ratesField: "ratesRaw",
});

/**
 * Rate-card wording for each placement.
 *
 * `PLACEMENT_LABELS` in `calculator.mjs` explains the *distinction* to someone
 * choosing between rows ("Primary in-issue placement (top ad slot)"); a rate
 * card a sponsor reads wants the short name. Kept as its own table rather than
 * derived by trimming the parenthetical, because that would be a formatting
 * rule pretending to be a translation. `handoff.test.mjs` asserts every id in
 * `PLACEMENTS` has an entry, so a placement added to the calculator cannot
 * silently vanish from the kit.
 */
const RATE_CARD_PLACEMENT = Object.freeze({
  dedicated: "Newsletter dedicated send",
  primary: "Newsletter primary placement",
  secondary: "Newsletter secondary placement",
  classified: "Newsletter classified / text link",
});

/** The service name for one rate-card row, or null for an unknown placement. */
export function rateCardService(placement) {
  return RATE_CARD_PLACEMENT[placement] ?? null;
}

/** `$380 - $620` — the sign outside the symbol, and no sign on a zero, per
 * `platform/ci/check_money_sign.py` and this page's own `money()`. */
export function formatRange(low, high) {
  const money = (value) => {
    const format = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  return `${money(low)} – ${money(high)}`;
}

/** `42.5` rather than `42.500000001`, and `42` rather than `42.0`. */
function trimRate(rate) {
  return String(Math.round(rate * 100) / 100);
}

/**
 * The reach line, in the receiver's `platform | followers | engagement | url`
 * format.
 *
 * The metric is named — `42% open`, not a bare `42%`. The receiver appends the
 * word "engagement" to a bare number, which is right for a social account and
 * wrong for a list: an open rate is not an engagement rate, and a sponsor
 * reading "42% engagement" on a newsletter row would reasonably take it for a
 * click rate. `engagementLabel` in `generator.mjs` leaves a value that names
 * its own metric alone, which is what makes this honest rather than clunky.
 *
 * The niche rides in the platform name, because it is what the rate was priced
 * against and a sponsor comparing two newsletters at the same size wants to
 * see it. No URL: this page never asks for one.
 */
export function buildPlatformsBlock({ subscribers, openRate, niche }) {
  const subs = Number(subscribers);
  const rate = Number(openRate);
  if (!Number.isFinite(subs) || subs <= 0) return "";
  if (!Number.isFinite(rate) || rate <= 0) return "";
  const key = NICHES.includes(niche) ? niche : "general";
  const name = key === "general" ? "Newsletter" : `Newsletter (${NICHE_LABELS[key]})`;
  // Plain digits, not `toLocaleString`: a kit built from a handoff and one
  // typed by hand should not differ by a comma.
  return `${name} | ${Math.round(subs)} | ${trimRate(rate)}% open`;
}

/**
 * The rate-card block, one line per placement, `service | price`.
 *
 * The range travels, not a point estimate — this page says its output starts a
 * negotiation and is never a quote, and collapsing it on the way into a
 * document a sponsor reads would make a claim the tool refuses to make.
 */
export function buildRatesBlock({ rates }) {
  if (!rates || typeof rates !== "object") return "";
  const lines = [];
  for (const placement of PLACEMENTS) {
    const row = rates[placement];
    if (!row) continue;
    const { low, high } = row;
    if (!Number.isFinite(low) || !Number.isFinite(high)) continue;
    // Zero means the numbers above were never entered. "$0 - $0" in a rate
    // card a sponsor reads is worse than no row.
    if (high <= 0) continue;
    const service = rateCardService(placement);
    if (!service) continue;
    lines.push(`${service} | ${formatRange(low, high)}`);
  }
  return lines.join("\n");
}

/** What to hand over, keyed by the receiving form's field ids, or null. */
export function buildHandoffFields(input = {}, result = {}) {
  const platformsRaw = buildPlatformsBlock(input);
  const ratesRaw = buildRatesBlock({ rates: result.rates });
  if (!platformsRaw && !ratesRaw) return null;
  const out = {};
  if (platformsRaw) out[HANDOFF.platformsField] = platformsRaw;
  if (ratesRaw) out[HANDOFF.ratesField] = ratesRaw;
  return out;
}

/**
 * A relative link to the media kit generator, carrying the rate card, or null
 * when there is nothing to carry.
 *
 * Relative so it works under the GitHub Pages project path, under a custom
 * domain later, and from a local static server. The values ride in the
 * fragment, which browsers do not send to any server.
 */
export function handoffUrl(input = {}, result = {}) {
  const fields = buildHandoffFields(input, result);
  if (!fields) return null;
  const params = new URLSearchParams();
  for (const field of Object.keys(fields).sort()) params.set(field, fields[field]);
  return `../${HANDOFF.slug}/#${params.toString()}`;
}
