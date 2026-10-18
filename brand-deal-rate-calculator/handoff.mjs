// Carry the rates you just calculated into the media-kit builder.
//
// This page answers "what should I charge?" and stops at a table. The next
// thing a creator does with that answer is put it in front of a brand, and
// this portfolio already has the tool for that step:
// `influencer-media-kit-generator` builds a one-page media kit whose two most
// load-bearing sections are a platform-stats block and a rate card. Its own
// `validateMediaKit` warns on exactly the two things this page has just
// computed -- "No platforms listed" and "No rate card".
//
// Until now the only way through was to retype all of it: the platform, the
// follower count, the engagement rate, and four price ranges transcribed by
// hand. Most people do not, so the deeper tool goes unused and the
// calculation ends at a table nobody acts on. That is the same friction
// `ventures/where-to-sell-calculator/handoff.mjs` was built to remove between
// the channel comparison and the per-channel calculators, and this module
// follows its rules deliberately rather than inventing new ones:
//
//   - the values ride in the URL **fragment**, which browsers never send to
//     any server, so the handoff keeps this venture's promise that nothing
//     leaves the device;
//   - the link is **relative**, so the same href works under the project path
//     prefix GitHub Pages serves from, under a custom domain later, and from
//     a local `python3 -m http.server`;
//   - a handoff that would arrive with nothing useful is **not offered at
//     all**, because a link that silently lands on default numbers is worse
//     than no link.
//
// One thing differs from that module, and it is the reason this one formats
// text rather than mapping field names. The receiving calculators there take
// named numeric inputs, so the fragile part was the *name* mapping. The media
// kit takes two open-ended pipe-delimited text blocks instead, so the fragile
// part here is the *format*. `handoff.test.mjs` therefore imports the
// receiver's own `parsePlatforms` and `parseRates` and asserts that what this
// module emits parses back into the fields and values it was built from --
// so a change to either side's format fails a test instead of silently
// delivering a rate card with a price in the wrong column.

import { DELIVERABLES, PLATFORM_LABELS, PLATFORMS } from "./calculator.mjs";

/** The tool this page hands off to. */
export const HANDOFF = Object.freeze({
  slug: "influencer-media-kit-generator",
  label: "media kit generator",
  // The receiving form's own field ids. `prefill.mjs` on that side asserts
  // these against its `STRING_FIELDS` list, so a rename there cannot leave
  // this link quietly filling nothing.
  platformsField: "platformsRaw",
  ratesField: "ratesRaw",
});

/**
 * Rate-card wording for each deliverable.
 *
 * `DELIVERABLE_LABELS` in `calculator.mjs` is written to explain the
 * *distinction* to someone choosing between rows ("Feed post (single photo or
 * carousel)"); a rate card a brand reads wants the short name instead. Kept
 * as a separate table rather than derived by trimming the parenthetical,
 * because that would be a formatting rule pretending to be a translation.
 * `handoff.test.mjs` asserts every id in `DELIVERABLES` has an entry here, so
 * a deliverable added to the calculator cannot silently vanish from the kit.
 */
const RATE_CARD_DELIVERABLE = Object.freeze({
  post: "feed post",
  story: "Story",
  reel: "Reel / short-form video",
  video: "dedicated long-form video",
});

const isPlatform = (value) => PLATFORMS.includes(value);

/** Upper-cases the first character only, leaving "Reel / short-form video" alone. */
const sentenceCase = (text) => (text ? text[0].toUpperCase() + text.slice(1) : text);

/**
 * The service name for one rate-card row.
 *
 * The platform prefixes the deliverable, because a price is only meaningful
 * next to the audience it was priced for -- a brand reading "feed post | $380
 * - $620" cannot tell which account that buys. The one exception is the
 * "Other / multiple platforms" option, whose label is a description of the
 * chooser's situation rather than a platform name and reads as nonsense in
 * front of a deliverable.
 */
export function rateCardService(platform, deliverable) {
  const name = RATE_CARD_DELIVERABLE[deliverable];
  if (!name) return null;
  if (!isPlatform(platform) || platform === "general") return sentenceCase(name);
  return `${PLATFORM_LABELS[platform]} ${name}`;
}

/** `$380 - $620`, matching the range the reader is looking at on this page. */
export function formatRange(low, high) {
  // Sign outside the symbol, and no sign on a zero -- the portfolio-wide
  // convention `platform/ci/check_money_sign.py` enforces, and the same shape
  // this page's own `money()` uses. A rate cannot currently go negative, but a
  // formatter that would print "$-9" is the kind that outlives the guarantee
  // that its input never does.
  const money = (value) => {
    const format = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  return `${money(low)} – ${money(high)}`;
}

/**
 * The platform-stats line, in the receiver's `platform | followers |
 * engagement | url` format.
 *
 * The profile URL is deliberately left off: this page never asks for one, and
 * emitting an empty trailing segment would put a blank where the receiver's
 * own worked example shows a link. The creator adds it there, where the form
 * has a field for it.
 */
export function buildPlatformsBlock({ platform, followers, engagementRate }) {
  const flw = Number(followers);
  const rate = Number(engagementRate);
  if (!Number.isFinite(flw) || flw <= 0) return "";
  if (!Number.isFinite(rate) || rate <= 0) return "";
  const label = isPlatform(platform) ? PLATFORM_LABELS[platform] : PLATFORM_LABELS.general;
  // `toLocaleString` would insert a comma, and the receiver stores the
  // follower count as free text -- so a kit built from a handoff would read
  // "45,000" while one typed by hand reads "45000". Plain digits keep the two
  // identical and stay unambiguous in every locale.
  return `${label} | ${Math.round(flw)} | ${trimRate(rate)}%`;
}

/** `4.5` rather than `4.500000000000001`, and `4` rather than `4.0`. */
function trimRate(rate) {
  return String(Math.round(rate * 100) / 100);
}

/**
 * The rate-card block, one line per deliverable, in the receiver's
 * `service | price` format.
 *
 * The **range** travels, not a single number picked out of it. This page is
 * explicit that its output is "a starting point for a negotiation, never a
 * quote", and collapsing the range to a point estimate on the way to a
 * document a brand will read would be this tool making a claim it refuses to
 * make on its own page.
 */
export function buildRatesBlock({ platform, rates }) {
  if (!rates || typeof rates !== "object") return "";
  const lines = [];
  for (const deliverable of DELIVERABLES) {
    const row = rates[deliverable];
    if (!row) continue;
    const { low, high } = row;
    if (!Number.isFinite(low) || !Number.isFinite(high)) continue;
    // A deliverable priced at zero means the numbers above it were never
    // entered. Carrying "$0 - $0" into a rate card a brand reads is worse
    // than carrying nothing.
    if (high <= 0) continue;
    const service = rateCardService(platform, deliverable);
    if (!service) continue;
    lines.push(`${service} | ${formatRange(low, high)}`);
  }
  return lines.join("\n");
}

/**
 * What to hand over, keyed by the receiving form's own field ids, or `null`
 * when there is nothing worth handing over.
 *
 * @param {{platform: string, followers: number, engagementRate: number}} input
 * @param {{rates: Record<string, {low: number, high: number}>}} result
 */
export function buildHandoffFields(input = {}, result = {}) {
  const platformsRaw = buildPlatformsBlock(input);
  const ratesRaw = buildRatesBlock({ platform: input.platform, rates: result.rates });
  if (!platformsRaw && !ratesRaw) return null;
  const out = {};
  if (platformsRaw) out[HANDOFF.platformsField] = platformsRaw;
  if (ratesRaw) out[HANDOFF.ratesField] = ratesRaw;
  return out;
}

/**
 * A relative link to the media kit generator, carrying the rate card.
 *
 * Returns `null` when there is nothing to carry, so the caller renders no
 * link at all rather than one that arrives empty.
 */
export function handoffUrl(input = {}, result = {}) {
  const fields = buildHandoffFields(input, result);
  if (!fields) return null;
  const params = new URLSearchParams();
  for (const field of Object.keys(fields).sort()) params.set(field, fields[field]);
  return `../${HANDOFF.slug}/#${params.toString()}`;
}
