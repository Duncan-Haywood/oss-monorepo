// Keeps a finished bid, so the tool still has it when the customer calls back.
//
// Why this exists
// ---------------
// Every calculator on this site is a pure function of the numbers in its form,
// and it forgets all of them the moment the tab closes. That is fine for the
// fee calculators, where the input is one sale someone is looking at right now.
// It is the wrong shape for the hundred trade bid calculators, because a
// contractor's bid does not end when the arithmetic does:
//
//   Tuesday   measure the roof, price it here, hand over the proposal
//   Friday    "we talked it over — what was that number again, and what if we
//              skip the tear-off?"
//
// On Friday the tool is a blank form. The contractor re-enters twenty fields
// from a photo of a notepad, or worse, re-derives them and quotes a number that
// does not match the sheet the customer is holding. `platform/proposal` made
// the Tuesday half a real document; the Friday half was still nothing.
//
// The Friday question has two clauses and this file long answered only the
// first. Restoring settles "what was that number again"; then the contractor
// deletes the tear-off line, the page reprices, and Tuesday's figure is gone
// from the screen — leaving them to subtract, in their head, against a number
// they are half-remembering, in order to say the one sentence the call is
// about. `revisionSentence` is the second clause: while a restored bid is on
// the form, the band holds the figure it was quoted at and says what the change
// is worth, in money and in percent.
//
// What existed already is not this. `share.mjs` encodes the current form into a
// URL fragment, which is a fine way to send a bid to someone else, but it only
// helps a contractor who thought to copy that link somewhere before closing the
// tab — and nothing on the page ever suggested they should. `rates.mjs` carries
// the four numbers that describe the *business* across tools; this carries the
// many numbers that describe one *job*, and deliberately never crosses tools.
//
// Injected at build time for the same two reasons the chrome and the shop-rates
// bar are (see `injectChrome`, `injectShopRates`): a calculator lands on `main`
// most days and the injection covers each new one for free, and venture pages
// are edited concurrently, so the same edit committed into a hundred product
// files would conflict with nearly every open branch.
//
// The correctness rule that shapes the whole thing
// ------------------------------------------------
// A restore is **atomic or refused**. It is not enough to write back the fields
// that happen to still be on the page: the itemised calculators (flooring by
// room, tree service by tree, roofing by section) build their inputs at
// runtime, so a bid saved with four rooms meets a form with one. Writing the
// one field that matched would leave a form that computes a real, plausible,
// *smaller* job than the one saved — the same class of defect as the bid link
// that silently dropped `quantity`, where the recipient priced something the
// sender never saw.
//
// So a restore compares the saved field set against the form's current field
// set and requires them to be equal, in both directions, before writing
// anything. Fewer fields than saved means part of the job would be missing;
// more fields than saved means the form carries rows the bid never priced,
// which would be added to it at whatever they currently hold. Either way the
// honest outcome is to leave the form untouched and say what the visitor has to
// change — never a half-restored bid that looks finished.

/** The one `localStorage` key. Device-local, like every other signal here. */

import { readFileSync } from 'node:fs';
export const SAVED_BIDS_KEY = 'portfolio-saved-bids';

const JOBS_MARKER = 'pf-jobs';

// The two things the shared script cannot know until it is on a page: which
// venture it is running inside, and which element holds that tool's headline
// figure. Carried on the tag rather than baked into the source, which is what
// lets one file serve all 234 pages.
const JOBS_SLUG_ATTR = 'data-pf-jobs-slug';
const JOBS_AMOUNT_ATTR = 'data-pf-jobs-amount';

/**
 * Per tool, not per site. Twenty-five bids is more than a one-truck contractor
 * quotes in a month, and the cap exists so a browser that never clears its
 * storage cannot grow this key without bound. The oldest is dropped on save.
 */
export const MAX_SAVED_BIDS = 25;

/**
 * Below this, the page is not a form worth remembering.
 *
 * The deep SEO pages ("how to price a roof by the square") carry no input at
 * all and are excluded by any threshold; three is the line under which a
 * control promising to remember "this bid" would be overstating what there is
 * to remember.
 */
export const MIN_SAVEABLE_FIELDS = 3;

/**
 * Ids never treated as part of a bid.
 *
 * `usageOptOut` is the visitor's privacy choice, which is a fact about the
 * browser rather than about the job: restoring a bid must not quietly switch
 * counting back on because it was on when the bid was saved. Anything the site
 * chrome itself injects is prefixed `pf-` and is likewise not the venture's
 * form — including this feature's own name box, which would otherwise save
 * itself.
 *
 * `usage` is the same checkbox under the other spelling this repo uses, and the
 * exclusion missed it: 15 published pages name it that way and 10 of them carry
 * this band, so on those a restore has been writing the visitor's counting
 * preference out of a saved document. The direction that matters is the one
 * where it turns counting *on* for someone who left it off. One id was never
 * going to hold — the rule is about what the control means, not what it is
 * called — so both spellings are named here and `pageSaveableFieldIds` is
 * tested against both.
 *
 * The seven `client*`/`company*` ids are a different kind of exclusion: not a
 * setting that must not travel, but a customer's own name and home address.
 * 104 ventures share one "proposal header" convention — `clientName`,
 * `clientAddress`, `companyName`, `companyAddress`, `companyPhone`,
 * `companyEmail`, `companyLicense` — and this module's two features are the
 * only two things on the site that turn a form's fields into a URL: the
 * saved-bids band writes them to this browser's own disk, which is one
 * thing, but `link.mjs` builds `pageSaveableFieldIds` straight into a
 * shareable hash a contractor is expected to paste into email or text to a
 * customer. Neither of these seven ids started with `pf-` or matched the
 * older exclusions, so a page with no `share.mjs` of its own sent the
 * customer's home address out in the "Copy link to this bid" URL — exactly
 * the kind of link that ends up forwarded, or sitting in a browser's history,
 * somewhere neither party expected. The 71 ventures with their own
 * hand-written `share.mjs` were never affected; this is the shared
 * serializer's own allowlist.
 *
 * Excluding them here does not touch the "14 Oak St — Mrs Reid" label a
 * saved bid is listed under: that name is typed by the contractor into its
 * own box (`pf-jobs-name`, see `JOBS_MARKUP` below) and is never read off
 * these fields. It also does not stop a contractor's *own* company details
 * from restoring on their own device — `usage`/`usageOptOut` are excluded
 * from serialization for the same reason and restoring already worked before
 * this ever changed the set the two features agree on.
 */
export const EXCLUDED_FIELD_IDS = new Set([
  'usageOptOut',
  'usage',
  // The proposal header's customer and business-identity fields — see above.
  'clientName',
  'clientAddress',
  'companyName',
  'companyAddress',
  'companyPhone',
  'companyEmail',
  'companyLicense',
]);

const EXCLUDED_ID_PREFIX = 'pf-';

/**
 * Pages whose form is the *business*, not a job.
 *
 * Both features this module gates assume the form on screen is one customer's
 * priced work: the band saves it under a job name and lists it on the hub beside
 * "14 Oak St — Mrs Reid", and `link.mjs` hangs "Copy link to this bid" on that
 * band so the whole form can be handed to somebody else.
 *
 * `shop-rate-calculator` breaks that assumption completely. Its form is a crew
 * wage, a workers' compensation rate, benefits, the owner's salary and the
 * office overhead — the shop's cost structure, which is the one thing on this
 * site that must never acquire a button inviting the contractor to send it to
 * the customer. Nothing there is a bid, so there is nothing to name, nothing the
 * hub's saved-bid index should list, and no link that should exist. The tool
 * carries its four *outputs* into the other calculators through
 * `portfolio-shop-rates` instead, which is a device-local key rather than a URL.
 *
 * Excluding it here is enough for both: `injectBidLink` anchors on the band this
 * one draws, so no band means no link.
 */
export const COST_STRUCTURE_SLUGS = new Set(['shop-rate-calculator']);

/**
 * Input types with no value a bid could restore. `hidden` is deliberately not
 * here: a few ventures keep a computed unit or a preset key in one, and that is
 * part of what the form was.
 */
const UNSAVEABLE_TYPES = new Set(['button', 'submit', 'reset', 'file', 'image']);

const isExcludedId = (id) =>
  !id || id.startsWith(EXCLUDED_ID_PREFIX) || EXCLUDED_FIELD_IDS.has(id);

const ATTRIBUTE_RE = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function tagAttributes(tag) {
  const attrs = {};
  let match;
  ATTRIBUTE_RE.lastIndex = 0;
  while ((match = ATTRIBUTE_RE.exec(tag)) !== null) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attrs;
}

/**
 * The static field ids on this page.
 *
 * Static is the operative word: this reads the markup as shipped, so the rows
 * an itemised calculator builds at runtime are not counted. That is correct for
 * what this function decides — whether the page has a form at all — and it is
 * why the runtime half re-collects the fields from the live document instead of
 * being handed this list. A page whose only inputs are template placeholders
 * (`id="${id}-foot"`) is a page whose real form is built in script, and those
 * are skipped here rather than counted as a field nobody can address.
 */
export function pageSaveableFieldIds(html) {
  if (typeof html !== 'string') return [];
  const ids = [];
  const seen = new Set();
  const tags = html.match(/<(?:input|select|textarea)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi) ?? [];
  for (const tag of tags) {
    const attrs = tagAttributes(tag);
    const id = attrs.id;
    if (!id || id.includes('${') || isExcludedId(id)) continue;
    if (/^<input/i.test(tag) && UNSAVEABLE_TYPES.has((attrs.type || 'text').toLowerCase())) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Is this a tool whose user keeps bids?
 *
 * The band, its panel and the share row speak of bids, customers, won and lost
 * jobs, and the build gave them to every page with three fields: 1,110 of 1,331
 * tools, including a 401(k) loan comparison and an ATS resume checker, where a
 * "Saved bids" button reads as a mistake to a first-time visitor. The gate is
 * the tools the customer proposal covers (`platform/proposal/trades.json`) plus
 * any slug that says bid, quote, estimate, proposal or takeoff. A guess in
 * either direction costs little: a missed tool simply has no band, and a tool
 * added to trades.json gets one.
 */
const BID_SLUG = /(?:^|-)(?:bids?|quotes?|estimates?|estimator|proposals?|takeoff)(?:-|$)/;
const PROPOSAL_SLUGS = (() => {
  try {
    const url = new URL('../proposal/trades.json', import.meta.url);
    return new Set(Object.keys(JSON.parse(readFileSync(url, 'utf8'))));
  } catch {
    return new Set();
  }
})();
export function slugTakesSavedBids(slug) {
  return PROPOSAL_SLUGS.has(slug) || BID_SLUG.test(slug);
}

/** Does this page carry a form worth remembering? */
export function pageTakesSavedBids(html) {
  return pageSaveableFieldIds(html).length >= MIN_SAVEABLE_FIELDS;
}

/**
 * Tools whose headline figure is not the one they are actually selling on.
 *
 * `lawn-care` leads with a per-visit price while the thing being sold — and the
 * thing its own proposal asks for — is the monthly contract. Saving $106.09
 * against a job the customer was quoted $459.73 for would be worse than saving
 * nothing.
 *
 * The same exception, for the same reason, as `screenPriceSelector` in
 * `platform/proposal/trades.json`; a test below asserts the two agree, so a
 * later correction to one cannot leave a saved bid showing a different number
 * than the printed proposal does.
 */
export const HEADLINE_AMOUNT_OVERRIDES = {
  'lawn-care-bid-calculator': '#monthly',
  // This page leads with the quote, but marks it `class="hero"` rather than
  // this site's `hero-number`, so the rule below finds nothing and the tool
  // saved no figure at all. `#target` is the price it quotes and the price its
  // printed proposal carries — `trades.json` names the same element, and
  // `jobs.test.mjs` holds the two to each other.
  'appliance-repair-quote-calculator': '#target',
  // Same shape as appliance-repair above: `class="hero"`, not `hero-number`.
  // `#targetPrice` is the margin-protected price this tool quotes and the
  // figure its printed proposal carries; `trades.json`'s own
  // `screenPriceSelector` names the same element.
  'change-order-margin-calculator': '#targetPrice',
};

const HERO_NUMBER_TAG_RE = /<[^>]*\bclass="[^"]*\bhero-number\b[^"]*"[^>]*>/i;

/**
 * Which element on this page holds the figure the tool leads with.
 *
 * **Not, in general, "the price".** On the ~100 trade calculators the hero is
 * the quote and a contractor reads it as one; on the ~48 seller-fee pages it is
 * profit per unit, and on a few others it is a net or a best-case. That is why
 * nothing in this feature calls the stored value a price: it is the number this
 * tool put on screen, and the row it is drawn on always names the tool, so it is
 * never shown without the context that says what it means.
 *
 * One rule, deliberately: the first element carrying `hero-number`, which is
 * this site's own convention for the figure a calculator leads with — the
 * answer it exists to give. 160 of the 234 pages with a form have one.
 *
 * The obvious extension was to fall back to a list of likely ids (`#total`,
 * `#monthly`, `#bidPrice`) where no hero exists. Measured against the built
 * site that adds four pages and a class of defect worth more than four pages:
 * `#total` on `retainage-cashflow-calculator` is a cash position rather than a
 * quote, and on `grant-deadline-tracker` it is a count of deadlines. A saved bid
 * showing a number the tool never led with is worse than one showing no number,
 * because the wrong one is the one that gets read back to a customer. So a page
 * without a hero saves no figure, and the row simply does not carry one.
 *
 * Returns `''` when there is nothing safe to read.
 */
export function pageHeadlineAmountSelector(html, slug = '') {
  const override = HEADLINE_AMOUNT_OVERRIDES[slug];
  if (override) return override;
  if (typeof html !== 'string') return '';
  const tag = HERO_NUMBER_TAG_RE.exec(html);
  if (!tag) return '';
  const id = tagAttributes(tag[0]).id;
  // A hero with no id cannot be addressed, and giving one a generated id here
  // would mean this build writing into a venture's markup to read it back.
  if (!id || id.includes('${') || !/^[A-Za-z][\w-]*$/.test(id)) return '';
  return '#' + id;
}

/**
 * The headline figure, exactly as the tool displayed it, or `''`.
 *
 * Kept as the string on screen rather than parsed to a number. A contractor has
 * to be able to read this back to a customer holding the proposal, and the two
 * must not disagree about rounding, currency, or a unit the tool appends
 * ("$589.38 · 13.2 h"). Nothing in this feature does arithmetic on it, and
 * nothing should: a sum across tools would be adding a roof to a lawn contract,
 * or a quote to a profit margin.
 *
 * Four things are refused, and every one of them was found on the built site
 * rather than imagined:
 *
 *   - no currency symbol, which is how a hero holding a count reads
 *     (`grant-deadline-tracker` renders `0`);
 *   - no non-zero digit, which is an unfilled form rather than a free job;
 *   - prose, caught by the length cap — one `hero-number` on the TikTok fee
 *     pages carries a sentence of advice, not a figure;
 *   - anything that is not a string.
 *
 * A page whose hero is still empty when the bid is saved simply stores nothing,
 * which is the same honest outcome as a page with no hero at all.
 */
export function normalizeHeadlineAmount(value) {
  if (typeof value !== 'string') return '';
  var text = value.replace(/\s+/g, ' ').trim();
  if (text.length === 0 || text.length > 32) return '';
  if (!/[$£€]/.test(text)) return '';
  if (!/[1-9]/.test(text)) return '';
  return text;
}

/**
 * A saved bid's name, as the visitor typed it.
 *
 * Trimmed, collapsed, and capped — it is rendered into a list on the page, and
 * an eighty-character customer address pasted into the box should not push the
 * Restore button off a phone screen. Empty means "use the default", which the
 * caller supplies, rather than an unnamed row nobody can tell apart.
 */
export function normalizeBidName(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, 60);
}

/**
 * What happened to the bid, once the customer answered.
 *
 * Three states, and the third is the absence of the other two: a bid with no
 * outcome is *waiting*, which is the state every bid starts in and the only one
 * worth a nudge. Storing "waiting" explicitly would be storing the default on
 * every record for no gain, so an undecided bid carries no `outcome` key at all
 * — which is also what makes every bid saved before this shipped read correctly
 * as waiting rather than as corrupt.
 *
 * Why the tool tracks this at all: a one-truck contractor's largest lost
 * revenue is not the bid they priced wrong, it is the bid nobody ever chased.
 * The proposal made Tuesday a document and saved bids made Friday a lookup;
 * neither of them ever said "this quote is nineteen days old and you have not
 * heard back". Won and lost are the other half — over a season they are the
 * only evidence in the tool of whether the shop rate is pitched right, and they
 * cost the contractor two clicks to record.
 */
export const BID_OUTCOMES = ['won', 'lost'];

/** `'won'`, `'lost'`, or `null` for waiting — never anything else. */
export function normalizeOutcome(value) {
  return BID_OUTCOMES.indexOf(value) === -1 ? null : value;
}

/**
 * The largest figure this will accept as the price a lost job went for.
 *
 * A guard against a mistyped field, not a judgement about job size: a billion
 * of any currency is past every trade this site serves, and a stray keypress
 * that turns 2400 into 24000000 would otherwise drag an average into nonsense
 * and leave the contractor reading a number they cannot account for.
 */
export const MAX_LOST_TO = 1e9;

/**
 * The price a lost job actually went for, as the contractor heard it.
 *
 * `priceBandSentence` can already say "every one you lost was over $2,600",
 * which is the ceiling of what this tool could work out alone — it knows the
 * quotes that were refused and nothing about the quote that was accepted. So
 * the contractor learns they are losing above a figure, and still has to guess
 * whether the winner was $200 under them or $1,200 under. Those two call for
 * opposite responses, and guessing wrong is expensive in both directions.
 *
 * The number is often just *told* to them — "we went with someone at nineteen"
 * is a normal sentence on a residential job — and until now there was nowhere
 * to put it. One optional box on a lost row is where it goes.
 *
 * Kept as a bare decimal string, not a display string like `amount`. The
 * currency is the one already on that bid's own figure, because the two are
 * only ever compared with each other; storing a second symbol would invite a
 * mismatch this feature has no rate to resolve.
 *
 * Refused rather than coerced: anything that is not a plain positive amount
 * ends as `''` and is not stored. Spaces, thousands separators and a leading
 * currency symbol are stripped first, because all three are what a person
 * types when they are copying a figure off a text message.
 */
export function normalizeLostTo(value) {
  var text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== 'string') return '';
  text = text.replace(/[\s ,]/g, '').replace(/^[$£€]/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return '';
  var amount = Number(text);
  if (!(amount > 0) || amount > MAX_LOST_TO) return '';
  // `String(Number(...))` is the canonical form: it drops a leading zero and a
  // trailing `.00`, so "01900" and "1900.00" are one stored value rather than
  // three that compare unequal when a backup merges two devices.
  return String(amount);
}

/**
 * What a won job actually cost this contractor to deliver.
 *
 * Every reading in this panel is about *winning*. `followUpSentence` and
 * `chaseSentence` say which quotes are still out, `priceBandSentence` says
 * where the price tips, `undercutSentence` says how far under the winner was,
 * and `winRateSentence` says how often the yes comes. A contractor who acts on
 * all five gets better at winning work, and not one of them can tell them
 * whether the work they win is worth having. That is the other half of pricing
 * and it is the half that decides whether a higher win rate is good news: a
 * shop winning 80% at a price that loses money on every job is in deeper
 * trouble than one winning 30%.
 *
 * The missing ingredient was never a calculation, it was a fact only the
 * contractor has — what the job came to once it was done. Materials, labour and
 * subs, as they know it from their own job costing. One optional box on a won
 * row is where it goes, the mirror of "Went for" on a lost one.
 *
 * Deliberately an alias rather than a copy of `normalizeLostTo`. The two are
 * the same input — a plain positive amount a person has typed off an invoice or
 * a text message — with the same guard against a mistyped extra zero, and the
 * page ships both to the browser: a second body would be bytes in the offline
 * bundle for a rule that has to stay identical anyway. What differs is which
 * outcome may carry the figure, and that is `normalizeBid`'s business, not this
 * function's.
 */
export function normalizeJobCost(value) {
  return normalizeLostTo(value);
}

/**
 * Keep only what a bid can hold.
 *
 * Storage is the visitor's own disk and can contain anything — a half-written
 * value from a crashed tab, a payload from a future version of this file. Every
 * one of those has to end as "no saved bids" rather than as an exception thrown
 * into the page, because the failure mode of a throw here is a calculator that
 * stops calculating.
 */
export function normalizeBid(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const name = normalizeBidName(entry.name);
  if (!name) return null;
  const at = typeof entry.at === 'string' && entry.at ? entry.at : null;
  if (!at) return null;
  const source = entry.fields;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;

  const fields = {};
  let kept = 0;
  for (const [id, value] of Object.entries(source)) {
    if (isExcludedId(id)) continue;
    // Strings are form values; booleans are the checked state of a checkbox or
    // radio. Nothing else round-trips through a form field, and accepting a
    // number or an object here would mean writing `[object Object]` into an
    // input on restore.
    if (typeof value !== 'string' && typeof value !== 'boolean') continue;
    if (typeof value === 'string' && value.length > 2000) continue;
    fields[id] = value;
    kept++;
  }
  if (kept === 0) return null;

  const bid = { name, at, fields };
  // Same "only when there is something to say" rule as the outcome below: a bid
  // saved on a page with no headline figure carries no `amount` key rather than
  // an empty one, so nothing migrates and no bytes are spent on a blank.
  const amount = normalizeHeadlineAmount(entry.amount);
  if (amount) bid.amount = amount;
  // Added only when decided, never as `outcome: null`. Two reasons, and the
  // second is the load-bearing one: a bid saved before outcomes existed is
  // indistinguishable from one saved after and left waiting, so nothing has to
  // migrate; and `serializeBids` writes this object straight to the visitor's
  // disk, where a null on every record is bytes bought for nothing.
  const outcome = normalizeOutcome(entry.outcome);
  if (outcome) {
    bid.outcome = outcome;
    // When it was decided, not when it was priced. `at` cannot serve: marking a
    // bid won does not re-price it, so `at` stays put — which is exactly why
    // `mergeBids` needs a second instant to tell two devices apart.
    if (typeof entry.decidedAt === 'string' && entry.decidedAt) bid.decidedAt = entry.decidedAt;
    // Only on a lost bid, and dropped without comment on any other. A won job
    // has no winning price but its own, and a bid flipped back to waiting has
    // not been decided at all — carrying the figure through either state would
    // leave a stale number that reappears if the outcome is set to lost again
    // for a different reason.
    if (outcome === 'lost') {
      const lostTo = normalizeLostTo(entry.lostTo);
      if (lostTo) bid.lostTo = lostTo;
    }
    // The same rule as `lostTo` above, pointed the other way: what a job cost
    // to deliver is a fact about a job that was done, so it is kept only on a
    // win. A bid flipped back to waiting, or corrected to lost, has no
    // delivered job behind it, and carrying the figure through would leave a
    // cost that `marginSentence` would count the moment the outcome was set
    // back to won for a different job at the same address.
    if (outcome === 'won') {
      const cost = normalizeJobCost(entry.cost);
      if (cost) bid.cost = cost;
    }
  }
  return bid;
}

/**
 * Parse the whole store: a map of slug to that tool's bids, newest first.
 *
 * Unknown slugs are kept as they are found. A visitor who saved bids on a tool
 * that has since been renamed still has them on disk, and silently dropping
 * every slug this page does not recognise would delete them the next time any
 * other tool wrote the key.
 */
export function parseStoredBids(raw) {
  if (typeof raw !== 'string' || raw === '') return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object') return {};
  const source = parsed.bids && typeof parsed.bids === 'object' ? parsed.bids : null;
  if (!source) return {};

  const out = {};
  for (const [slug, list] of Object.entries(source)) {
    if (!Array.isArray(list)) continue;
    const bids = list.map(normalizeBid).filter(Boolean).slice(0, MAX_SAVED_BIDS);
    if (bids.length > 0) out[slug] = bids;
  }
  return out;
}

/**
 * Every saved bid across every tool, newest first.
 *
 * Bids are stored per tool and restored per tool, and that stays true — a bid
 * never crosses tools, for the reason the module header gives. What crosses is
 * the *question* "where did I put it". A contractor saves "14 Oak St — Mrs
 * Reid" in the gutter calculator on Tuesday; on Friday the customer rings back
 * and the only route to that bid is remembering which of 162 tools priced it,
 * opening it, and opening the band. The store is a single key on one origin, so
 * the hub already holds the answer and simply never showed it.
 *
 * Returns `{ slug, name, at }` and deliberately not `fields`: the hub lists
 * bids, it does not restore them, and handing it the numbers would put a
 * customer's job on a page that has no form to put it in.
 *
 * Ties on `at` fall back to slug then name so the order is total — two bids
 * saved in the same second must not swap places between renders.
 */
export function savedBidIndex(raw, { limit = Infinity } = {}) {
  const store = typeof raw === 'string' ? parseStoredBids(raw) : (raw ?? {});
  const rows = [];
  for (const [slug, list] of Object.entries(store)) {
    if (!Array.isArray(list)) continue;
    for (const bid of list) {
      if (!bid || typeof bid !== 'object') continue;
      const { name, at } = bid;
      if (typeof name !== 'string' || !name || typeof at !== 'string' || !at) continue;
      const row = { slug, name, at };
      // The headline figure travels with the row even though the numbers behind
      // it do not: it is the one thing about a bid the hub can show without
      // putting a customer's job on a page that has no form to hold it. Without
      // it the index answers "where did I put it" and not "what did it come to".
      const amount = normalizeHeadlineAmount(bid.amount);
      if (amount) row.amount = amount;
      // Same rule as the record itself: present only when decided, so a caller
      // that predates outcomes sees exactly the rows it always saw.
      const outcome = normalizeOutcome(bid.outcome);
      if (outcome) row.outcome = outcome;
      rows.push(row);
    }
  }
  rows.sort(
    (a, b) =>
      b.at.localeCompare(a.at) || a.slug.localeCompare(b.slug) || a.name.localeCompare(b.name),
  );
  return Number.isFinite(limit) ? rows.slice(0, Math.max(0, limit)) : rows;
}

/** The stored form. Versioned so a later shape can be told apart from this one. */
export function serializeBids(bids) {
  const out = {};
  for (const [slug, list] of Object.entries(bids ?? {})) {
    if (!Array.isArray(list)) continue;
    const kept = list.map(normalizeBid).filter(Boolean).slice(0, MAX_SAVED_BIDS);
    if (kept.length > 0) out[slug] = kept;
  }
  return JSON.stringify({ v: 1, bids: out });
}

/**
 * Can this saved bid be written back to this form, exactly?
 *
 * Returns the two differences rather than a boolean, because the message the
 * visitor needs is which way the form differs — "the bid has three rooms the
 * form does not" and "the form has two rows the bid never priced" call for
 * opposite actions. Both empty means the restore is safe.
 *
 * Exported and pure so the rule is tested here rather than only through a
 * browser.
 */
export function restoreMismatch(savedIds, formIds) {
  const form = new Set(formIds);
  const saved = new Set(savedIds);
  return {
    missing: [...saved].filter((id) => !form.has(id)),
    extra: [...form].filter((id) => !saved.has(id)),
  };
}

// ---------------------------------------------------------------------------
// Itemised rows: the eight calculators that build their form in script
// ---------------------------------------------------------------------------
//
// `restoreMismatch` above is exactly right for a form whose fields are all in
// the markup, and exactly wrong for the ones that are not. Eight tools here —
// tree service by tree, carpet cleaning by room, window cleaning by glass type,
// snow removal by stop, pest control by service, hood cleaning by component,
// gutter cleaning by run, portable restrooms by unit type — create their rows
// when the contractor clicks "+ Add a tree", with ids like `t3-dbh` off a
// counter that starts at zero on every page load.
//
// That left both of this file's features half-working on precisely the jobs
// that most need them:
//
//   * **A saved bid never restored.** Save a six-room carpet job, come back
//     tomorrow, and the form has one room. Every `r2-`…`r6-` id is "missing",
//     so the atomic-or-refused rule correctly refuses — and tells the visitor
//     to "add or remove rows until the form matches", which is asking them to
//     rebuild by hand the thing they saved to avoid rebuilding by hand.
//   * **No share link at all.** `link.mjs` excluded these pages outright,
//     reasoning that a link whose field set can never match is worse than no
//     button. It was right, given the matching rule it had.
//
// Both fall out of matching by *raw id*. A row's id is an artefact of the order
// somebody clicked, not a fact about the job: two contractors who each price
// the same three rooms can hold `r1,r2,r3` and `r1,r3,r7`, and nothing about
// those bids differs. So the fix is to stop comparing the counter.
//
// A page opts in by putting `data-pf-repeat="<prefix>"` on the control that
// appends a row, naming the prefix its generated ids carry. The runtime then
// (a) clicks that control until the group has as many rows as the bid, and
// (b) compares by position within the group rather than by id. A page that
// declares nothing keeps the old exact-id rule untouched, which is what keeps
// this off the other 161 tools.
//
// Two properties are deliberately kept from the old rule. It is still atomic
// or refused — growing the form is allowed, guessing at a mismatch is not. And
// it still cannot shrink: no page here declares a remove control, so a form
// holding more rows than the bid is refused exactly as before, with a message
// that now says reloading is the cheap fix.

/** How a page names the control that appends a row. */
export const REPEAT_ATTR = 'data-pf-repeat';

/** Ceiling on rows one restore may create, so a crafted bid cannot spin. */
export const MAX_REPEAT_ROWS = 60;

/**
 * The row-group prefixes this page declares, in document order.
 *
 * Read from the markup rather than from a build-time list, for the same reason
 * the runtime re-collects fields from the live document: the declaration lives
 * next to the button it describes, so a venture that renames its groups cannot
 * leave a stale copy here.
 */
export function pageRepeatPrefixes(html) {
  if (typeof html !== 'string') return [];
  const out = [];
  const re = new RegExp(`${REPEAT_ATTR}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'gi');
  let match;
  while ((match = re.exec(html)) !== null) {
    const prefix = (match[1] ?? match[2] ?? '').trim();
    if (prefix !== '' && !out.includes(prefix)) out.push(prefix);
  }
  return out;
}

/**
 * `t12-dbh` against prefix `t` → `{ prefix: 't', index: 12, field: 'dbh' }`.
 *
 * Null for anything else, which is most ids on these pages: the crew rate and
 * the travel minutes live in the markup and must go on matching exactly.
 *
 * Longest prefix wins, so a page declaring both `r` and `rt` reads `rt4-x` as
 * the `rt` group rather than an `r` group with a malformed index.
 */
export function splitRepeatId(id, prefixes) {
  if (typeof id !== 'string' || !Array.isArray(prefixes)) return null;
  let best = null;
  for (const prefix of prefixes) {
    if (typeof prefix !== 'string' || prefix === '') continue;
    if (!id.startsWith(prefix)) continue;
    const rest = id.slice(prefix.length);
    const dash = rest.indexOf('-');
    if (dash <= 0) continue;
    const digits = rest.slice(0, dash);
    if (!/^\d+$/.test(digits)) continue;
    const field = rest.slice(dash + 1);
    if (field === '') continue;
    if (best === null || prefix.length > best.prefix.length) {
      best = { prefix, index: Number(digits), field };
    }
  }
  return best;
}

/**
 * Ids → the ordinal each one holds inside its group.
 *
 * `{ r1-sqft, r7-sqft, crewRate }` with prefix `r` becomes
 * `{ 'r1-sqft': 'r#1-sqft', 'r7-sqft': 'r#2-sqft', crewRate: 'crewRate' }`:
 * the counter is replaced by the row's rank among the rows actually present.
 * Ungrouped ids pass through unchanged, so they keep comparing exactly.
 *
 * Ranking by the numeric counter and not by the order ids were handed in is
 * what makes the two sides comparable: the saved bid's key order is whatever
 * `JSON.parse` produced, while the form's is DOM order, and only the counter
 * is common to both.
 */
export function normalizeRepeatIds(ids, prefixes) {
  const list = Array.isArray(ids) ? ids : [];
  const groups = new Map();
  for (const id of list) {
    const split = splitRepeatId(id, prefixes);
    if (!split) continue;
    if (!groups.has(split.prefix)) groups.set(split.prefix, new Set());
    groups.get(split.prefix).add(split.index);
  }

  const rank = new Map();
  const counts = {};
  for (const [prefix, indexes] of groups) {
    const sorted = [...indexes].sort((a, b) => a - b);
    counts[prefix] = sorted.length;
    sorted.forEach((index, position) => rank.set(`${prefix} ${index}`, position + 1));
  }

  const map = {};
  for (const id of list) {
    const split = splitRepeatId(id, prefixes);
    if (!split) { map[id] = id; continue; }
    map[id] = `${split.prefix}#${rank.get(`${split.prefix} ${split.index}`)}-${split.field}`;
  }
  return { map, counts };
}

/**
 * How many times to click each group's add control before restoring.
 *
 * Only ever positive: a group the form has too many of is not something this
 * can fix, and reporting it as a negative click count would invite a caller to
 * try. That case falls through to the ordinary refusal.
 */
export function rowsToGrow(savedCounts, formCounts, prefixes) {
  const out = {};
  for (const prefix of Array.isArray(prefixes) ? prefixes : []) {
    const want = Number(savedCounts?.[prefix] ?? 0);
    const have = Number(formCounts?.[prefix] ?? 0);
    if (!Number.isFinite(want) || !Number.isFinite(have)) continue;
    const grow = want - have;
    if (grow > 0) out[prefix] = Math.min(grow, MAX_REPEAT_ROWS);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Follow-up: how old a waiting bid is, and what the visitor is told about it
// ---------------------------------------------------------------------------
//
// These three are the only logic in this file that runs in three places — the
// saved-bids band on a calculator, the hub's index of every saved bid, and the
// tests here. Both of those pages are inline scripts assembled at build time,
// so the established shape in this repo (see `savedBids()` in `build.mjs`
// mirroring `savedBidIndex` above) is to write the rule twice and test one
// copy. That is a standing invitation for the two to drift, and the drift would
// be invisible: the hub would say a bid is nine days old and the calculator ten.
//
// So these are injected by `.toString()` instead, through
// `BID_FOLLOW_UP_HELPERS`. The browser runs the same function body the tests
// run, which is why they are written in ES5 — `var`, no arrows, no template
// literals — and are self-contained apart from each other.

/**
 * Whole days between a bid's save time and now, or `null` if the stored
 * timestamp is not a date.
 *
 * Clamped at zero. A device whose clock moved backwards — or a bid restored
 * from a backup written by a machine running fast — must not report a bid
 * saved "-2 days ago", and there is nothing useful to say about a negative age
 * that "today" does not already say.
 */
export function bidWaitingDays(at, nowMs) {
  var t = Date.parse(at);
  if (t !== t) return null;
  var days = Math.floor((nowMs - t) / 86400000);
  return days < 0 ? 0 : days;
}

/**
 * The per-row nudge: `waiting 9 days`.
 *
 * Empty for a bid saved today and for one with no readable date. A bid priced
 * this morning is not late, and a badge saying "waiting 0 days" on every fresh
 * bid would train the contractor to stop reading the column that exists to be
 * read on the nineteenth day.
 */
export function bidWaitingPhrase(days) {
  if (typeof days !== 'number' || !(days > 0)) return '';
  return 'waiting ' + days + (days === 1 ? ' day' : ' days');
}

/**
 * The summary above a list of bids.
 *
 * Two independent clauses, either of which may be absent:
 *
 *   "3 bids are waiting on an answer, the oldest saved 19 days ago."
 *   "You have won 4 of the 7 you have heard back on."
 *
 * The first is the reason this feature exists. The second is the only thing in
 * the portfolio that tells a contractor whether their pricing wins work, and it
 * is deliberately a bare count rather than a percentage: at seven decided bids
 * a percentage reads as a statistic the sample cannot support, and "4 of 7" is
 * the same fact without the false precision.
 *
 * Returns `''` when there is nothing to say, so a caller can hide the line
 * rather than draw an empty one.
 */
export function followUpSentence(rows, nowMs) {
  if (!rows || !rows.length) return '';

  var waiting = 0;
  var won = 0;
  var lost = 0;
  var oldest = -1;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row || typeof row !== 'object') continue;
    if (row.outcome === 'won') { won++; continue; }
    if (row.outcome === 'lost') { lost++; continue; }
    waiting++;
    var days = bidWaitingDays(row.at, nowMs);
    if (days !== null && days > oldest) oldest = days;
  }

  var parts = [];
  if (waiting > 0) {
    // `oldest` stays -1 when no waiting bid had a readable date, and the clause
    // then drops the age rather than inventing one.
    var ago = oldest < 0 ? '' : oldest === 0 ? 'today' : oldest === 1 ? '1 day ago' : oldest + ' days ago';
    if (waiting === 1) {
      parts.push('1 bid is waiting on an answer' + (ago ? ', saved ' + ago : '') + '.');
    } else {
      var tail = !ago ? '' : oldest === 0 ? ', all saved today' : ', the oldest saved ' + ago;
      parts.push(waiting + ' bids are waiting on an answer' + tail + '.');
    }
  }

  var decided = won + lost;
  if (decided > 0) {
    parts.push('You have won ' + won + ' of the ' + decided + ' you have heard back on.');
  }

  return parts.join(' ');
}

/**
 * How many answered bids it takes before their timings say anything.
 *
 * Three, and for the same reason the price band wants two a side: this is a
 * range read off a contractor's own history, and a range drawn from two points
 * is just the two points. Three is still small, which is why what gets printed
 * is the observed spread rather than an average, a median, or a prediction of
 * when the next one will land.
 */
export const MIN_RESPONSE_SAMPLE = 3;

/**
 * Whole days between pricing a bid and hearing back about it, or `null`.
 *
 * `decidedAt` has been written on every decided bid since outcomes shipped, is
 * merged correctly across devices by `backup.mjs`, is carried through a
 * re-price — and has never been read by anything a visitor sees. This is what
 * it was stored for.
 *
 * Clamped at zero like `bidWaitingDays`, and for the same reason: a bid restored
 * from a machine whose clock ran fast must not report that the customer answered
 * before they were quoted.
 */
export function bidResponseDays(bid) {
  if (!bid || typeof bid !== 'object') return null;
  if (bid.outcome !== 'won' && bid.outcome !== 'lost') return null;
  var priced = Date.parse(bid.at);
  var answered = Date.parse(bid.decidedAt);
  if (priced !== priced || answered !== answered) return null;
  var days = Math.floor((answered - priced) / 86400000);
  return days < 0 ? 0 : days;
}

/**
 * How long this contractor's customers have actually taken to answer.
 *
 * `{ answered, low, high }` in whole days, or `null` below
 * `MIN_RESPONSE_SAMPLE` answered bids carrying both timestamps.
 *
 * Split out of `chaseSentence` because the sentence was only ever half the
 * feature. "2 still waiting have been out longer than that" is the line worth
 * acting on, and a contractor reading it then had to work out *which two* by
 * comparing every row's age against a number in a paragraph above. The window
 * is what decides that, so it has to be a value the renderers can hold rather
 * than an intermediate inside the sentence.
 *
 * The window is a fact about this contractor's customers and their own
 * follow-up, not about a trade or a price level, which is why — unlike the
 * price band — it is meaningful read across every tool at once. See the hub's
 * chase line.
 */
export function responseWindow(bids) {
  if (!bids || !bids.length) return null;

  var answered = 0;
  var low = 0;
  var high = 0;
  for (var i = 0; i < bids.length; i++) {
    var days = bidResponseDays(bids[i]);
    if (days === null) continue;
    if (answered === 0 || days < low) low = days;
    if (answered === 0 || days > high) high = days;
    answered++;
  }
  if (answered < MIN_RESPONSE_SAMPLE) return null;
  return { answered: answered, low: low, high: high };
}

/**
 * Has this particular quote outlived every answer this contractor has had?
 *
 * Strictly longer than the window's slowest answer, never equal to it: a bid
 * out exactly as long as the slowest reply the contractor ever got has not yet
 * outlived it, and the sentence counts it the same way.
 *
 * `false` for every bid when the window is `null`, so a caller below the sample
 * threshold marks nothing rather than falling back to a rule of thumb this
 * feature deliberately does not carry.
 */
export function isQuietBid(bid, seen, nowMs) {
  if (!seen) return false;
  if (!bid || typeof bid !== 'object') return false;
  if (bid.outcome === 'won' || bid.outcome === 'lost') return false;
  var waited = bidWaitingDays(bid.at, nowMs);
  return waited !== null && waited > seen.high;
}

/**
 * Which of the waiting bids have gone quiet.
 *
 * The feature's own stated reason for existing is that *"a one-truck
 * contractor's largest lost revenue is not the bid they priced wrong, it is the
 * bid nobody ever chased"* — and until now the only thing said about a waiting
 * bid was its age in days. Nineteen days means nothing on its own. Nineteen days
 * when every customer who ever answered did so inside nine is the whole signal,
 * and it is the contractor's own history rather than an industry rule of thumb.
 *
 * Two clauses:
 *
 *   "The 5 bids you have heard back on came back in 2 to 9 days.
 *    2 still waiting have been out longer than that."
 *
 * The second is the actionable one and is absent when nothing has gone quiet,
 * which is the common and happy case. The first is deliberately a spread and not
 * an average: an average invites "so I will hear on Thursday", which this cannot
 * know, where a spread says only what has already happened.
 *
 * Returns `''` below `MIN_RESPONSE_SAMPLE` answered bids that carry both
 * timestamps — including every bid decided before `decidedAt` was stored, which
 * simply does not count toward the window rather than corrupting it.
 */
export function chaseSentence(bids, nowMs) {
  var seen = responseWindow(bids);
  if (!seen) return '';

  var answered = seen.answered;
  var low = seen.low;
  var high = seen.high;

  var quiet = 0;
  for (var w = 0; w < bids.length; w++) {
    if (isQuietBid(bids[w], seen, nowMs)) quiet++;
  }

  var spread = low === high
    ? (low === 0 ? 'came back the same day' : 'came back in ' + low + (low === 1 ? ' day' : ' days'))
    : 'came back in ' + low + ' to ' + high + ' days';

  var out = 'The ' + answered + ' bids you have heard back on ' + spread + '.';
  if (quiet > 0) {
    out += ' ' + quiet + ' still waiting ' + (quiet === 1 ? 'has' : 'have') +
      ' been out longer than that.';
  }
  return out;
}

/**
 * How many decided bids each side needs before the price band is drawn.
 *
 * Two, not one. One win and one loss is a pair of anecdotes, and a tool that
 * told a contractor "you won at $1,800 and lost at $2,000" would be inviting
 * them to reprice a season's work off two data points. Two a side is still a
 * small sample — which is why the sentence reports counts and never a
 * percentage or a "sweet spot", the same restraint `followUpSentence` applies
 * to "4 of 7".
 */
export const MIN_PRICE_BAND_SIDE = 2;

/**
 * The money in a stored headline figure, as a number this can compare.
 *
 * `normalizeHeadlineAmount` deliberately keeps the string the tool displayed
 * and does no arithmetic on it, because a sum across tools would be adding a
 * roof to a lawn contract. This function is the narrow exception, and the
 * narrowness is the whole design: it is only ever used to compare a tool's own
 * bids against each other, where every figure is the same kind of number in the
 * same currency, and it refuses anything it cannot read with certainty.
 *
 * Refused, all of them cases the built site actually produces or could:
 *
 *   - two currency symbols, which is how a range renders (`$1,200–$1,800`) —
 *     averaging the low end of a range would report a figure nobody was quoted;
 *   - a symbol that does not precede its digits (`1 234,56 €`), because
 *     deciding whether that comma is a decimal point is a guess;
 *   - a comma group that is not a thousands separator (`$1,5`);
 *   - anything `normalizeHeadlineAmount` already refuses.
 *
 * A trailing unit is kept out of the number but does not disqualify it:
 * `$589.38 · 13.2 h` reads as 589.38, because the hours are a second fact about
 * the same quote rather than a second quote.
 *
 * `text` is the exact substring that was on screen, so a caller can show the
 * figure the visitor saw rather than a re-rendering of it.
 */
export function bidAmountValue(display) {
  var text = normalizeHeadlineAmount(display);
  if (!text) return null;
  if ((text.match(/[$£€]/g) || []).length !== 1) return null;
  var found = /([-−]?)\s*([$£€])\s*(\d[\d,]*(?:\.\d+)?)/.exec(text);
  if (!found) return null;
  var digits = found[3];
  if (digits.indexOf(',') !== -1 && !/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(digits)) return null;
  var sign = found[1] === '' ? 1 : -1;
  return {
    currency: found[2],
    value: sign * Number(digits.replace(/,/g, '')),
    text: (sign < 0 ? '-' : '') + found[2] + digits,
  };
}

/**
 * One side of the comparison: its average, and the bid at its outer edge.
 *
 * `direction` is `1` for the won side, whose edge is its dearest bid, and `-1`
 * for the lost side, whose edge is its cheapest. Written once with a sign
 * rather than twice with `>` and `<` because it ships inside 160 pages the
 * service worker caches whole, and a second near-identical loop is a hundred
 * bytes a page for nothing.
 */
export function bidPriceSide(side, direction) {
  var total = 0;
  var edge = side[0];
  for (var i = 0; i < side.length; i++) {
    total += side[i].value;
    if ((side[i].value - edge.value) * direction > 0) edge = side[i];
  }
  return { average: total / side.length, edge: edge };
}

/**
 * An average, written the way the tool that produced it would write it.
 *
 * Two decimal places under 100 and none above. A seller-fee page answers in
 * cents — rounding a $2.35 profit per unit to $2 misstates it by 15% — while a
 * trade quote in the thousands gains nothing from `.00` and loses a little
 * readability on a phone. The threshold is on the value being written, so a
 * single tool never renders one of its two averages to a different precision
 * than the other unless they genuinely straddle it.
 *
 * Only figures this file computed go through here — the averages, and
 * `revisionSentence`'s difference between two quotes. Every figure quoted back
 * as an actual bid is the stored string, so no number a contractor reads to a
 * customer has been through a rounding rule this file invented.
 */
export function formatBidAmount(currency, value) {
  var decimals = Math.abs(value) < 100 ? 2 : 0;
  var fixed = Math.abs(value).toFixed(decimals);
  var parts = fixed.split('.');
  var whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (value < 0 ? '-' : '') + currency + whole + (parts[1] ? '.' + parts[1] : '');
}

/**
 * Below this, the change is not worth a percentage.
 *
 * A rounded 0.0% beside a real money difference reads as "no change" and is
 * wrong; the money half is exact and says it on its own.
 */
export const MIN_REVISION_PERCENT = 0.1;

/**
 * What the form says now, against the figure the restored bid was saved at.
 *
 * Why this exists
 * ---------------
 * The module header opens on the Friday call — "what was that number again, and
 * what if we skip the tear-off?" — and until now this file answered only its
 * first half. `restore` puts the whole job back, which settles "what was that
 * number". Then the contractor deletes the tear-off line and the page reprices,
 * and the figure they quoted on Tuesday is gone from the screen: the only thing
 * left is a new number, with no relation drawn to the one the customer is
 * holding a printed proposal of.
 *
 * That relation is the entire content of the phone call. "It comes to seven two
 * ten" is not an answer to "what if we skip it"; "twelve hundred and forty
 * less, about fifteen percent" is. A contractor doing that subtraction in their
 * head, off a number they are half-remembering, is exactly how a concession
 * gets quoted at the wrong size — and it is the one arithmetic error on this
 * page that the tool was not already doing for them.
 *
 * Deliberately not a stored field. This compares a saved bid against the live
 * form, so it is true only for as long as the form still holds that job; the
 * moment it is saved over, the two agree by construction and there is nothing
 * to say. Nothing here writes to the store.
 *
 * Returns `''` — draw nothing — whenever the comparison cannot be honest:
 * either figure unreadable, or the two in different currencies. Mixed
 * currencies are refused rather than converted, the same rule
 * `priceBandSentence` follows and for the same reason: this file has no rates
 * and should never acquire any.
 *
 * The two quotes are the strings the tools wrote. The *difference* is not — it
 * is computed here, so it is written to `formatBidAmount`'s rule like every
 * other figure this file derives, which rounds to whole units above 100. On a
 * $22,683.07 quote that reads "$4,306 less" rather than "$4,306.09": the right
 * precision for a number said out loud, and the reason both quotes are printed
 * beside it rather than the difference alone.
 *
 * The percentage is omitted, not inverted, when the saved figure is zero or
 * negative. A few tools here headline a profit that can go below zero, where
 * "40% less" against a loss is a sentence with no agreed meaning; the money
 * difference is exact in every case, so it carries the reading alone.
 */
export function revisionSentence(quoted, live) {
  var was = bidAmountValue(quoted);
  var now = bidAmountValue(live);
  if (!was || !now) return '';
  if (was.currency !== now.currency) return '';

  var delta = now.value - was.value;
  // The figures are quoted back as the strings the tools wrote, never
  // reformatted: what the contractor reads here has to match the proposal in
  // the customer's hand character for character.
  if (delta === 0) return 'Still ' + now.text + ', the figure this bid was saved at.';

  var share = '';
  if (was.value > 0) {
    var percent = Math.round((Math.abs(delta) / was.value) * 1000) / 10;
    if (percent >= MIN_REVISION_PERCENT) share = ' (' + percent + '%)';
  }
  return (
    now.text + ' now, against ' + was.text + ' saved — ' +
    formatBidAmount(was.currency, Math.abs(delta)) + (delta > 0 ? ' more' : ' less') + share + '.'
  );
}

/**
 * Where this tool's quotes tip from won to lost.
 *
 * The one thing in the portfolio that answers "am I pricing this right?" with
 * the contractor's own history rather than an industry average. Every ingredient
 * was already on disk — the figure each bid was saved at, and whether the
 * customer said yes — and until now nothing put the two together, so a
 * contractor with a season of decided bids could see that they had won 11 of 19
 * and still not see that every one they lost was over $2,600.
 *
 * Scoped to a single tool by construction: the caller passes one tool's bids,
 * because a quote off the roofing calculator and a profit-per-unit off an eBay
 * fee page are not comparable quantities. Mixed currencies inside one tool are
 * refused outright rather than converted — this feature has no rates and should
 * never acquire any.
 *
 * Two sentences. The first is the centre of each group; the second is the
 * actionable part, and which one it is depends on the data:
 *
 *   - **Separated.** Nothing won costs more than anything lost, so there is a
 *     real threshold between them and the contractor can see where it is.
 *   - **Overlapping.** They have won above the price they have lost at, which
 *     says the opposite and is worth saying just as loudly: price is not what
 *     decided those jobs, and dropping it will not win them. Phrased as the two
 *     edges rather than as a range so that the case where they are equal — won
 *     and lost at the same figure — reads correctly instead of as "between
 *     $2,000 and $2,000".
 *
 * Returns `''` — draw nothing — below `MIN_PRICE_BAND_SIDE` on either side, on
 * mixed currencies, and when no decided bid carries a readable figure.
 */
export function priceBandSentence(bids) {
  if (!bids || !bids.length) return '';

  var won = [];
  var lost = [];
  var currency = '';

  for (var i = 0; i < bids.length; i++) {
    var bid = bids[i];
    if (!bid || typeof bid !== 'object') continue;
    if (bid.outcome !== 'won' && bid.outcome !== 'lost') continue;
    var parsed = bidAmountValue(bid.amount);
    if (!parsed) continue;
    if (currency === '') currency = parsed.currency;
    else if (parsed.currency !== currency) return '';
    if (bid.outcome === 'won') won.push(parsed); else lost.push(parsed);
  }

  if (won.length < MIN_PRICE_BAND_SIDE || lost.length < MIN_PRICE_BAND_SIDE) return '';

  var high = bidPriceSide(won, 1);
  var low = bidPriceSide(lost, -1);

  var centre = 'The ' + won.length + ' you won here averaged ' +
    formatBidAmount(currency, high.average) + ', the ' + lost.length + ' you lost, ' +
    formatBidAmount(currency, low.average) + '.';

  var edge = high.edge.value < low.edge.value
    ? 'Every bid you won was ' + high.edge.text + ' or under, and every one you lost ' +
      low.edge.text + ' or over.'
    : 'You have won as high as ' + high.edge.text + ' and lost as low as ' + low.edge.text +
      ', so price alone has not been deciding these.';

  return centre + ' ' + edge;
}

/**
 * How many lost bids with a known winning price before the gap is drawn.
 *
 * Two, for the reason `MIN_PRICE_BAND_SIDE` is two: one job that went for
 * $400 under is a story about that job — the customer's brother-in-law, a
 * competitor buying the work — and a tool that reported it as a finding would
 * be telling a contractor to cut $400 off every quote on the strength of one
 * anecdote. Two is still a small sample, which is why this reports the figures
 * it was given and never a target price.
 */
export const MIN_UNDERCUT_SAMPLE = 2;

/**
 * How far the winning bid actually was from yours.
 *
 * The question `priceBandSentence` raises and cannot answer. It can say every
 * bid you lost was over $2,600; it cannot say whether the jobs went for $2,500
 * or $1,400, and that difference is the whole decision — the first is a shop
 * that is close and can win on terms, the second is a shop bidding a different
 * market. The contractor usually knows the number, because losing a
 * residential job comes with someone telling you what it went for. Nothing in
 * the tool has ever asked for it.
 *
 * Scoped and refused exactly as the price band is: one tool's bids, one
 * currency, no conversion. Only lost bids count — a won bid's "winning price"
 * is its own figure, which would compare a number against itself.
 *
 * Two sentences, and the second is the honest half:
 *
 *   - **You were over.** The average money gap, and the percentage it is of
 *     what the jobs actually went for, which is how a person says "I was 14%
 *     over". Then the closest near-miss, because a shop $120 off is deciding
 *     something different from a shop $900 off.
 *   - **You were at or under on some of them and still lost.** Said as loudly
 *     as the gap, because it is the finding that stops a contractor cutting a
 *     price that was never the problem. It is also the case that a cheaper
 *     quote cannot fix.
 *
 * Returns `''` — draw nothing — below `MIN_UNDERCUT_SAMPLE`, on mixed
 * currencies, and when no lost bid carries both a readable figure of its own
 * and a recorded winning price.
 */
export function undercutSentence(bids) {
  if (!bids || !bids.length) return '';

  var gaps = [];
  var mineTotal = 0;
  var theirsTotal = 0;
  var currency = '';

  for (var i = 0; i < bids.length; i++) {
    var bid = bids[i];
    if (!bid || typeof bid !== 'object') continue;
    if (bid.outcome !== 'lost') continue;
    var went = normalizeLostTo(bid.lostTo);
    if (!went) continue;
    var parsed = bidAmountValue(bid.amount);
    // A negative or zero hero figure is a loss-per-unit reading, not a quote;
    // "you were 140% over" on one of those would be arithmetic about nothing.
    if (!parsed || parsed.value <= 0) continue;
    if (currency === '') currency = parsed.currency;
    else if (parsed.currency !== currency) return '';
    gaps.push(parsed.value - Number(went));
    mineTotal += parsed.value;
    theirsTotal += Number(went);
  }

  if (gaps.length < MIN_UNDERCUT_SAMPLE) return '';

  var closest = gaps[0];
  var notOver = 0;
  for (var g = 0; g < gaps.length; g++) {
    if (gaps[g] < closest) closest = gaps[g];
    if (gaps[g] <= 0) notOver++;
  }

  var known = 'On the ' + gaps.length + ' you lost where you know the winning price, ';
  var average = (mineTotal - theirsTotal) / gaps.length;
  var centre;
  if (average > 0) {
    // Against what the jobs went for, not against your own quote: "14% over"
    // is read as over *their* price, and dividing by yours would report a
    // smaller number for the same gap.
    var percent = Math.round(((mineTotal - theirsTotal) / theirsTotal) * 100);
    centre = known + 'yours averaged ' + formatBidAmount(currency, average) + ' more' +
      (percent > 0 ? ' — ' + percent + '% over' : '') + '.';
  } else {
    centre = known + 'yours averaged ' +
      (average === 0 ? 'the same' : formatBidAmount(currency, -average) + ' under') + '.';
  }

  var edge;
  if (notOver === gaps.length) {
    edge = 'None of them went to a cheaper bid, so price is not what decided these.';
  } else if (notOver > 0) {
    edge = notOver + ' of them went to a bid no cheaper than yours, so price alone has not been ' +
      'deciding these.';
  } else {
    edge = 'The closest was ' + formatBidAmount(currency, closest) + ' over.';
  }

  return centre + ' ' + edge;
}

/**
 * How many finished jobs with a cost entered before the margin is drawn.
 *
 * Three. Two would make the pooled figure a coin toss between one good job and
 * one bad one, and the edge sentence below is a claim about a *spread* — with
 * two jobs there is no distribution to describe, only the pair. Three is still
 * a small book, which is why the reading reports what those jobs did and never
 * what they ought to have done.
 *
 * Higher than `MIN_PRICE_BAND_SIDE` for a reason the price band does not have:
 * every ingredient there was already on disk, and a cost has to be typed in
 * after the job is off the truck. Someone who has entered three has told this
 * panel something deliberate, and the floor should not be so high that the
 * effort goes unanswered for a season.
 */
export const MIN_MARGIN_SAMPLE = 3;

/**
 * How far apart the best and worst job must be before the spread is named.
 *
 * Twenty points of margin. Below that the jobs are telling one story and the
 * pooled figure is a fair summary of it; above it the average is a number no
 * single job did, and quoting it alone would hide the case this reading exists
 * to surface — one trade, or one customer, quietly carrying the rest.
 */
export const MARGIN_SPREAD_POINTS = 20;

/**
 * What the jobs this contractor won actually kept, once they were done.
 *
 * The counterweight to every other reading in this panel. `priceBandSentence`
 * finds where a price tips from won to lost and `winRateSentence` counts how
 * often it lands; act on both and you learn to win more work, with no way to
 * tell whether the work is worth winning. A contractor can be losing money on
 * every job they take and every reading here will look like it is going well —
 * the win rate climbs precisely *because* the price is too low.
 *
 * Scoped to one tool, like `priceBandSentence` and for the same reason: a
 * margin off the roofing calculator and a margin off an eBay fee page are not
 * the same quantity, and mixed currencies inside one tool are refused rather
 * than converted. This feature has no exchange rates and should never get any.
 *
 * The percentage is **pooled** — total kept over total charged — not the mean
 * of the per-job percentages. Those differ, and pooling is the honest one: a
 * $400 job at 40% and a $12,000 job at 4% average to 22% by the mean and to
 * 5% pooled, and 5% is what actually went in the bank. The mean would flatter
 * a book whose small jobs are the profitable ones, which is the common shape
 * in the trades and exactly the shape a contractor needs not to be flattered
 * about.
 *
 * Two sentences, the second chosen by what the numbers actually contain:
 *
 *   - **A job below its own cost.** Said first and said plainly, because it is
 *     the finding with the shortest path to money and the one a pooled average
 *     is most able to bury. A single job at -15% inside five at +18% barely
 *     moves the total.
 *   - **A wide spread.** The average is not what any of these jobs did, so
 *     naming it alone would send someone to re-price the whole book when one
 *     end of it is fine.
 *   - **Neither.** The limit of the reading itself: it knows only the costs
 *     that were typed in, and a contractor who left their own hours out of
 *     them is reading a number that is too kind.
 *
 * Never a figure to aim for. There is no correct margin — it moves with trade,
 * overhead and what a shop counts as a cost — and printing one would be
 * inventing the number a contractor came here to stop guessing at.
 *
 * Returns `''` — draw nothing — below `MIN_MARGIN_SAMPLE` finished jobs, on
 * mixed currencies, and when no won bid carries both a readable figure and a
 * cost.
 */
export function marginSentence(bids) {
  if (!bids || !bids.length) return '';

  var jobs = [];
  var currency = '';
  var charged = 0;
  var spent = 0;

  for (var i = 0; i < bids.length; i++) {
    var bid = bids[i];
    if (!bid || typeof bid !== 'object') continue;
    if (bid.outcome !== 'won') continue;
    var cost = normalizeJobCost(bid.cost);
    if (!cost) continue;
    var parsed = bidAmountValue(bid.amount);
    if (!parsed) continue;
    // A hero figure of zero or below is not a price this can take a share of.
    // Some tools here answer in a saving or a difference rather than a quote,
    // and dividing by one of those would print a percentage of nothing.
    if (!(parsed.value > 0)) continue;
    if (currency === '') currency = parsed.currency;
    else if (parsed.currency !== currency) return '';
    var paid = Number(cost);
    charged += parsed.value;
    spent += paid;
    jobs.push({ kept: parsed.value - paid, share: ((parsed.value - paid) / parsed.value) * 100 });
  }

  if (jobs.length < MIN_MARGIN_SAMPLE) return '';

  var kept = charged - spent;
  var pooled = Math.round((kept / charged) * 100);
  var centre = 'The ' + jobs.length + ' you finished here were priced at ' +
    formatBidAmount(currency, charged) + ' and cost you ' + formatBidAmount(currency, spent) +
    ' — you kept ' + formatBidAmount(currency, kept) + ', ' + pooled + '% of what you charged.';

  // Two different "worst"s, and conflating them was a real defect while this
  // was being written. The spread below is about shares, so its ends are the
  // lowest and highest percentages. The loss quoted above is money, so it is
  // the deepest hole in currency — on a book holding a $100 job that cost $200
  // and a $10,000 job that cost $10,500, the worst share is the small job and
  // the worst loss is the large one, and "the worst by $100" would be pointing
  // at the wrong job while a $500 hole went unmentioned.
  var worst = jobs[0];
  var best = jobs[0];
  var deepest = jobs[0];
  var under = 0;
  for (var j = 0; j < jobs.length; j++) {
    if (jobs[j].share < worst.share) worst = jobs[j];
    if (jobs[j].share > best.share) best = jobs[j];
    if (jobs[j].kept < deepest.kept) deepest = jobs[j];
    if (jobs[j].kept < 0) under++;
  }

  var edge;
  if (under > 0) {
    edge = (under === 1 ? 'One of them cost more than it was priced at, by ' +
        formatBidAmount(currency, -deepest.kept) + '.'
      : under + ' of them cost more than they were priced at, the worst by ' +
        formatBidAmount(currency, -deepest.kept) + '.') +
      ' That job is inside the figure above rather than beside it.';
  } else if (best.share - worst.share >= MARGIN_SPREAD_POINTS) {
    edge = 'They run from ' + Math.round(worst.share) + '% to ' + Math.round(best.share) +
      '%, so the figure above is not what any one of these jobs did — the low end is the one ' +
      'to go back over.';
  } else {
    edge = 'This counts whatever you entered as the cost, so it is only as complete as your own ' +
      'job costing — your own hours are the ones most often left out.';
  }

  return centre + ' ' + edge;
}

/**
 * Why the panel has gone quiet about money, and what would make it speak.
 *
 * Every money reading this portfolio has built in the last week — the tool
 * page's `marginSentence`, the hub's `keepSentence`, the hub's `mixSentence` —
 * stands on one input that no calculation can supply: what the job came to
 * once it was delivered. It is the only field here a contractor has to come
 * back *after* the work to fill in, and it is optional, unprompted, and easy
 * to miss on a row that already looks finished.
 *
 * So the whole feature has a funnel, and until now nothing in the product
 * mentioned it. A contractor who wins six jobs, marks all six won, and costs
 * none of them sees exactly what a contractor who costed them all would see
 * minus one paragraph — no gap, no prompt, no reason to believe the box beside
 * the row is worth anything. `bid_cost_set` against `bid_marked_won` is the
 * number `usage.yaml` says is worth watching precisely because it is the
 * narrowest part of that funnel, and a silence is a bad way to widen it.
 *
 * Two branches, both of which say something true about *their* book rather
 * than asking for data on the product's behalf:
 *
 *   - **The reading cannot draw yet.** Says how many of their won jobs carry a
 *     delivered cost, how many more it would take, and — the part that makes
 *     it worth doing rather than a chore — what the answer would be *about*:
 *     the one question every other reading in the panel leaves open.
 *   - **The reading is drawing, and is blind to some of the book.** A kept
 *     figure pooled over four costed jobs while five uncosted ones sit in the
 *     same list is a true statement about part of a book, presented where a
 *     reader will take it for the whole. `marginSentence`'s own honest half
 *     says the costs are only as good as the job costing; this says how many
 *     jobs are not in them at all, which is the half a count can settle and
 *     prose cannot.
 *
 * Counts only won bids whose figure the panel can actually read. A won bid
 * with no readable hero amount could never enter a kept share whatever its
 * cost, so asking for one would be asking for a number nothing reads — the
 * same guard, for the same reason, that gates the cost box onto the row.
 *
 * Never a nag and never a target: no "you should", no share to aim for, no
 * second sentence when the book is fully costed. Once every won job carries a
 * cost this returns `''` and the panel is quiet again, which is the whole
 * difference between a prompt and a banner.
 *
 * Returns `''` — draw nothing — when no won job is missing a cost, and when
 * costing every one of them still would not reach `MIN_MARGIN_SAMPLE`, because
 * a prompt that promises a reading the book cannot support is worse than
 * silence.
 */
export function costGapSentence(bids) {
  if (!bids || !bids.length) return '';

  var costed = 0;
  var uncosted = 0;

  for (var i = 0; i < bids.length; i++) {
    var bid = bids[i];
    if (!bid || typeof bid !== 'object') continue;
    if (bid.outcome !== 'won') continue;
    var parsed = bidAmountValue(bid.amount);
    if (!parsed) continue;
    // The same guard `marginSentence` uses: a hero figure that is a saving or
    // a difference is not a price to take a cost away from.
    if (!(parsed.value > 0)) continue;
    if (normalizeJobCost(bid.cost)) costed++; else uncosted++;
  }

  if (!uncosted) return '';
  var won = costed + uncosted;

  if (costed >= MIN_MARGIN_SAMPLE) {
    return 'Of the ' + won + ' jobs you have won here, ' + costed + ' carry what they came to ' +
      'and ' + uncosted + ' do not. A kept figure can only be drawn from the ' + costed +
      ' — the rest are missing from it rather than averaged into it, so it describes part of ' +
      'your book and not all of it.';
  }

  if (won < MIN_MARGIN_SAMPLE) return '';

  var need = MIN_MARGIN_SAMPLE - costed;
  var have = costed === 0
    ? 'None of the ' + won + ' jobs you have won here carry what they came to once they were ' +
      'delivered'
    : 'Only ' + costed + ' of the ' + won + ' jobs you have won here carry what they came to ' +
      'once they were delivered';
  return have + '. Put that figure in the box beside ' +
    (need === 1 ? 'one more of them' : need + ' more of them') +
    ' and this panel starts saying what your finished work actually kept — the one question ' +
    'every reading above it leaves open, because they are all about winning the work rather ' +
    'than about whether the work was worth winning.';
}

/**
 * How many lost bids with a known winning price before the hub draws a reading.
 *
 * Three, where the single-tool `undercutSentence` wants two, and the extra one
 * is the price of pooling. `MIN_UNDERCUT_SAMPLE` is two because those two bids
 * are the same trade at the same tool, so a contractor reading "you averaged
 * 14% over" knows exactly which two jobs it is about. This reading mixes
 * trades, and the same two bids there could be one fence and one bathroom —
 * further apart, and worth one more point before it is put on screen. Still
 * small, which is why this reports the spread it was given and never a target.
 */
export const MIN_CROSS_TOOL_SAMPLE = 3;

/**
 * How this contractor's pricing is landing, read across every tool at once.
 *
 * The hub's pricing counterpart to `chaseSentence`, and it exists because every
 * price reading in this portfolio is scoped to a single tool while a great many
 * of these contractors are not. A crew that fences, decks, and builds pergolas
 * works three calculators. Four decided bids on each is twelve — a real season
 * — and `priceBandSentence` draws nothing on any of the three, because each
 * side of each tool sits below `MIN_PRICE_BAND_SIDE`. The contractor has the
 * evidence and the site shows them none of it.
 *
 * What makes pooling legitimate here is the same thing that makes it legitimate
 * for `responseWindow`: the quantity is unit-free. Days are days on every tool,
 * and a percentage over the winning price is a percentage on every tool. That
 * is why this says **only** percentages and never money. `priceBandSentence`
 * refuses mixed currencies outright and `undercutSentence` refuses them too,
 * both correctly — a dollar quote and a euro quote cannot be averaged and this
 * feature has no rates and must never acquire any. But "I was 14% over" is a
 * fact inside one bid's own currency, so a book of dollar bids and euro bids
 * pools without any conversion at all. Hence the mean of the per-bid
 * percentages, never `(sum of mine - sum of theirs) / sum of theirs`: that
 * second form is the one that would be quietly summing currencies together.
 *
 * Naming the tool count is not decoration. "Across 7 bids on 3 tools" is what
 * tells a contractor this is their whole book rather than a verdict on one
 * trade, and it is the difference between reading the number as "my prices are
 * high" and "my fence prices are high".
 *
 * Two sentences, the second the honest half, exactly as `undercutSentence`:
 *
 *   - **You were over.** The average, and then the closest near-miss, because a
 *     shop 2% off is deciding something different from a shop 30% off.
 *   - **Some went to a bid no cheaper than yours.** Said as loudly as the gap,
 *     because it is the finding that stops a contractor cutting a price that
 *     was never the problem.
 *
 * Returns `''` — draw nothing — below `MIN_CROSS_TOOL_SAMPLE`, and when no lost
 * bid carries both a readable figure of its own and a recorded winning price.
 */
export function pricingSentence(bids) {
  if (!bids || !bids.length) return '';

  var percents = [];
  var slugs = [];
  for (var i = 0; i < bids.length; i++) {
    var bid = bids[i];
    if (!bid || typeof bid !== 'object') continue;
    if (bid.outcome !== 'lost') continue;
    var went = normalizeLostTo(bid.lostTo);
    if (!went) continue;
    var parsed = bidAmountValue(bid.amount);
    // Same guard as undercutSentence: a negative or zero hero figure is a
    // loss-per-unit reading rather than a quote, and a percentage against it
    // would be arithmetic about nothing.
    if (!parsed || parsed.value <= 0) continue;
    // Against what the job went for, not against the quote, so this reads the
    // way a person says it: "I was 14% over" means over *their* price.
    percents.push(((parsed.value - Number(went)) / Number(went)) * 100);
    if (typeof bid.slug === 'string' && bid.slug && slugs.indexOf(bid.slug) === -1) {
      slugs.push(bid.slug);
    }
  }

  if (percents.length < MIN_CROSS_TOOL_SAMPLE) return '';

  var total = 0;
  var closest = percents[0];
  var notOver = 0;
  for (var p = 0; p < percents.length; p++) {
    total += percents[p];
    if (percents[p] < closest) closest = percents[p];
    if (percents[p] <= 0) notOver++;
  }
  var average = total / percents.length;

  // The tool count is dropped rather than written as "on 1 tool": at one tool
  // this is the same book `undercutSentence` already reports in money on that
  // tool's own page, and claiming breadth it does not have would be the one
  // dishonest word in the sentence.
  var across = 'Across the ' + percents.length + ' bids you lost' +
    (slugs.length > 1 ? ' on ' + slugs.length + ' tools' : '') +
    ' where you know the winning price, ';

  var centre;
  var rounded = Math.round(average);
  if (rounded === 0) {
    // A real gap that rounds to nothing. "0% over" reads as measured parity and
    // this is not that, so it is said as the bound it actually is.
    centre = across + 'yours came within 1% of what they went for.';
  } else if (rounded > 0) {
    centre = across + 'yours averaged ' + rounded + '% over.';
  } else {
    centre = across + 'yours averaged ' + -rounded + '% under.';
  }

  var edge;
  if (notOver === percents.length) {
    edge = 'None of them went to a cheaper bid, so price is not what decided these.';
  } else if (notOver > 0) {
    edge = notOver + ' of them went to a bid no cheaper than yours, so price alone has not ' +
      'been deciding these.';
  } else {
    var near = Math.round(closest);
    edge = near === 0
      ? 'The closest was within 1% of it.'
      : 'The closest was ' + near + '% over.';
  }

  return centre + ' ' + edge;
}

/**
 * How many decided bids before the hub will state a win rate.
 *
 * Five. Below that the rate is made of steps too large to mean anything — on
 * four bids it can only be 0, 25, 50, 75 or 100 — and a contractor reading
 * "you win 50% of your work" off two answers would be reading noise as a
 * finding. Five is still a small book, which is why this reports the count
 * beside the percentage and never suggests a rate to aim for.
 */
export const MIN_WIN_RATE_SAMPLE = 5;

/**
 * How many decided bids on one tool before that tool may be named.
 *
 * Four, where the pooled rate above wants five in total, and the extra
 * strictness is deliberate: the sentence below does not merely count a named
 * tool, it puts that trade forward as the place the contractor's pricing is or
 * is not working. On three bids the possible rates are 0, 33, 67 and 100, so
 * "your deck pricing is losing" could rest on a single job that went to the
 * customer's brother-in-law. Four makes the smallest reportable gap two bids
 * wide.
 */
export const MIN_WIN_RATE_PER_TOOL = 4;

/**
 * How far apart two tools' win rates must be before the split is drawn.
 *
 * Forty percentage points. At the four-bid floor the achievable rates are
 * quarters, so this admits 3-of-4 against 1-of-4 and refuses 3-of-4 against
 * 2-of-4 — one bid of difference, which is what a single unusual job looks
 * like. The threshold is on the gap rather than on either rate on its own,
 * because the finding is comparative: a shop winning 40% everywhere has a
 * pricing question, and a shop winning 80% on fences and 20% on decks has a
 * deck question, and those are not the same thing to go and fix.
 */
export const WIN_RATE_SPLIT_POINTS = 40;

/**
 * How this contractor's quotes are actually landing, counted across every tool.
 *
 * The reading the whole saved-bid feature has been able to compute since it
 * learned the word "lost" and has never once said out loud. `priceBandSentence`
 * compares won money against lost money on one tool; `pricingSentence` reports
 * how far over the winning price the lost jobs were. Neither answers the
 * question a contractor actually asks first — **how often do I win?** — and
 * neither can, because both are scoped to evidence most books do not carry:
 * `priceBandSentence` needs two won *and* two lost on the same calculator, and
 * `pricingSentence` needs the contractor to have heard what the job went for,
 * which on most lost bids nobody ever tells them.
 *
 * A win rate needs none of that. Every decided bid counts, whatever tool it was
 * priced on and whatever currency it was priced in, because a count is
 * unit-free in the way `pricingSentence` argues a percentage is — and more
 * plainly so, since nothing is being averaged at all. That is why this reading
 * will draw for a book where every money reading in the portfolio draws
 * nothing.
 *
 * Two sentences, and as everywhere else here the second is the honest half:
 *
 *   - **The rate.** Counts first and the percentage after, because "5 of 13" is
 *     the part that carries its own sample size; naming the tool span when
 *     there is more than one, for the reason `pricingSentence` names it — it is
 *     what tells the contractor this is their whole book rather than a verdict
 *     on one trade.
 *   - **Where the rate comes from.** When two tools each carry enough decided
 *     bids and their rates are far enough apart, they are named. This is the
 *     part no single tool can ever produce, and it is the one that changes what
 *     someone does on Monday: a contractor told "you win 38%" cuts prices
 *     across the board, and a contractor told "you win 4 of 5 on fences and 1
 *     of 6 on decks" goes and re-costs decks. Where the split cannot be drawn,
 *     the sentence says what a bare rate does not settle, which is the finding
 *     that stops the across-the-board cut.
 *
 * Never a target rate, in either branch. There is no correct win rate — it
 * moves with which jobs a shop chooses to quote at least as much as with what
 * it charges — and a tool that printed one would be inventing the number its
 * user came here to avoid guessing.
 *
 * Returns `''` — draw nothing — below `MIN_WIN_RATE_SAMPLE` decided bids.
 */
export function winRateSentence(bids) {
  if (!bids || !bids.length) return '';

  var won = 0;
  var decided = 0;
  var slugs = [];
  var byTool = {};

  for (var i = 0; i < bids.length; i++) {
    var bid = bids[i];
    if (!bid || typeof bid !== 'object') continue;
    if (bid.outcome !== 'won' && bid.outcome !== 'lost') continue;
    decided++;
    if (bid.outcome === 'won') won++;
    var slug = typeof bid.slug === 'string' ? bid.slug : '';
    if (!slug) continue;
    if (slugs.indexOf(slug) === -1) slugs.push(slug);
    if (!byTool[slug]) {
      byTool[slug] = { slug: slug, won: 0, decided: 0, label: slug };
      var label = typeof bid.label === 'string' ? bid.label.trim() : '';
      if (label) byTool[slug].label = label;
    }
    byTool[slug].decided++;
    if (bid.outcome === 'won') byTool[slug].won++;
  }

  if (decided < MIN_WIN_RATE_SAMPLE) return '';

  var rate = Math.round((won / decided) * 100);
  var centre = 'You have won ' + won + ' of ' + decided + ' decided bids — ' + rate + '%' +
    (slugs.length > 1 ? ', across ' + slugs.length + ' tools' : '') + '.';

  // Sorted by rate, then by slug, so two tools that have gone the same way
  // cannot swap places between two renders of the same book.
  var ranked = [];
  for (var s = 0; s < slugs.length; s++) {
    var tool = byTool[slugs[s]];
    if (tool.decided < MIN_WIN_RATE_PER_TOOL) continue;
    tool.rate = (tool.won / tool.decided) * 100;
    ranked.push(tool);
  }
  ranked.sort(function (a, b) {
    return b.rate - a.rate || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  });

  var edge = 'A win rate moves with which jobs you choose to quote as much as with what you ' +
    'charge, so this is where to start looking rather than a verdict on your prices.';

  if (ranked.length > 1) {
    var best = ranked[0];
    var worst = ranked[ranked.length - 1];
    if (best.rate - worst.rate >= WIN_RATE_SPLIT_POINTS) {
      edge = best.label + ' is winning ' + best.won + ' of ' + best.decided + '; ' +
        worst.label + ', ' + worst.won + ' of ' + worst.decided +
        '. That gap sits in one trade rather than across your prices.';
    }
  }

  return centre + ' ' + edge;
}

/**
 * How many costed wins one tool needs before that trade may be named.
 *
 * Two. `MIN_WIN_RATE_PER_TOOL` is four because a win rate on three bids can
 * only be 0, 33, 67 or 100 and the reading would be quoting the step size; a
 * kept share has no step size at all — two finished jobs pooled is an exact
 * statement about the money on two real invoices. What two cannot promise is
 * that the trade always goes this way, which is why the sentence prints the
 * job count beside every share it quotes and why the gap below has to be wide
 * before any of it is drawn.
 */
export const MIN_KEEP_PER_TOOL = 2;

/**
 * How many tools must clear that bar before there is a comparison to draw.
 *
 * Two, and this one is structural rather than statistical. At one tool this
 * reading would be `marginSentence` with the money taken out — a worse version
 * of a sentence already on that tool's own page — so below two it draws
 * nothing and lets the better one speak.
 */
export const MIN_KEEP_TOOLS = 2;

/**
 * How far apart two trades' kept shares must be before the split is drawn.
 *
 * Fifteen points, where `MARGIN_SPREAD_POINTS` wants twenty. That is not
 * inconsistency: twenty is the spread between two individual *jobs* on one
 * tool, where a single unusual week — a machine hire, a subcontractor who came
 * in high — moves one end of it on its own. These ends are pooled over a
 * trade, so the noise that moves a single job has already been averaged out of
 * them, and fifteen points between two trades is a difference in what the work
 * is worth rather than in how one job went.
 */
export const KEEP_SPREAD_POINTS = 15;

/**
 * Which of this contractor's trades are actually worth doing.
 *
 * The hub's counterpart to `marginSentence`, and the last of the four
 * questions this panel can answer. `winRateSentence` says how often the yes
 * comes, `pricingSentence` says how far over the losing quotes were, and
 * `marginSentence` says what the finished work kept — but only on one tool at
 * a time, because it speaks in money and money is a currency and a trade at
 * once. A crew that fences, decks and cleans gutters reads three separate
 * margins on three separate pages and is never told the one thing that decides
 * what they should go and sell: **these are not the same number.**
 *
 * That comparison is the whole reading, so it is the whole sentence. There is
 * no pooled total here, deliberately. A book-wide "you kept 12%" would need
 * one currency across every tool, and — worse — it would be the average that
 * hides the finding: a shop keeping 30% on gutters and losing money on decks
 * has a decks problem, and the mean of the two is a number describing no work
 * they do. `marginSentence` pools within a trade for the honest reason that a
 * trade is one kind of job; pooling *across* trades throws away the only thing
 * this sentence knows.
 *
 * Percentages only, and therefore safe across currencies, on the same argument
 * `pricingSentence` makes: "this job kept 22% of what I charged" is a fact
 * inside one bid's own currency, so a book of dollar jobs and euro jobs
 * compares without a conversion this site does not have and must never
 * acquire. Within a tool the share is pooled in money — total kept over total
 * charged, the honest form `marginSentence` argues for — so a tool whose
 * costed wins are in two currencies is dropped rather than summed.
 *
 * Two sentences, the second the honest half as everywhere else here:
 *
 *   - **The two ends, with their counts.** Highest-keeping trade and
 *     lowest-keeping trade, named, because the whole point is that they differ
 *     and a contractor cannot act on a spread whose ends are anonymous.
 *   - **What that gap means, or what it does not.** A trade finishing below
 *     its own cost is said plainly and first, since it is the one finding here
 *     that makes winning more work actively worse. A wide gap is aimed at the
 *     trade rather than at the price list. And where the trades agree, the
 *     honest half is this reading's own blind spot: it can only see the jobs
 *     whose costs were typed in, so a trade with none is missing from the
 *     comparison rather than sitting in the middle of it.
 *
 * Never a share to aim for, in any branch. There is no correct margin — it
 * moves with the trade, the overhead and what a shop counts as a cost — and
 * this sentence exists to say which of *their* trades keeps more of *their*
 * money, not to grade either against a number invented here.
 *
 * Returns `''` — draw nothing — until `MIN_KEEP_TOOLS` tools each carry
 * `MIN_KEEP_PER_TOOL` won bids with a cost, a readable figure above zero, and
 * one currency between them.
 */
export function keepSentence(bids) {
  if (!bids || !bids.length) return '';

  var slugs = [];
  var byTool = {};

  for (var i = 0; i < bids.length; i++) {
    var bid = bids[i];
    if (!bid || typeof bid !== 'object') continue;
    if (bid.outcome !== 'won') continue;
    var cost = normalizeJobCost(bid.cost);
    if (!cost) continue;
    var parsed = bidAmountValue(bid.amount);
    if (!parsed) continue;
    // The same guard `marginSentence` uses: some tools here answer in a saving
    // or a difference rather than a quote, and a share of one of those is a
    // percentage of nothing.
    if (!(parsed.value > 0)) continue;
    var slug = typeof bid.slug === 'string' ? bid.slug : '';
    if (!slug) continue;

    if (!byTool[slug]) {
      slugs.push(slug);
      byTool[slug] = { slug: slug, label: slug, currency: parsed.currency, jobs: 0,
        charged: 0, spent: 0, mixed: false };
      var label = typeof bid.label === 'string' ? bid.label.trim() : '';
      if (label) byTool[slug].label = label;
    }
    var tool = byTool[slug];
    // Two currencies inside one trade cannot be added, and converting them is
    // the thing this feature must never start doing. The tool is marked and
    // dropped below rather than partly counted, because a share computed from
    // whichever currency happened to come first is a wrong number wearing a
    // right one's clothes.
    if (parsed.currency !== tool.currency) tool.mixed = true;
    tool.jobs++;
    tool.charged += parsed.value;
    tool.spent += Number(cost);
  }

  // Sorted by share, then by slug, so two trades that have gone the same way
  // cannot swap places between two renders of the same book.
  var ranked = [];
  for (var s = 0; s < slugs.length; s++) {
    var candidate = byTool[slugs[s]];
    if (candidate.mixed) continue;
    if (candidate.jobs < MIN_KEEP_PER_TOOL) continue;
    if (!(candidate.charged > 0)) continue;
    candidate.share = ((candidate.charged - candidate.spent) / candidate.charged) * 100;
    ranked.push(candidate);
  }
  if (ranked.length < MIN_KEEP_TOOLS) return '';
  ranked.sort(function (a, b) {
    return b.share - a.share || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  });

  var best = ranked[0];
  var worst = ranked[ranked.length - 1];
  var counted = 0;
  for (var r = 0; r < ranked.length; r++) counted += ranked[r].jobs;

  var centre = 'Of the ' + counted + ' finished jobs you have costed, across ' + ranked.length +
    ' tools, ' + best.label + ' kept the most: ' + Math.round(best.share) + '% of what you ' +
    'charged on ' + best.jobs + '; ' + worst.label + ' kept ' + Math.round(worst.share) +
    '% on ' + worst.jobs + '.';

  var edge;
  if (worst.share < 0) {
    edge = 'That is below what those jobs cost you to deliver, so winning more of that work ' +
      'is what makes the year worse — it is the one trade to re-cost before you quote it again.';
  } else if (best.share - worst.share >= KEEP_SPREAD_POINTS) {
    edge = 'That gap is in which work you take rather than across your prices, so a rise on ' +
      'every quote you write would land on the wrong end of it.';
  } else {
    edge = 'Your trades are keeping much the same share, so this moves with your costs and ' +
      'your prices rather than with which work you chase. It can only see the jobs you costed ' +
      '— a trade you have not costed is missing here, not average.';
  }

  return centre + ' ' + edge;
}

/**
 * How many tools must carry both readings before the two can be crossed.
 *
 * Two, and structural rather than statistical for the reason `MIN_KEEP_TOOLS`
 * is: at one tool there is nothing to cross. The sample bars that matter are
 * the ones the two halves already set — `MIN_WIN_RATE_PER_TOOL` decided bids
 * for a rate, `MIN_KEEP_PER_TOOL` costed wins for a kept share — and a tool
 * has to clear *both* to appear here at all, which is a much higher bar than
 * either reading applies on its own.
 */
export const MIN_MIX_TOOLS = 2;

/**
 * Whether the work this contractor wins is the work that pays.
 *
 * The one question the panel could already answer twice and had never asked
 * once. `winRateSentence` names the trade that lands most often;
 * `keepSentence` names the trade that keeps most of what it charges. Both are
 * true and neither is a decision, because the decision is what happens when
 * you put them side by side:
 *
 *     Fence   wins 4 of 5    keeps  5%
 *     Decks   wins 1 of 5    keeps 28%
 *
 * A contractor reading those two lines one under the other reads two
 * compliments and one complaint — fences are landing, decks are not — and the
 * action they suggest separately is the wrong one in both cases: chase more
 * fence work, cut the deck price. Crossed, they say the opposite and say it
 * plainly. The fences land because they are cheap, and every extra one is
 * another job that keeps a twentieth of its price; the decks are the work
 * worth having and the quotes are being lost.
 *
 * This is the shape underpricing takes from the inside, and it is invisible
 * from any single tool page by construction: a tool knows its own win rate and
 * its own kept share, and the finding is that those two disagree *between*
 * trades. It is the reason the hub carries a bid panel at all.
 *
 * Two branches, and both are findings:
 *
 *   - **They point apart.** The trade that lands most keeps least. Named with
 *     both figures for each, because a contractor cannot act on "your mix is
 *     wrong" and can act on "fences at 5%, decks at 28%".
 *   - **They point the same way.** The trade that lands most also keeps most —
 *     the one combination where selling more of the same work is the right
 *     move, and worth saying out loud precisely because every other reading
 *     here is a warning.
 *
 * Where the two rankings neither oppose nor agree by a clear margin, this
 * draws nothing. That is not a missing branch: the whole reading *is* the
 * comparison, so a sentence saying the comparison was inconclusive would be a
 * line on the one page every visitor loads that changes nothing anyone does.
 *
 * Thresholds are borrowed rather than invented — `WIN_RATE_SPLIT_POINTS` for
 * the rate gap, `KEEP_SPREAD_POINTS` for the kept-share gap — because the
 * noise each is protecting against is the same noise as in the reading it came
 * from. Requiring both at once makes this strictly rarer than either neighbour,
 * which is the right price for a sentence that tells someone to raise a price.
 *
 * Percentages and counts only, so it is safe across currencies on the argument
 * `keepSentence` makes: a share of a bid's own price is a fact inside that
 * bid's currency, and a count of outcomes has no unit at all. A tool whose
 * costed wins are in two currencies is dropped rather than summed.
 *
 * Never a target — not a win rate, not a margin, not a mix. It says which of
 * *their* trades is behaving which way, and never what the answer should be.
 *
 * Returns `''` — draw nothing — until `MIN_MIX_TOOLS` tools each carry both
 * readings and one of the two branches clears its gap.
 */
export function mixSentence(bids) {
  if (!bids || !bids.length) return '';

  var slugs = [];
  var byTool = {};

  for (var i = 0; i < bids.length; i++) {
    var bid = bids[i];
    if (!bid || typeof bid !== 'object') continue;
    if (bid.outcome !== 'won' && bid.outcome !== 'lost') continue;
    var slug = typeof bid.slug === 'string' ? bid.slug : '';
    if (!slug) continue;

    if (!byTool[slug]) {
      slugs.push(slug);
      byTool[slug] = { slug: slug, label: slug, decided: 0, won: 0, jobs: 0,
        charged: 0, spent: 0, currency: '', mixed: false };
      var label = typeof bid.label === 'string' ? bid.label.trim() : '';
      if (label) byTool[slug].label = label;
    }
    var tool = byTool[slug];
    tool.decided++;
    if (bid.outcome !== 'won') continue;
    tool.won++;

    // The kept share is counted off the won rows only, and only the ones
    // carrying both a cost and a readable price — the same evidence
    // `keepSentence` needs, read through the same two guards so that a figure
    // one reading would refuse cannot reach the other.
    var cost = normalizeJobCost(bid.cost);
    if (!cost) continue;
    var parsed = bidAmountValue(bid.amount);
    if (!parsed) continue;
    if (!(parsed.value > 0)) continue;
    // `bidAmountValue` only ever returns one of three symbols, so the empty
    // string is a safe "nothing costed here yet" sentinel.
    if (!tool.currency) tool.currency = parsed.currency;
    else if (parsed.currency !== tool.currency) tool.mixed = true;
    tool.jobs++;
    tool.charged += parsed.value;
    tool.spent += Number(cost);
  }

  var ranked = [];
  for (var s = 0; s < slugs.length; s++) {
    var candidate = byTool[slugs[s]];
    if (candidate.mixed) continue;
    if (candidate.decided < MIN_WIN_RATE_PER_TOOL) continue;
    if (candidate.jobs < MIN_KEEP_PER_TOOL) continue;
    if (!(candidate.charged > 0)) continue;
    candidate.rate = (candidate.won / candidate.decided) * 100;
    candidate.share = ((candidate.charged - candidate.spent) / candidate.charged) * 100;
    ranked.push(candidate);
  }
  if (ranked.length < MIN_MIX_TOOLS) return '';

  // Two orderings of the same list, each broken by slug so that two trades
  // which have gone the same way cannot swap places between two renders of one
  // book — the rule every ranked reading in this file follows.
  var byKeep = ranked.slice().sort(function (a, b) {
    return b.share - a.share || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  });
  var byRate = ranked.slice().sort(function (a, b) {
    return b.rate - a.rate || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  });

  var payer = byKeep[0];
  var leanest = byKeep[byKeep.length - 1];
  var lander = byRate[0];
  var rarest = byRate[byRate.length - 1];

  function landing(tool) {
    return tool.won + ' of ' + tool.decided;
  }
  function keeping(tool) {
    return Math.round(tool.share) + '% on ' + tool.jobs;
  }

  // The leading trade is written out in full — "keeps 5% of what it charged on
  // the 2 you costed" — and every trade after it in the short form, because
  // the units only need saying once and the sentence is already long.
  function leading(tool) {
    return tool.label + ' lands ' + landing(tool) + ' quotes and keeps ' +
      Math.round(tool.share) + '% of what it charged on the ' + tool.jobs + ' you costed';
  }

  if (payer.slug !== lander.slug) {
    if (lander.rate - payer.rate < WIN_RATE_SPLIT_POINTS) return '';
    if (payer.share - lander.share < KEEP_SPREAD_POINTS) return '';
    return 'The work you win is not the work that pays: ' + leading(lander) + '; ' +
      payer.label + ' lands ' + landing(payer) + ' and keeps ' + keeping(payer) + '. ' +
      'That is what underpricing looks like from the inside: the trade you land most is ' +
      'worth a price rise before it is worth more of your time, and the one that keeps most ' +
      'is worth chasing at a number you would have turned down. It can see that a trade ' +
      'keeps less, never why — so re-cost it before you re-price it.';
  }

  if (lander.rate - rarest.rate < WIN_RATE_SPLIT_POINTS) return '';
  if (payer.share - leanest.share < KEEP_SPREAD_POINTS) return '';
  // The other end is usually one trade wearing both labels — with two tools it
  // always is — so it is named once when it is one and twice when it is two.
  var other = leanest.slug === rarest.slug
    ? leanest.label + ' lands ' + landing(leanest) + ' and keeps ' + keeping(leanest)
    : rarest.label + ' lands ' + landing(rarest) + ' and ' + leanest.label + ' keeps ' +
      keeping(leanest);
  return 'The work you win is also the work that pays: ' + leading(lander) + ', where ' +
    other + '. ' +
    'That is the one pairing here worth answering with more selling rather than a price ' +
    'change, because the quotes already land and the finished jobs already keep. It says ' +
    'nothing about how much of that work there is to be sold.';
}

/**
 * How many decided bids one tool needs on each side of the split.
 *
 * Four, the same floor `MIN_WIN_RATE_PER_TOOL` sets and for the same reason: at
 * four the achievable rates are quarters, so the smallest gap this can report
 * is two bids wide rather than one. It is a floor per half rather than per
 * tool, so a trade needs eight decided bids before it can be read at all —
 * which is the price of asking a question about change rather than about state.
 */
export const MIN_TREND_PER_HALF = 4;

/**
 * How far the landing rate must move between the halves before it is a finding.
 *
 * Forty points, matching `WIN_RATE_SPLIT_POINTS`, because at the four-bid floor
 * both readings face the same step size: quarters, where forty admits a gap of
 * two bids and refuses a gap of one. One bid of difference is what a single
 * unusual job looks like — the customer's brother-in-law underbidding once —
 * and a reading that called that a change in how the work is landing would send
 * a contractor to re-cost a trade that never moved.
 */
export const TREND_SPLIT_POINTS = 40;

/**
 * Whether what this contractor changed is working: the split both readings use.
 *
 * Every other reading here is a snapshot: a rate, a share, a band, pooled
 * over the whole book. That is the right shape for "how am I doing" and the
 * wrong shape for the question that follows it. A book is accumulated over
 * months. A shop that raised its rates in June, or re-costed decks *because*
 * `winRateSentence` told them to in May, reads a pooled rate that averages
 * before and after — so the change they made is not merely invisible, it is
 * diluted by exactly the half of the book it was meant to fix. The louder the
 * change, the more the snapshot hides it.
 *
 * This is the reading that closes that loop, and it is the only one here that
 * asks when a bid was priced rather than only what became of it.
 *
 *   "Deck Bid Calculator has been landing less often than it was: 1 of 5 on the
 *    5 most recent, against 4 of 5 before them."
 *
 * The choices that make it honest:
 *
 *   - **Inside one tool, never pooled.** A movement summed across trades mixes
 *     a fence change with a deck change and describes neither. The whole point
 *     is to name the trade that moved, so the trade is the unit.
 *   - **Ordered by `at` — when the bid was priced — not by `decidedAt`.** The
 *     thing under examination is the price, and the price was set when the bid
 *     was made; an old quote answered late would otherwise land in the recent
 *     half and be counted against a number this shop no longer charges. `at` is
 *     also the field `normalizeBid` requires, where `decidedAt` is absent on
 *     every bid decided before that field existed, so ordering by it would drop
 *     rows silently.
 *   - **Halves by count, not by calendar.** "The last 90 days" gives an empty
 *     half to a shop that quotes four jobs a month, and two halves of wildly
 *     different size to everyone else — and a difference between 1 of 3 and 5
 *     of 9 is partly just the denominators. Equal halves make the two counts
 *     readable straight across, which is the sentence's whole grammar. On an
 *     odd count the middle bid belongs to neither side rather than being lent
 *     to one of them.
 *   - **The turn is dated in days back**, off the oldest bid in the recent
 *     half. That is a fact about the sample rather than a claim about when
 *     anything changed, and it is what gives the contractor a period to think
 *     about instead of an instruction.
 *   - **Never a target, and never a cause.** The second sentence says plainly
 *     that a slow season or a run of unusual jobs moves this as much as a price
 *     does. A tool that printed the cause would be inventing the finding rather
 *     than reporting it.
 *
 * This function is the arithmetic alone, over one tool's bids, so the two
 * sentences built on it cannot disagree about what moved: `trendSentence` on
 * the hub, which groups the book by tool and names the trade, and
 * `toolTrendSentence` in the panel on that tool's own page, which does not need
 * to. Returns `null` below `MIN_TREND_PER_HALF` a side or under
 * `TREND_SPLIT_POINTS` of movement — the ordinary case for a book where nothing
 * changed, and the right answer for it.
 */
export function trendSplit(bids) {
  if (!bids || !bids.length) return null;

  var decided = [];
  for (var i = 0; i < bids.length; i++) {
    var bid = bids[i];
    if (!bid || typeof bid !== 'object') continue;
    if (bid.outcome !== 'won' && bid.outcome !== 'lost') continue;
    var at = typeof bid.at === 'string' ? bid.at : '';
    if (!at) continue;
    // A bid whose date will not parse cannot be placed on either side of the
    // split, and placing it anyway would put it wherever the store happened to
    // hold it. Dropped from this reading only; every other line still counts it.
    var t = Date.parse(at);
    if (t !== t) continue;
    decided.push({ t: t, at: at, won: bid.outcome === 'won',
      name: typeof bid.name === 'string' ? bid.name : '' });
  }

  var half = Math.floor(decided.length / 2);
  if (half < MIN_TREND_PER_HALF) return null;

  // Oldest first, with the bid's own name breaking ties so two bids saved in
  // the same second cannot swap sides of the split between two renders of the
  // same book.
  decided.sort(function (a, b) {
    return a.t - b.t || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  });

  var earlier = decided.slice(0, half);
  var later = decided.slice(decided.length - half);

  var earlierWon = 0;
  var laterWon = 0;
  for (var e = 0; e < half; e++) {
    if (earlier[e].won) earlierWon++;
    if (later[e].won) laterWon++;
  }

  // Exact, because the denominators are equal by construction: the point
  // difference is the bid difference over the half size.
  var move = ((laterWon - earlierWon) / half) * 100;
  if (Math.abs(move) < TREND_SPLIT_POINTS) return null;

  return { half: half, earlierWon: earlierWon, laterWon: laterWon, move: move,
    turnedAt: later[0].at };
}

/**
 * Everything the two trend readings say after their subject.
 *
 * The counts, the date of the turn, and the honest half — identical whether the
 * sentence is naming a trade on the hub or speaking about the page it is on, so
 * it is written once. Only the subject differs, which is the one part each
 * caller knows and the other cannot.
 */
export function trendDetail(split, nowMs) {
  var counts = split.laterWon + ' of ' + split.half + ' on the ' + split.half +
    ' most recent, against ' + split.earlierWon + ' of ' + split.half + ' before them.';

  var since = bidWaitingDays(split.turnedAt, nowMs);
  var when = since === null || !(since > 0)
    ? ''
    : ' The recent half starts ' + since + (since === 1 ? ' day' : ' days') + ' back.';

  var edge = ' Both halves hold the same number of bids, so the counts read straight across — ' +
    'but they are two halves of one trade\u2019s own book, and a slow season or a run of ' +
    'unusual jobs moves this as much as a price does. It says where to look, not what changed.';

  return counts + when + edge;
}

/**
 * The direction, as the two sentences say it.
 *
 * A movement of exactly zero never reaches here — `trendSplit` refuses
 * anything under `TREND_SPLIT_POINTS` — so there is no third word to pick.
 */
export function trendDirection(move) {
  return move < 0 ? 'less' : 'more';
}

/**
 * The hub's version: which of this contractor's trades has moved.
 *
 * Groups the whole book by tool, reads each one through `trendSplit`, and names
 * the trade that moved furthest. This is the half no single tool page can
 * produce — a crew working six calculators is told which one to go and look at.
 *
 * Returns `''` when no tool has eight decided bids or none has moved far
 * enough — the ordinary case for a book where nothing changed, and the right
 * answer for it.
 */
export function trendSentence(rows, nowMs) {
  if (!rows || !rows.length) return '';

  var byTool = {};
  var slugs = [];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row || typeof row !== 'object') continue;
    var slug = typeof row.slug === 'string' ? row.slug : '';
    if (!slug) continue;
    if (!byTool[slug]) {
      byTool[slug] = { slug: slug, label: slug, bids: [] };
      var label = typeof row.label === 'string' ? row.label.trim() : '';
      if (label) byTool[slug].label = label;
      slugs.push(slug);
    }
    byTool[slug].bids.push(row);
  }

  var best = null;

  for (var s = 0; s < slugs.length; s++) {
    var tool = byTool[slugs[s]];
    var split = trendSplit(tool.bids);
    if (!split) continue;
    // The furthest movement, with the slug breaking ties: only one trade is
    // named, for the reason every reading here names one — a table of small
    // movements is a thing to read, and this is a thing to go and act on.
    if (!best ||
      Math.abs(split.move) > Math.abs(best.split.move) ||
      (Math.abs(split.move) === Math.abs(best.split.move) && tool.slug < best.slug)) {
      best = { slug: tool.slug, label: tool.label, split: split };
    }
  }

  if (!best) return '';

  return best.label + ' has been landing ' + trendDirection(best.split.move) +
    ' often than it was: ' + trendDetail(best.split, nowMs);
}

/**
 * The tool page's version, drawn in the saved-bid panel of the tool itself.
 *
 * The same finding as `trendSentence`, moved to where it is worth the most. The
 * hub is a page a contractor visits when a customer rings back; the tool page
 * is the page they are on **while deciding what to charge for the next one**,
 * which is the only moment this reading can still change an outcome. It costs
 * nothing extra to put it there — the panel already holds this tool's whole
 * book, and the script is one shared file rather than a copy per page.
 *
 * No trade is named, because there is only one: these bids are the page's own,
 * and a sentence saying "Fence Bid Calculator" on the fence calculator would be
 * telling the reader where they are standing.
 *
 * Returns `''` below eight decided bids on this tool, or when they have not
 * moved far enough — which on most tools is most of the time.
 */
export function toolTrendSentence(bids, nowMs) {
  var split = trendSplit(bids);
  if (!split) return '';
  return 'The bids you saved here have been landing ' + trendDirection(split.move) +
    ' often than they were: ' + trendDetail(split, nowMs);
}

/**
 * Drop the indentation and the whole-line comments from a function's source.
 *
 * These bodies ship inside every one of the ~230 pages the build produces, and
 * the service worker caches all of them for jobsite use — so a kilobyte here is
 * a quarter of a megabyte in the offline bundle, which has a fixed budget
 * (`the offline bundle stays small enough to fetch on mobile data`).
 *
 * Only two things are removed, both mechanically: leading whitespace, and lines
 * whose first non-space characters are `//`. Lines are still joined with
 * newlines, so no statement can run into the one below it, and nothing inside a
 * string literal is touched. That keeps the guarantee this whole arrangement
 * exists for — the browser runs the tested code, not a paraphrase of it —
 * while not paying to ship the prose twice.
 */
export function stripForInjection(source) {
  return String(source)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('//'))
    .join('\n');
}

/**
 * The three above, as source, for embedding in an injected script.
 *
 * `Function.prototype.toString` returns the exact characters of the definition,
 * so the browser gets the tested body rather than a hand-copied paraphrase of
 * it. Assigned to `var` bindings in declaration order; `followUpSentence` calls
 * `bidWaitingDays`, and both are hoisted into the same scope before either runs.
 */
export const BID_FOLLOW_UP_HELPERS = [
  `var MIN_RESPONSE_SAMPLE = ${MIN_RESPONSE_SAMPLE};`,
  ...[bidWaitingDays, bidWaitingPhrase, followUpSentence, bidResponseDays, responseWindow,
    isQuietBid, chaseSentence]
    .map((fn) => `var ${fn.name} = ${stripForInjection(fn.toString())};`),
].join('\n');

/**
 * The row-group rules, as source, for the injected restore and link paths.
 *
 * Same reason as the block above: the browser runs the definitions the tests
 * run. It matters more here than anywhere else in this file, because the thing
 * being computed is *which control to click how many times* — a paraphrase that
 * drifted by one would add a row nobody asked for and then refuse the restore
 * it was added for, and the visitor would see only the refusal.
 */
export const BID_REPEAT_HELPERS = [
  `var REPEAT_ATTR = ${JSON.stringify(REPEAT_ATTR)};`,
  `var MAX_REPEAT_ROWS = ${MAX_REPEAT_ROWS};`,
  ...[splitRepeatId, normalizeRepeatIds, rowsToGrow]
    .map((fn) => `var ${fn.name} = ${stripForInjection(fn.toString())};`),
].join('\n');

/**
 * `normalizeBid` and its whole closure, as source, for embedding in an injected
 * script.
 *
 * This exists because the hub's backup panel had transcribed it by hand and the
 * copy went stale. `backup.mjs` shipped a `normalizedBid` that returned
 * `{ name, at, fields }` — the shape a bid had before outcomes existed — so the
 * browser silently dropped `outcome` and `decidedAt` on the way into a backup
 * file, on the way out of one, and off the bids already on the device, because
 * a restore re-reads the local store through the same function. Marking "14 Oak
 * St" won and then restoring any backup put it back in the chase list. Nothing
 * failed; the module was correct and tested throughout; only the copy the
 * browser actually ran was wrong.
 *
 * So the rule this file already applies to the follow-up helpers now applies to
 * the record shape too: an injected script gets the tested definition through
 * `Function.prototype.toString`, never a paraphrase. Anything added to a bid
 * from here on is carried by every consumer without a second edit.
 *
 * The constants come first because the functions close over them, and they are
 * emitted as literals rather than as source: `EXCLUDED_FIELD_IDS` is a `Set`,
 * whose `toString` is not its contents.
 */
export const BID_RECORD_HELPERS = [
  `var EXCLUDED_FIELD_IDS = new Set(${JSON.stringify([...EXCLUDED_FIELD_IDS])});`,
  `var EXCLUDED_ID_PREFIX = ${JSON.stringify(EXCLUDED_ID_PREFIX)};`,
  `var BID_OUTCOMES = ${JSON.stringify(BID_OUTCOMES)};`,
  `var MAX_LOST_TO = ${MAX_LOST_TO};`,
  // `normalizeJobCost` rides here because `normalizeBid` now calls it. What
  // matters is that it is in the list at all — these are function expressions
  // whose names resolve when they are called rather than when they are
  // assigned, so the order below is for reading, not for the interpreter. The
  // test that runs this bundle is what proves nothing is missing from it.
  ...[normalizeBidName, normalizeOutcome, normalizeLostTo, normalizeJobCost,
    normalizeHeadlineAmount, isExcludedId, normalizeBid].map(
    (fn) => `var ${fn.name} = ${stripForInjection(fn.toString())};`,
  ),
].join('\n');

/**
 * `normalizeHeadlineAmount` alone, for the band.
 *
 * The band builds its record by hand rather than through `normalizeBid` — it is
 * writing a bid, not validating one someone else wrote — so it needs this one
 * function and none of the rest. Embedded for the reason the whole file now
 * embeds rather than transcribes: the page that decides whether a hero reads as
 * a figure and the tests that decide it must not be able to disagree.
 */
export const BID_AMOUNT_HELPER =
  `var normalizeHeadlineAmount = ${stripForInjection(normalizeHeadlineAmount.toString())};`;

/**
 * The price band's three functions, as source.
 *
 * Emitted after `BID_AMOUNT_HELPER` and not usable without it: `bidAmountValue`
 * reads its input through `normalizeHeadlineAmount`, which is the point — the
 * comparison can only ever see figures the save path would itself have stored,
 * so a value written by some future version of this store cannot walk into an
 * average.
 *
 * Injected only into pages that capture a headline figure. A tool with no hero
 * number saves no amounts, so this code could never produce a sentence there,
 * and it ships on ~230 pages that the service worker caches whole.
 */
export const BID_PRICE_BAND_HELPERS = [
  `var MIN_PRICE_BAND_SIDE = ${MIN_PRICE_BAND_SIDE};`,
  `var MIN_UNDERCUT_SAMPLE = ${MIN_UNDERCUT_SAMPLE};`,
  `var MAX_LOST_TO = ${MAX_LOST_TO};`,
  `var MIN_MARGIN_SAMPLE = ${MIN_MARGIN_SAMPLE};`,
  `var MARGIN_SPREAD_POINTS = ${MARGIN_SPREAD_POINTS};`,
  `var MIN_REVISION_PERCENT = ${MIN_REVISION_PERCENT};`,
  // `normalizeLostTo` is emitted here as well as in `BID_RECORD_HELPERS`, and
  // that is not a duplicate: no script includes both lists, the record helpers
  // exist for the backup panel, and the page script builds its records by hand
  // and needs this one function to read what the visitor typed into the box.
  //
  // `normalizeJobCost` is the alias over it that the won-row cost box and
  // `marginSentence` both read through, so it has to be in the same list.
  // `costGapSentence` rides here because it is the reading about the missing
  // half of `marginSentence`'s input, so it can only ever draw on the pages
  // that carry `marginSentence` — the ones with a hero figure, which is this
  // bundle's own gate. It needs nothing the list did not already bring.
  //
  // `revisionSentence` rides here for that same gate rather than for any
  // kinship with the readings around it: it is about one bid against the form
  // rather than about a book of them, but it reads a hero figure through
  // `bidAmountValue` and writes a difference through `formatBidAmount`, so it
  // can only ever draw where those two already ship.
  ...[normalizeLostTo, normalizeJobCost, bidAmountValue, bidPriceSide, formatBidAmount,
    revisionSentence, priceBandSentence, undercutSentence, marginSentence, costGapSentence].map(
    (fn) => `var ${fn.name} = ${stripForInjection(fn.toString())};`,
  ),
].join('\n');

/**
 * The trend reading's arithmetic and the tool page's sentence, as source.
 *
 * Emitted into the one shared band script every tool page loads. It needs no
 * figure and no currency — only that a bid was decided and dated — so unlike
 * the price band above it is not conditional on the page having a hero number:
 * a tool that saves no amounts can still tell its user their quotes have
 * stopped landing.
 *
 * `trendDetail` calls `bidWaitingDays`, which arrives with
 * `BID_FOLLOW_UP_HELPERS` — emitted above this in the same script, and the
 * reason neither list may be injected on its own.
 */
export const BID_TREND_HELPERS = [
  `var MIN_TREND_PER_HALF = ${MIN_TREND_PER_HALF};`,
  `var TREND_SPLIT_POINTS = ${TREND_SPLIT_POINTS};`,
  ...[trendSplit, trendDetail, trendDirection, toolTrendSentence].map(
    (fn) => `var ${fn.name} = ${stripForInjection(fn.toString())};`,
  ),
].join('\n');

/**
 * `pricingSentence` and the two readers it needs, as source, for the hub.
 *
 * Emitted after `BID_AMOUNT_HELPER` and not usable without it: `bidAmountValue`
 * calls `normalizeHeadlineAmount`, which the hub already has for its bid list.
 *
 * Deliberately not `BID_PRICE_BAND_HELPERS`: that list carries `bidPriceSide`,
 * `formatBidAmount`, `priceBandSentence` and `undercutSentence`, none of which
 * the hub calls, and all of which are money. This reading is percentages only,
 * so shipping the money half to the hub would be a kilobyte on the one page
 * every visitor loads in exchange for nothing.
 *
 * `winRateSentence` rides here rather than in a list of its own because it is
 * the same kind of thing — a unit-free reading of the whole book, drawn on the
 * hub and nowhere else — but it needs none of the readers above it: it counts
 * outcomes and never looks at a figure, so it would work on its own if the
 * order ever changed.
 *
 * `keepSentence` rides here for the first of those reasons and not the second:
 * it does need `bidAmountValue` above it, and `normalizeJobCost` — the alias
 * over `normalizeLostTo` that the tool pages already ship — so that the cost it
 * divides by is read through the same guard that stored it. It stays
 * percentages-only like its neighbours, which is what keeps `formatBidAmount`
 * and the rest of the money half off the one page every visitor loads.
 */
export const BID_PRICING_HELPERS = [
  `var MIN_CROSS_TOOL_SAMPLE = ${MIN_CROSS_TOOL_SAMPLE};`,
  `var MAX_LOST_TO = ${MAX_LOST_TO};`,
  `var MIN_WIN_RATE_SAMPLE = ${MIN_WIN_RATE_SAMPLE};`,
  `var MIN_WIN_RATE_PER_TOOL = ${MIN_WIN_RATE_PER_TOOL};`,
  `var WIN_RATE_SPLIT_POINTS = ${WIN_RATE_SPLIT_POINTS};`,
  `var MIN_KEEP_PER_TOOL = ${MIN_KEEP_PER_TOOL};`,
  `var MIN_KEEP_TOOLS = ${MIN_KEEP_TOOLS};`,
  `var KEEP_SPREAD_POINTS = ${KEEP_SPREAD_POINTS};`,
  `var MIN_MIX_TOOLS = ${MIN_MIX_TOOLS};`,
  `var MIN_TREND_PER_HALF = ${MIN_TREND_PER_HALF};`,
  `var TREND_SPLIT_POINTS = ${TREND_SPLIT_POINTS};`,
  // `trendDetail` calls `bidWaitingDays`, which is not in this bundle: it
  // arrives with `BID_FOLLOW_UP_HELPERS`, which the hub emits above this one.
  // Nothing here may be injected on its own.
  //
  // The three trend helpers below are also in `BID_TREND_HELPERS`, and that is
  // not a duplicate for the same reason `normalizeLostTo` is in two lists: no
  // script includes both, and each bundle then carries the one sentence its own
  // page draws — the hub names the trade that moved, the tool page cannot need
  // to — rather than paying for the other's.
  // `mixSentence` needs nothing the three readings before it did not already
  // bring — `bidAmountValue`, `normalizeJobCost`, and the four bars borrowed
  // from `winRateSentence` and `keepSentence` — which is the point of it
  // riding in this bundle rather than a new one: it is the two of them
  // crossed, and crossing them costs the hub no byte it was not already
  // paying.
  ...[normalizeLostTo, normalizeJobCost, bidAmountValue, pricingSentence, winRateSentence,
    keepSentence, mixSentence, trendSplit, trendDetail, trendDirection, trendSentence].map(
    (fn) => `var ${fn.name} = ${stripForInjection(fn.toString())};`,
  ),
].join('\n');

/**
 * Say so in the structured data.
 *
 * `featureList` is the machine-readable list of what a tool does — what a
 * search engine and an answer engine read when someone asks for something that
 * keeps a contractor's quotes. #1894 is the precedent and the warning: the
 * customer proposal shipped on 100 calculators and named itself in none of
 * them, so the portfolio's largest feature was invisible to the only channel
 * that brings these tools traffic. This one ships on more pages than that and
 * would have repeated it.
 *
 * One phrase, appended to the list already there.
 */
export const SAVED_BIDS_CLAUSE =
  'saved bids you can name, reopen and reprice, each keeping the figure the tool gave you, and mark won or lost to see which quotes are still waiting on an answer and how long the ones you heard back on took, so a quote that has gone quiet stands out';

/**
 * The second clause, for the pages that can actually draw the price band.
 *
 * Kept separate from `SAVED_BIDS_CLAUSE` rather than folded into it, and that
 * split is the same guard the function below already enforced in one direction:
 * a page with no headline figure stores no amounts, so it can never show this
 * comparison, and appending the phrase there would advertise a feature the page
 * does not have. 160 of the 234 pages with a form carry a hero number; only
 * those get the sentence.
 */
export const PRICE_BAND_CLAUSE =
  'and, once a few are decided, what your won bids on this tool have averaged against the ones you ' +
  'lost, including how far over the winning price you were on the lost jobs whose final price you know, ' +
  'and — for the won jobs you enter a delivered cost against — what those jobs actually kept once ' +
  'they were done, so a job worked at a loss is visible rather than averaged away; restoring a saved ' +
  'bid also pins the figure it was quoted at, so any change you then make is priced against the ' +
  'number the customer already has, in money and in percent';

/**
 * Both spellings, because the repo uses both — a strict match on
 * `"featureList":"` reported 37 calculators as having no feature list at all
 * (#1894). The value is matched with `(?:[^"\\]|\\.)*` so an escaped quote
 * inside the list does not end it early.
 */
const FEATURE_LIST_RE = /("featureList"\s*:\s*")((?:[^"\\]|\\.)*)(")/;

/**
 * Append the clause to a page's feature list.
 *
 * Returns the html unchanged when the page carries no `featureList` — 30 of the
 * venture entry pages do not, and inventing a JSON-LD node for them is not this
 * function's business — and when the clause is already there, so the pass is
 * safe to run twice.
 *
 * Called only from `injectSavedBids`, and only once the band is known to be
 * going in. That coupling is the point: the claim and the feature ship in the
 * same statement, so a page can never advertise saved bids it does not have.
 * It is the reverse-direction guard #1894 had to add as a separate test.
 *
 * `withPriceBand` extends the claim to the won-against-lost comparison, and is
 * passed only for a page that captures a headline figure — see
 * `PRICE_BAND_CLAUSE` for why the two are not one string.
 */
export function addSavedBidsClause(html, withPriceBand = false) {
  if (typeof html !== 'string') return html;
  if (html.includes(SAVED_BIDS_CLAUSE)) return html;
  const clause = withPriceBand ? `${SAVED_BIDS_CLAUSE} ${PRICE_BAND_CLAUSE}` : SAVED_BIDS_CLAUSE;
  return html.replace(FEATURE_LIST_RE, (match, open, list, close) =>
    list.trim() === '' ? match : `${open}${list}, ${clause}${close}`,
  );
}

/**
 * Scoped under `.pf-jobs`, and — like the chrome and the shop-rates bar — it
 * takes its colours from the host page rather than from the operating system.
 * Most ventures here are deliberately light-only and carry no
 * `prefers-color-scheme` rule, so a band painted from its own dark palette
 * would sit as a near-black slab on a cream page for any visitor with a dark OS.
 *
 * Raw CSS rather than a `<style>` element, because it is written once to
 * `pf-jobs.css` at the site root and linked from the 237 pages that carry the
 * band. See `SAVED_BIDS_STYLE_FILE`.
 */
const JOBS_CSS = `
.pf-jobs{font:inherit;font-size:.85rem;line-height:1.45;color:inherit;
  max-width:1060px;margin:0 auto 12px;padding:8px 18px 0;box-sizing:border-box}
/* The bar is a <section>, and 200-odd ventures style every bare section as a
   white card (background, border, radius, shadow). Without these resets the
   bar rendered as an empty white slab jammed against the venture's heading. */
section.pf-jobs{background:none;border:0;border-radius:0;box-shadow:none;min-height:0}
.pf-jobs-line{margin:0;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:baseline}
.pf-jobs-status{opacity:.82}
.pf-jobs button{font:inherit;font-size:.85rem;color:inherit;background:#8080801f;
  border:1px solid #80808059;border-radius:7px;padding:3px 9px;cursor:pointer}
.pf-jobs button:hover{background:#8080802e}
.pf-jobs-panel{margin:8px 0 0;padding:12px 14px;border:1px solid #80808040;
  border-radius:10px;background:#8080800f}
.pf-jobs-panel p{margin:0 0 10px}
.pf-jobs-save{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px}
.pf-jobs-save input{font:inherit;font-size:.85rem;color:inherit;background:transparent;
  border:1px solid #80808059;border-radius:7px;padding:3px 8px;min-width:0;flex:1 1 14em}
.pf-jobs-list{margin:0 0 10px;padding:0;list-style:none;display:grid;gap:6px}
/* Same guard as .pf-jobs-revision, and it was already needed here: the script
   sets this list's hidden attribute when there are no saved bids, and grid
   outranks the user agent rule, so a contractor with nothing saved got an
   empty list element — announced by a screen reader, and carrying its own
   10px margin — inside the panel. Caught by asking a rendered page rather
   than by reading this file; see checkHiddenDisplay in check.mjs. */
.pf-jobs-list[hidden]{display:none}
.pf-jobs-list li{margin:0;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:baseline;
  padding:6px 0;border-top:1px solid #80808033}
.pf-jobs-list li:first-child{border-top:0}
.pf-jobs-name{font-weight:600;flex:1 1 10em;overflow-wrap:anywhere}
.pf-jobs-amount{font-weight:650;font-variant-numeric:tabular-nums;white-space:nowrap}
.pf-jobs-when{opacity:.7;font-variant-numeric:tabular-nums}
/* The summary is not dimmed like the note below it, and the waiting age is not
   dimmed like the date beside it: both are what the panel is opened to read.
   A decided row steps back, because the list is scanned for the open ones. */
.pf-jobs-summary{margin:0 0 10px;font-weight:600}
/* The chase line is the one thing in the panel a contractor should act on
   today, so it is the one thing given a colour of its own — and that colour is
   currentColor at full strength against a tinted rule, because 180 venture
   palettes do not agree on a warning red. */
.pf-jobs-chase{margin:0 0 10px;padding:8px 10px;border-left:3px solid currentColor;
  background:#8080801a;border-radius:0 7px 7px 0}
/* The price band is the panel's one piece of reading rather than tracking, so
   it is set apart from the list without being dimmed out of it. */
.pf-jobs-band{margin:0 0 10px;padding:8px 10px;border-left:3px solid #80808059;
  background:#8080800f;border-radius:0 7px 7px 0;font-variant-numeric:tabular-nums}
/* The gap reads as a second paragraph of the same band rather than a new kind
   of thing, so it takes .pf-jobs-band's box and only closes the space between
   them: the two paragraphs are one reading, and the second continues the
   first rather than answering a different question. */
.pf-jobs-gap{margin-top:-4px}
/* The one reading in this band that lives outside the panel, because it is the
   only one that is about the form rather than about the list: a contractor
   comparing a revision is looking at the fields, not at their saved bids, and a
   line they have to open a panel to see is a line they will not see. It takes
   the chase line's currentColor rule for the same palette reason, and sits on
   its own row so a long sentence never squeezes the Saved bids button. */
.pf-jobs-revision{margin:6px 0 0;padding:8px 10px;border-left:3px solid currentColor;
  background:#8080801a;border-radius:0 7px 7px 0;font-variant-numeric:tabular-nums;
  display:flex;flex-wrap:wrap;gap:6px 10px;align-items:baseline}
/* An author display declaration outranks the user agent's [hidden] rule, so
   without this the line is visible — and empty — on every page load. It is the
   only rule in this stylesheet that sets display on an element the script
   toggles, which is why nothing else here needs the same guard. */
.pf-jobs-revision[hidden]{display:none}
.pf-jobs-revision-text{flex:1 1 16em}
.pf-jobs-age{font-variant-numeric:tabular-nums}
/* The row-level half of the chase line, and it takes that line's currentColor
   treatment for the same reason: 180 venture palettes do not agree on a warning
   colour, and one asserted here would be invisible on some of them. Weight and
   a border carry it instead of a hue, so it also survives a monochrome print
   and reads for a visitor who cannot distinguish the colour anyway. */
.pf-jobs-quiet{font-size:.78rem;font-weight:700;letter-spacing:.03em;
  border:1px solid currentColor;border-radius:6px;padding:1px 6px;white-space:nowrap}
.pf-jobs-list li[data-pf-jobs-quiet] .pf-jobs-age{font-weight:700}
.pf-jobs-state{font:inherit;font-size:.85rem;color:inherit;background:#8080801f;
  border:1px solid #80808059;border-radius:7px;padding:3px 6px}
/* Sized to the figure it holds, not to the row: a four-or-five digit price on
   a 390px phone screen next to Restore and Delete, which is where these are
   filled in. It shrinks but does not grow, so it yields before the name does. */
/* One rule for both row boxes. They are the same control in the same slot —
 * an optional figure the contractor types onto a decided row — and the only
 * difference is which outcome shows it, so a second declaration would be a
 * second thing to keep in step with the contrast pass that cleared this one. */
.pf-jobs-lostto,.pf-jobs-cost{font:inherit;font-size:.85rem;color:inherit;background:transparent;
  border:1px solid #80808059;border-radius:7px;padding:3px 6px;flex:0 1 7.5em;min-width:0;
  font-variant-numeric:tabular-nums}
.pf-jobs-list li[data-pf-jobs-decided] .pf-jobs-name{font-weight:500;opacity:.75}
.pf-jobs-note{margin:10px 0 0;opacity:.72}
/* The band inherits each venture's own colours, and 180 pages do not agree on
   a link colour. currentColor plus an underline reads as a link on every one
   of them without asserting a palette this band does not own. */
.pf-jobs-note a{color:currentColor;text-decoration:underline}
.pf-jobs :focus-visible{outline:2px solid currentColor;outline-offset:2px}
@media (max-width:780px){.pf-jobs{padding:8px 14px 0}}

/* Never print this band, and this one is not cosmetic.
 *
 * .pf-jobs-list renders the names a contractor gave their other bids — which
 * are customer names and street addresses far more often than not. A hundred
 * bid calculators print a customer proposal (platform/proposal), whose whole
 * point is that the homeowner receives their own price and nothing else. This
 * band is injected as a sibling of the page's main element, so it falls
 * outside those sheets' allow-list: a contractor who left the panel open would
 * have handed one customer a list of the others. */
@media print{.pf-jobs{display:none !important}}
`;

/**
 * The prose is rendered at build time and the script only wires it, so what a
 * visitor reads is in the HTML rather than assembled by JavaScript — and so a
 * crawler or an answer engine can see that these tools carry the feature.
 *
 * It starts `hidden` and the script reveals it. Everything this bar offers is
 * storage plus scripting; with scripting off there is nothing behind the
 * control, and a button that does nothing is worse than no button.
 */
// `id` is load-bearing, not decoration: it is the anchor the hub's saved-bid
// index links to (`/<slug>/#pf-jobs`). Without it a visitor sent from the hub
// lands at the top of a calculator and has to find the band themselves, which
// is most of the friction that index exists to remove.
/**
 * The band, and the one route off this browser.
 *
 * The note has always ended "clearing your browser data clears it", which was
 * true and had no answer. `backup.mjs` is the answer, and it lives on the hub —
 * so the person most likely to want it, the one who has just saved a bid they
 * care about, was the one person never told it exists. A calculator page is
 * where the intent is; the hub is where the file is written. One link closes
 * the distance.
 *
 * `toRoot` is the same relative prefix the chrome and the favicon are built
 * from, because these pages are served at two depths (`/<slug>/` and
 * `/<slug>/some-question.html`) and a hard-coded `../` is wrong at one of them.
 */
const JOBS_MARKUP = (toRoot = './', withPriceBand = false) => `<section class="pf-jobs" id="pf-jobs" hidden data-pf-jobs-root>
  <p class="pf-jobs-line">
    <span class="pf-jobs-status" id="pf-jobs-status" role="status"></span>
    <button type="button" id="pf-jobs-toggle" aria-expanded="false" aria-controls="pf-jobs-panel">Saved bids</button>
  </p>${withPriceBand ? `
  <p class="pf-jobs-revision" id="pf-jobs-revision" hidden>
    <span class="pf-jobs-revision-text" id="pf-jobs-revision-text" role="status"></span>
    <button type="button" data-pf-jobs="stop-compare">Stop comparing</button>
  </p>` : ''}
  <div class="pf-jobs-panel" id="pf-jobs-panel" hidden>
    <p>Keep this bid so it is still here when the customer calls back. Every number on this form is saved together, under a name you choose, along with the figure it gave you, and restoring one puts the whole job back exactly as you priced it. Mark each one won or lost when you hear &mdash; the ones you have not heard back on stay listed as waiting, with how long they have been out. Once a few have come back, this panel says how long yours actually take, and how many are still out past that. Once enough of them have been decided, it also says whether the bids you save here have been landing differently lately than they used to.${withPriceBand ? ' Once a few here are decided, this panel says what the ones you won averaged against the ones you lost, so you can see where your price tips. On a lost bid you can also note what the job went for, if you heard &mdash; then it says how far off you actually were, which is the part guessing gets wrong in both directions. On a won one, note what the job came to once it was done and this panel says what those jobs actually kept, so you can see whether the ones you are winning are worth winning &mdash; and it tells you how many of your won jobs are still missing that figure, rather than going quiet about it. Restoring a bid also pins the figure it was saved at above this panel, so when the customer asks what it costs without the tear-off, the new number is shown against the one they already have &mdash; and by how much, in money and in percent.' : ''}</p>
    <div class="pf-jobs-save">
      <label class="pf-jobs-label" for="pf-jobs-name">Name this bid</label>
      <input type="text" id="pf-jobs-name" maxlength="60" autocomplete="off" placeholder="e.g. 14 Oak St — Mrs Reid">
      <button type="button" data-pf-jobs="save">Save this bid</button>
    </div>
    <p class="pf-jobs-summary" id="pf-jobs-summary" hidden></p>
    <p class="pf-jobs-chase" id="pf-jobs-chase" hidden></p>
    <p class="pf-jobs-band pf-jobs-trend" id="pf-jobs-trend" hidden></p>${withPriceBand ? `
    <p class="pf-jobs-band" id="pf-jobs-band" hidden></p>
    <p class="pf-jobs-band pf-jobs-gap" id="pf-jobs-gap" hidden></p>
    <p class="pf-jobs-band pf-jobs-margin" id="pf-jobs-margin" hidden></p>
    <p class="pf-jobs-band pf-jobs-gap" id="pf-jobs-costgap" hidden></p>` : ''}
    <ul class="pf-jobs-list" id="pf-jobs-list" hidden></ul>
    <p class="pf-jobs-note">Kept in this browser only, on this site&rsquo;s own storage. Nothing is uploaded, and clearing your browser data clears it &mdash; <a href="${toRoot}#backup-box">download a backup</a> to keep a copy or open your bids on another device. Bids are kept per tool, so these are the ones you saved here.</p>
  </div>
</section>`;

/**
 * The browser half.
 *
 * A module script, not a classic one, and that is load-bearing: inline classic
 * scripts run the moment they are parsed, which would be *before* the venture's
 * own deferred module has built its itemised rows or restored a shared bid.
 * Module scripts are deferred and run in document order, so this one — injected
 * last — sees the finished form. The `load` fallback covers a venture module
 * that stalls.
 *
 * Nothing here restores automatically. The shop-rates bar applies saved rates
 * on load because a stranger's ballpark in a wage field is always wrong; a
 * saved *bid* is a different job from the one on screen, and putting one there
 * without being asked would overwrite the measurements someone is mid-way
 * through typing.
 *
 * Comments below are sparse on purpose, and the reasoning that would otherwise
 * sit in them is here instead: this string is inlined into every page the build
 * produces and cached by the service worker for all of them, so a line of prose
 * in the script costs a quarter of a kilobyte across the offline bundle. The
 * three decisions worth recording:
 *
 * **The outcome control is a `<select>`, not a Won button and a Lost button.**
 * The row already carries Restore and Delete; two more buttons wrap it onto
 * three lines on a phone. A select also reads as the state it is — a bid *is*
 * waiting, or won — where a pair of buttons reads as an action, and it gives a
 * way back from a mis-click that two buttons would need a third to offer.
 *
 * **The waiting age is drawn only on undecided bids.** A won job is not waiting
 * for anything, and how long ago a lost one was priced is not a number anybody
 * acts on. `bidWaitingPhrase` returns nothing for a bid saved today for the
 * same reason: a bid priced this morning is not late, and a badge on every
 * fresh row would train the contractor to stop reading the column that exists
 * to be read on the nineteenth day.
 *
 * **Re-saving a bid keeps its outcome.** Saving over "14 Oak St" is the common
 * case — the customer asked what it costs without the tear-off — and re-pricing
 * a job is not the same event as hearing back about it. Dropping the outcome
 * there would quietly move a won job back into the chase list, which is the
 * failure this feature exists to prevent rather than cause.
 */
const JOBS_SCRIPT = () => `
(function(){
  var tag = document.querySelector('script[${JOBS_SLUG_ATTR}]');
  var SLUG = tag ? tag.getAttribute('${JOBS_SLUG_ATTR}') || '' : '';
  // Re-checked here rather than trusted as an attribute. It was a build-time
  // literal until this script became one shared file; now it travels through
  // the DOM, and it is handed to querySelector. The build only ever writes the
  // hash-id form (see pageHeadlineAmountSelector), so anything else is not ours.
  var claimed = tag ? tag.getAttribute('${JOBS_AMOUNT_ATTR}') || '' : '';
  var AMOUNT_SELECTOR = /^#[A-Za-z][\\w-]*$/.test(claimed) ? claimed : '';
  var KEY = ${JSON.stringify(SAVED_BIDS_KEY)};
  var MAX = ${MAX_SAVED_BIDS};
  var MIN_FIELDS = ${MIN_SAVEABLE_FIELDS};
  var EXCLUDED = ${JSON.stringify([...EXCLUDED_FIELD_IDS])};
  var UNSAVEABLE = ${JSON.stringify([...UNSAVEABLE_TYPES])};

${BID_FOLLOW_UP_HELPERS}
${BID_REPEAT_HELPERS}
${BID_TREND_HELPERS}
${BID_AMOUNT_HELPER}
${BID_PRICE_BAND_HELPERS}

  var root = document.querySelector('[data-pf-jobs-root]');
  if (!root) return;
  var el = function(id){ return document.getElementById(id); };

  var store = (function(){ try { return window.localStorage; } catch (e) { return null; } })();
  // With no storage there is nothing behind any of these buttons. Removing the
  // panel is the honest outcome, the same as the shop-rates bar's.
  if (!store) { root.remove(); return; }

  var skipId = function(id){
    return !id || id.indexOf('pf-') === 0 || EXCLUDED.indexOf(id) !== -1;
  };

  // Re-collected from the live document on every save and every restore, never
  // from a list baked in at build time: the itemised calculators add and remove
  // rows as the contractor works, and a stale list would be exactly the
  // half-restore this feature refuses to perform.
  var formFields = function(){
    var out = [];
    var nodes = document.querySelectorAll('input[id], select[id], textarea[id]');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (skipId(node.id)) continue;
      if (node.tagName === 'INPUT' && UNSAVEABLE.indexOf((node.type || 'text').toLowerCase()) !== -1) continue;
      if (node.closest('[data-pf-jobs-root]')) continue;
      out.push(node);
    }
    return out;
  };

  // The "+ Add a room" controls this page declares, and the id prefix each one
  // generates. Empty on 161 of the 169 tools, which is what keeps the exact-id
  // rule below untouched everywhere it was already right.
  var repeatControls = function(){
    var out = [];
    var nodes = document.querySelectorAll('[' + REPEAT_ATTR + ']');
    for (var i = 0; i < nodes.length; i++) {
      var prefix = (nodes[i].getAttribute(REPEAT_ATTR) || '').trim();
      if (prefix !== '') out.push({ prefix: prefix, node: nodes[i] });
    }
    return out;
  };

  var repeatPrefixes = function(controls){
    var out = [];
    for (var i = 0; i < controls.length; i++) {
      if (out.indexOf(controls[i].prefix) === -1) out.push(controls[i].prefix);
    }
    return out;
  };

  var fieldIds = function(nodes){
    var out = [];
    for (var i = 0; i < nodes.length; i++) out.push(nodes[i].id);
    return out;
  };

  // Click each group's add control until the form holds as many rows as the
  // record does. Clicking is the only way in: these rows are the venture's own
  // markup, built by its own module, and reaching past the button to synthesise
  // one here would mean a second implementation of every row on the site.
  //
  // Returns the fields as they stand afterwards, so a caller always compares
  // against the grown form rather than the one it measured a moment ago.
  var growRows = function(wantedIds){
    var controls = repeatControls();
    if (controls.length === 0) return formFields();
    var prefixes = repeatPrefixes(controls);
    var grow = rowsToGrow(
      normalizeRepeatIds(wantedIds, prefixes).counts,
      normalizeRepeatIds(fieldIds(formFields()), prefixes).counts,
      prefixes
    );
    for (var i = 0; i < controls.length; i++) {
      var todo = grow[controls[i].prefix] || 0;
      // Two controls sharing a prefix would otherwise each add the whole
      // shortfall; the first one to run owns it.
      grow[controls[i].prefix] = 0;
      for (var n = 0; n < todo; n++) controls[i].node.click();
    }
    return formFields();
  };

  var isToggle = function(node){
    return node.tagName === 'INPUT' && (node.type === 'checkbox' || node.type === 'radio');
  };

  var readAll = function(){
    var raw;
    try { raw = store.getItem(KEY); } catch (e) { return {}; }
    if (!raw) return {};
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return {}; }
    if (!parsed || typeof parsed !== 'object') return {};
    var bids = parsed.bids;
    return bids && typeof bids === 'object' ? bids : {};
  };
  var mine = function(){
    var all = readAll();
    var list = all[SLUG];
    return Array.isArray(list) ? list.filter(function(b){
      return b && typeof b === 'object' && typeof b.name === 'string' && b.fields && typeof b.fields === 'object';
    }) : [];
  };
  // Merges into whatever else is stored: saving on the roofing calculator must
  // not wipe the bids saved on the siding one.
  var writeMine = function(list){
    var all = readAll();
    if (list.length > 0) all[SLUG] = list.slice(0, MAX); else delete all[SLUG];
    try { store.setItem(KEY, JSON.stringify({ v: 1, bids: all })); return true; }
    catch (e) { return false; }
  };

  // The same anonymous, device-local convention the rest of the site uses:
  // which things were done, never who did them, never leaving the device, and
  // silent for a browser asking not to be counted.
  var bump = function(event){
    try {
      if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
      if (store.getItem('portfolio-hub-optout') === '1') return;
      var k = 'portfolio-hub-usage';
      var counts = JSON.parse(store.getItem(k) || '{}');
      counts[event] = (counts[event] || 0) + 1;
      counts.last_day = new Date().toISOString().slice(0, 10);
      store.setItem(k, JSON.stringify(counts));
    } catch (e) {}
  };

  var say = function(message){ el('pf-jobs-status').textContent = message; };

  var today = function(){
    try { return new Date().toISOString().slice(0, 10); } catch (e) { return 'Saved bid'; }
  };
  var when = function(at){
    return typeof at === 'string' ? at.slice(0, 10) : '';
  };

  // The figure a restored bid was saved at, held only while the form still
  // holds that job. Null is "nothing to compare", which is where every page
  // load starts: this is deliberately not stored, because the form it compares
  // against does not survive a reload either.
  var comparing = null;
  var revisionShown = '';
  var revisionWatch = null;

  var liveAmount = function(){
    if (!AMOUNT_SELECTOR) return '';
    var node = document.querySelector(AMOUNT_SELECTOR);
    return normalizeHeadlineAmount(node ? node.textContent : '');
  };

  var drawRevision = function(){
    var box = el('pf-jobs-revision');
    if (!box) return;
    var sentence = comparing ? revisionSentence(comparing, liveAmount()) : '';
    el('pf-jobs-revision-text').textContent = sentence;
    box.hidden = sentence === '';
    if (sentence !== '' && sentence !== revisionShown) {
      revisionShown = sentence;
      bump('bid_revision_shown');
    }
  };

  // Watches the figure, not the form. Every one of these tools reprices its own
  // way — some on input, some on a button, some after a deferred module has
  // rebuilt itemised rows — and none of them announce it. The hero number
  // changing is the one event common to all of them.
  var watchAmount = function(){
    if (revisionWatch || !AMOUNT_SELECTOR || typeof MutationObserver !== 'function') return;
    var node = document.querySelector(AMOUNT_SELECTOR);
    if (!node) return;
    revisionWatch = new MutationObserver(drawRevision);
    revisionWatch.observe(node, { childList: true, characterData: true, subtree: true });
  };

  var stopComparing = function(){
    comparing = null;
    revisionShown = '';
    drawRevision();
  };

  var bandShown = '';
  var gapShown = '';
  var marginShown = '';
  var costGapShown = '';
  var trendShown = '';
  var chaseShown = '';

  var render = function(){
    var list = mine();
    var ul = el('pf-jobs-list');
    ul.textContent = '';
    ul.hidden = list.length === 0;

    var summary = el('pf-jobs-summary');
    var sentence = followUpSentence(list, Date.now());
    summary.textContent = sentence;
    summary.hidden = sentence === '';

    // How long this contractor's customers actually take, and which quotes have
    // outlived that. Drawn before the price band because it is the line with
    // something to do today.
    var chase = el('pf-jobs-chase');
    var chasing = chaseSentence(list, Date.now());
    chase.textContent = chasing;
    chase.hidden = chasing === '';
    if (chasing !== '' && chasing !== chaseShown) { chaseShown = chasing; bump('bid_chase_shown'); }

    // The window the sentence above is drawn from, kept so the rows can say
    // which of them it means. Until now the line said "2 still waiting have
    // been out longer than that" and the list below it looked identical row to
    // row, leaving the contractor to hold "9 days" in their head and check
    // twenty ages against it. The count and the rows now come off one value.
    var seen = responseWindow(list);

    // Whether this trade has been landing differently lately, drawn above the
    // money readings and on every page the panel reaches rather than only the
    // ones with a hero figure — it needs no figure at all, only that a bid was
    // decided and dated.
    //
    // The hub says this too, and naming the trade there is the half no tool
    // page can produce. This is the half no hub page can: a contractor reads
    // the hub when a customer rings back, and reads this panel while deciding
    // what to charge for the next job, which is the only moment the finding can
    // still change an outcome.
    var trendEl = el('pf-jobs-trend');
    if (trendEl) {
      var trending = toolTrendSentence(list, Date.now());
      trendEl.textContent = trending;
      trendEl.hidden = trending === '';
      if (trending !== '' && trending !== trendShown) {
        trendShown = trending;
        bump('bid_trend_shown');
      }
    }

    // Absent on a tool with no headline figure: the build emits neither the
    // paragraph nor the functions there, so this element is the guard. Counted
    // when the reading changes rather than on every render, so a contractor
    // marking three bids in a row is three readings and not thirty.
    var band = el('pf-jobs-band');
    if (band) {
      var reading = priceBandSentence(list);
      band.textContent = reading;
      band.hidden = reading === '';
      if (reading !== '' && reading !== bandShown) { bandShown = reading; bump('bid_price_band_shown'); }
    }

    var gapEl = el('pf-jobs-gap');
    if (gapEl) {
      var gap = undercutSentence(list);
      gapEl.textContent = gap;
      gapEl.hidden = gap === '';
      if (gap !== '' && gap !== gapShown) { gapShown = gap; bump('bid_undercut_shown'); }
    }

    // Drawn last of the three, and after the rows have been counted rather than
    // before: the two above are about quotes, this one is about jobs that are
    // finished, so it reads as the end of the story the panel tells.
    var marginEl = el('pf-jobs-margin');
    if (marginEl) {
      var margin = marginSentence(list);
      marginEl.textContent = margin;
      marginEl.hidden = margin === '';
      if (margin !== '' && margin !== marginShown) { marginShown = margin; bump('bid_margin_shown'); }
    }

    // Directly under the reading it is about, because in the branch that
    // fires while the margin line is drawing it says what that line does not
    // cover, and a caveat printed above its claim is not a caveat. In the
    // other branch the margin line is hidden and this one stands where it
    // would have been, which is the right place for the sentence explaining
    // why nothing is there.
    var costGapEl = el('pf-jobs-costgap');
    if (costGapEl) {
      var costGap = costGapSentence(list);
      costGapEl.textContent = costGap;
      costGapEl.hidden = costGap === '';
      // Counted on change, like every reading in this panel, and the event
      // carries no name, no figure and not which branch drew — only that a
      // contractor was shown the gap, which is what says whether naming it
      // moves bid_cost_set at all.
      if (costGap !== '' && costGap !== costGapShown) {
        costGapShown = costGap;
        bump('bid_cost_gap_shown');
      }
    }

    for (var i = 0; i < list.length; i++) {
      var bid = list[i];
      var outcome = bid.outcome === 'won' || bid.outcome === 'lost' ? bid.outcome : '';
      var li = document.createElement('li');
      if (outcome) li.setAttribute('data-pf-jobs-decided', outcome);

      var name = document.createElement('span');
      name.className = 'pf-jobs-name';
      name.textContent = bid.name;
      li.appendChild(name);

      var shown = normalizeHeadlineAmount(bid.amount);
      if (shown) {
        var amountEl = document.createElement('span');
        amountEl.className = 'pf-jobs-amount';
        amountEl.textContent = shown;
        li.appendChild(amountEl);
      }

      var at = document.createElement('span');
      at.className = 'pf-jobs-when';
      at.textContent = when(bid.at);
      li.appendChild(at);

      if (!outcome) {
        var phrase = bidWaitingPhrase(bidWaitingDays(bid.at, Date.now()));
        if (phrase) {
          var age = document.createElement('span');
          age.className = 'pf-jobs-age';
          age.textContent = phrase;
          li.appendChild(age);
        }
        // Which quote the chase line means. Marked on the row rather than only
        // counted in the paragraph, and only where the window exists: below the
        // sample threshold isQuietBid is false for everything, so a contractor
        // with two answered bids sees no marks rather than marks drawn off a
        // rule of thumb this feature does not have.
        if (isQuietBid(bid, seen, Date.now())) {
          li.setAttribute('data-pf-jobs-quiet', '');
          var chaseTag = document.createElement('span');
          chaseTag.className = 'pf-jobs-quiet';
          // Says what to do, not what happened: "Gone quiet" describes the bid,
          // "Chase" is the thing the contractor came to the panel to find out.
          chaseTag.textContent = 'Chase';
          li.appendChild(chaseTag);
        }
      }

      var state = document.createElement('select');
      state.className = 'pf-jobs-state';
      state.setAttribute('data-pf-jobs-state', '');
      state.setAttribute('data-pf-jobs-index', String(i));
      state.setAttribute('aria-label', 'Outcome of the bid named ' + bid.name);
      var options = [['', 'Waiting'], ['won', 'Won'], ['lost', 'Lost']];
      for (var o = 0; o < options.length; o++) {
        var option = document.createElement('option');
        option.value = options[o][0];
        option.textContent = options[o][1];
        if (options[o][0] === outcome) option.selected = true;
        state.appendChild(option);
      }
      li.appendChild(state);

      // Only on a lost row, and only where the tool captures a figure to
      // compare it against: on a page with no hero number the gap sentence can
      // never be drawn, so the box would be somewhere to type a number nothing
      // reads. The pf-jobs-gap element is that page's build-time gate.
      if (outcome === 'lost' && gapEl) {
        var went = document.createElement('input');
        went.type = 'text';
        went.className = 'pf-jobs-lostto';
        went.setAttribute('data-pf-jobs-lostto', '');
        went.setAttribute('data-pf-jobs-index', String(i));
        // inputmode decimal and not numeric: a price has a decimal point, and
        // iOS shows a keypad without one for numeric.
        went.setAttribute('inputmode', 'decimal');
        went.setAttribute('autocomplete', 'off');
        went.maxLength = 14;
        went.placeholder = 'Went for';
        went.setAttribute('aria-label', 'What the job named ' + bid.name + ' went for, if you know');
        went.value = normalizeLostTo(bid.lostTo);
        li.appendChild(went);
      }

      // The won-row mirror. Gated on the same element for the same reason: with
      // no hero figure there is no price to take the cost away from, so the box
      // would collect a number nothing can read back.
      if (outcome === 'won' && gapEl) {
        var spent = document.createElement('input');
        spent.type = 'text';
        spent.className = 'pf-jobs-cost';
        spent.setAttribute('data-pf-jobs-cost', '');
        spent.setAttribute('data-pf-jobs-index', String(i));
        spent.setAttribute('inputmode', 'decimal');
        spent.setAttribute('autocomplete', 'off');
        spent.maxLength = 14;
        spent.placeholder = 'Cost you';
        spent.setAttribute('aria-label', 'What the job named ' + bid.name +
          ' cost you to deliver, if you know');
        spent.value = normalizeJobCost(bid.cost);
        li.appendChild(spent);
      }

      var restore = document.createElement('button');
      restore.type = 'button';
      restore.setAttribute('data-pf-jobs', 'restore');
      restore.setAttribute('data-pf-jobs-index', String(i));
      restore.textContent = 'Restore';
      restore.setAttribute('aria-label', 'Restore the bid named ' + bid.name);
      li.appendChild(restore);

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.setAttribute('data-pf-jobs', 'delete');
      remove.setAttribute('data-pf-jobs-index', String(i));
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', 'Delete the bid named ' + bid.name);
      li.appendChild(remove);

      ul.appendChild(li);
    }
  };

  var save = function(){
    var fields = formFields();
    if (fields.length < MIN_FIELDS) { say('There is no bid on this form to save yet.'); return; }

    var box = el('pf-jobs-name');
    var name = (box.value || '').replace(/\\s+/g, ' ').trim().slice(0, 60) || today();

    var values = {};
    for (var i = 0; i < fields.length; i++) {
      var node = fields[i];
      values[node.id] = isToggle(node) ? !!node.checked : String(node.value);
    }

    var list = mine();
    // Same name means the same job re-priced, which is the common case: a
    // customer asks what it costs without the tear-off and the contractor saves
    // over their own row rather than growing a list of near-identical names.
    var replaced = false;
    var carried = null;
    for (var j = 0; j < list.length; j++) {
      if (list[j].name === name) { carried = list.splice(j, 1)[0]; replaced = true; break; }
    }

    var entry = { name: name, at: new Date().toISOString(), fields: values };
    // Read off the page rather than recomputed, so what is stored is exactly
    // the figure the visitor was looking at when they pressed Save — and so this
    // never has to know how 162 different calculators arrive at theirs.
    if (AMOUNT_SELECTOR) {
      var amountNode = document.querySelector(AMOUNT_SELECTOR);
      var shown = normalizeHeadlineAmount(amountNode ? amountNode.textContent : '');
      if (shown) entry.amount = shown;
    }
    // Re-pricing a job is not hearing back about it: the outcome carries over.
    if (carried && (carried.outcome === 'won' || carried.outcome === 'lost')) {
      entry.outcome = carried.outcome;
      if (typeof carried.decidedAt === 'string' && carried.decidedAt) entry.decidedAt = carried.decidedAt;
    }
    list.unshift(entry);

    var dropped = list.length > MAX;
    if (!writeMine(list)) {
      say('This browser would not store the bid — its storage may be full or turned off.');
      return;
    }
    box.value = '';
    // Nothing left to compare: the stored bid is now this form. Leaving the
    // line up would have it read "Still £7,210" against a figure the customer
    // was never quoted, which is the one way this reading could mislead.
    stopComparing();
    render();
    bump('bid_saved');
    say(
      (replaced ? 'Replaced “' : 'Saved “') + name + '” — ' + fields.length + ' fields.' +
      (dropped ? ' The oldest saved bid was dropped.' : '')
    );
  };

  var restore = function(index){
    var list = mine();
    var bid = list[index];
    if (!bid) { render(); return; }

    var savedIds = [];
    for (var s in bid.fields) {
      if (Object.prototype.hasOwnProperty.call(bid.fields, s)) savedIds.push(s);
    }

    // Rebuild the rows the bid was priced with before deciding whether the form
    // matches it. A no-op on the pages that declare no row groups.
    var fields = growRows(savedIds);
    var prefixes = repeatPrefixes(repeatControls());

    // Compared by the row's position in its group rather than by the counter in
    // its id, so a bid saved as r1,r7 restores into a form holding r1,r2.
    // With no groups declared both maps are the identity and this is the
    // exact-id rule it replaced.
    var savedKeys = normalizeRepeatIds(savedIds, prefixes).map;
    var formKeys = normalizeRepeatIds(fieldIds(fields), prefixes).map;

    var byKey = {};
    for (var i = 0; i < fields.length; i++) byKey[formKeys[fields[i].id]] = fields[i];

    // Atomic or refused. See the header of this module: a partial write leaves
    // a form that prices a real but different job, which is worse than not
    // restoring at all because it looks finished.
    var missing = [], extra = [];
    for (var id in bid.fields) {
      if (Object.prototype.hasOwnProperty.call(bid.fields, id) && !byKey[savedKeys[id]]) missing.push(id);
    }
    var savedKeySet = {};
    for (var m = 0; m < savedIds.length; m++) savedKeySet[savedKeys[savedIds[m]]] = 1;
    for (var k = 0; k < fields.length; k++) {
      if (!savedKeySet[formKeys[fields[k].id]]) extra.push(fields[k].id);
    }

    if (missing.length > 0 || extra.length > 0) {
      bump('bid_restore_refused');
      var parts = [];
      if (missing.length > 0) parts.push(missing.length + ' the form does not have');
      if (extra.length > 0) parts.push(extra.length + ' the form has that this bid never priced');
      // The advice differs by page. Where rows are added by hand the visitor can
      // match the form to the job; where they are generated, the form has
      // already been grown to the saved row count, so anything still off is a
      // shape the page cannot reach from here and reloading is the cheap fix.
      var advice = prefixes.length > 0
        ? ' Reload this page and restore again before adding rows of your own — '
        : ' Add or remove rows until the form matches the job you saved, then restore again — ';
      say(
        'Not restored. “' + bid.name + '” has ' + parts.join(', and ') + '.' + advice +
        'a partly restored bid would price a different job.'
      );
      return;
    }

    var written = 0;
    for (var id2 in bid.fields) {
      if (!Object.prototype.hasOwnProperty.call(bid.fields, id2)) continue;
      var node = byKey[savedKeys[id2]];
      var value = bid.fields[id2];
      if (isToggle(node)) node.checked = !!value; else node.value = String(value);
      // The venture's own module listens for one or the other depending on the
      // control, so both are dispatched; they bubble because several of these
      // pages delegate from the form rather than binding each field.
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
      written++;
    }
    bump('bid_restored');

    // The name travels back with the numbers. Without it a contractor who
    // restores "14 Oak St", drops the tear-off and saves gets a second row
    // under today's date instead of replacing their own, and the save path's
    // match-by-name, which exists for exactly this sequence, never fires.
    el('pf-jobs-name').value = bid.name;

    // And the figure it was quoted at, so the reprice that follows is shown
    // against the number the customer is holding rather than against nothing.
    // Absent on a bid saved before amounts, or on a tool with no hero figure:
    // both end as null and draw no line, which is the same as before.
    comparing = normalizeHeadlineAmount(bid.amount) || null;
    revisionShown = '';
    watchAmount();
    drawRevision();

    say('Restored “' + bid.name + '” — ' + written + ' fields. The bid below is repriced from it.');
  };

  var setOutcome = function(index, value){
    var list = mine();
    var bid = list[index];
    if (!bid) { render(); return; }

    if (value === 'won' || value === 'lost') {
      bid.outcome = value;
      bid.decidedAt = new Date().toISOString();
    } else {
      delete bid.outcome;
      delete bid.decidedAt;
    }
    // A won or waiting bid has no winning price but its own. Kept in step with
    // normalizeBid, which refuses to store one on either — without this the
    // figure would survive in memory until the next reload and be counted by
    // undercutSentence on a bid the contractor had just said they won.
    if (value !== 'lost') delete bid.lostTo;
    // And the mirror: a bid that is no longer won has no delivered job behind
    // it, so its cost goes with the decision. Without this the figure would
    // survive in memory until the next reload and marginSentence would keep
    // counting a job the contractor had just said they did not do.
    if (value !== 'won') delete bid.cost;

    if (!writeMine(list)) { say('This browser would not update its storage.'); return; }
    render();
    bump(value === 'won' ? 'bid_marked_won' : value === 'lost' ? 'bid_marked_lost' : 'bid_marked_waiting');
    say(
      value === 'won' ? 'Marked “' + bid.name + '” won.'
        : value === 'lost' ? 'Marked “' + bid.name + '” lost.'
        : '“' + bid.name + '” is waiting on an answer again.'
    );
  };

  // render() rebuilds the whole list, so the box being edited is a different
  // element afterwards and the caret is gone from the page. On the outcome
  // select that is harmless — choosing an option ends the interaction. On a
  // text field it is not: pressing Enter to commit a figure would drop focus to
  // the body mid-task, which on a screen reader or a keyboard is losing your
  // place in a list of customer names. So the row's box is refocused, and the
  // caret put back where the browser had it.
  // Parameterised by the row attribute, so the won row's cost box gets the same
  // caret handling as the lost row's price box from one copy of it. Both ship
  // in the offline bundle; a second set of near-identical helpers would be
  // bytes on every jobsite page load for behaviour that has to stay identical.
  var rowBox = function(attr, index){
    return document.querySelector('[' + attr + '][data-pf-jobs-index="' + index + '"]');
  };

  // Only when the box still had focus, which is what tells the two callers
  // apart. 'change' fires on blur as well as on Enter, and refocusing after a
  // blur would drag the caret back out of whatever the visitor had just tabbed
  // to — a worse bug than the one this fixes.
  var reFocusRow = function(attr, state){
    if (!state || !state.had) return;
    var box = rowBox(attr, state.index);
    if (!box) return;
    try {
      box.focus();
      var at = Math.min(state.caret == null ? box.value.length : state.caret, box.value.length);
      box.setSelectionRange(at, at);
    } catch (e) {}
  };

  var focusState = function(attr, index){
    var box = rowBox(attr, index);
    var had = !!box && document.activeElement === box;
    var caret = null;
    if (had) { try { caret = box.selectionStart; } catch (e) {} }
    return { index: index, had: had, caret: caret };
  };

  var LOST_ATTR = 'data-pf-jobs-lostto';
  var COST_ATTR = 'data-pf-jobs-cost';

  var setLostTo = function(index, value){
    var focus = focusState(LOST_ATTR, index);
    var list = mine();
    var bid = list[index];
    if (!bid || bid.outcome !== 'lost') { render(); return; }

    var went = normalizeLostTo(value);
    var typed = String(value == null ? '' : value).trim();
    // Clearing the box is a real edit — a figure heard second-hand and later
    // corrected has to be removable — but an unreadable one is not, and
    // silently deleting the last good number because a stray character got in
    // would lose data the contractor cannot get back.
    if (!went && typed !== '') {
      render();
      // The rejected text is put back so it can be corrected rather than
      // retyped: a figure that failed on one stray character is nearly right.
      var box = rowBox(LOST_ATTR, index);
      if (box) box.value = typed;
      reFocusRow(LOST_ATTR, focus);
      say('Could not read “' + typed + '” as a price, so the figure for “' + bid.name +
        '” is unchanged. Enter what the job went for as a plain amount, like 1900 or 1900.50.');
      return;
    }

    var before = bid.lostTo || '';
    if (went) bid.lostTo = went; else delete bid.lostTo;
    if (before === (went || '')) { render(); reFocusRow(LOST_ATTR, focus); return; }

    if (!writeMine(list)) { say('This browser would not update its storage.'); return; }
    render();
    reFocusRow(LOST_ATTR, focus);
    bump(went ? 'bid_lost_to_set' : 'bid_lost_to_cleared');
    say(went
      ? 'Noted: “' + bid.name + '” went for ' + went + '.'
      : 'Cleared what “' + bid.name + '” went for.');
  };

  // The won-row twin of setLostTo. Same three rules, and they matter for the
  // same reasons: an unreadable figure never silently deletes the good one
  // already stored, clearing the box is a real edit because a cost gets
  // corrected when the last supplier invoice lands, and a value that did not
  // change is not written to disk or counted as an event.
  var setCost = function(index, value){
    var focus = focusState(COST_ATTR, index);
    var list = mine();
    var bid = list[index];
    if (!bid || bid.outcome !== 'won') { render(); return; }

    var paid = normalizeJobCost(value);
    var typed = String(value == null ? '' : value).trim();
    if (!paid && typed !== '') {
      render();
      var costBox = rowBox(COST_ATTR, index);
      if (costBox) costBox.value = typed;
      reFocusRow(COST_ATTR, focus);
      say('Could not read “' + typed + '” as an amount, so the cost for “' + bid.name +
        '” is unchanged. Enter what the job cost you as a plain amount, like 1900 or 1900.50.');
      return;
    }

    var had = bid.cost || '';
    if (paid) bid.cost = paid; else delete bid.cost;
    if (had === (paid || '')) { render(); reFocusRow(COST_ATTR, focus); return; }

    if (!writeMine(list)) { say('This browser would not update its storage.'); return; }
    render();
    reFocusRow(COST_ATTR, focus);
    bump(paid ? 'bid_cost_set' : 'bid_cost_cleared');
    say(paid
      ? 'Noted: “' + bid.name + '” cost ' + paid + ' to deliver.'
      : 'Cleared what “' + bid.name + '” cost.');
  };

  var remove = function(index){
    var list = mine();
    var bid = list[index];
    if (!bid) { render(); return; }
    list.splice(index, 1);
    if (!writeMine(list)) { say('This browser would not update its storage.'); return; }
    // Deleting the job is the clearest statement that it is finished with, so
    // the comparison against its quoted figure goes with it.
    stopComparing();
    render();
    bump('bid_deleted');
    say('Deleted “' + bid.name + '”. The numbers on this bid are unchanged.');
  };

  var start = function(){
    // A page whose real form is built in script may still be short of a bid
    // worth naming; checked at start rather than at build time for the same
    // reason the fields are re-collected.
    if (formFields().length < MIN_FIELDS) { root.remove(); return; }

    root.hidden = false;
    render();
    var saved = mine().length;
    if (saved > 0) say(saved === 1 ? '1 saved bid.' : saved + ' saved bids.');

    var toggle = el('pf-jobs-toggle');
    var setOpen = function(open){
      el('pf-jobs-panel').hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) bump('saved_bids_opened');
    };
    toggle.addEventListener('click', function(){
      setOpen(el('pf-jobs-panel').hidden);
    });

    // Arriving from the hub's saved-bid index, which links to '#pf-jobs'. The
    // band is collapsed by default, so landing on the anchor alone would show a
    // closed strip and the visitor would have to open it themselves — one more
    // step in the journey that index exists to shorten. The panel is opened
    // here rather than by :target because its state is the toggle's to own.
    //
    // Checked after the field-count guard above: on a page with no form the
    // band is already gone and there is nothing to open.
    if (location.hash === '#pf-jobs') {
      setOpen(true);
      try { root.scrollIntoView({ block: 'start' }); } catch (e) {}
    }

    // Its own listener: the line sits outside the panel on purpose — see the
    // stylesheet — so the panel's delegated handler never sees this click.
    var revisionBox = el('pf-jobs-revision');
    if (revisionBox) {
      revisionBox.addEventListener('click', function(event){
        var button = event.target.closest ? event.target.closest('[data-pf-jobs]') : null;
        if (button && button.getAttribute('data-pf-jobs') === 'stop-compare') stopComparing();
      });
    }

    el('pf-jobs-name').addEventListener('keydown', function(event){
      // Enter in a bare text box inside a page-level form would submit it and
      // reload the page, losing the bid this feature exists to keep.
      if (event.key === 'Enter') { event.preventDefault(); save(); }
    });

    el('pf-jobs-panel').addEventListener('click', function(event){
      var button = event.target.closest ? event.target.closest('[data-pf-jobs]') : null;
      if (!button) return;
      var action = button.getAttribute('data-pf-jobs');
      if (action === 'save') { save(); return; }
      var index = Number(button.getAttribute('data-pf-jobs-index'));
      if (!isFinite(index)) return;
      if (action === 'restore') restore(index);
      else if (action === 'delete') remove(index);
    });

    // A select fires 'change', not 'click' — its own listener, not a branch above.
    el('pf-jobs-panel').addEventListener('change', function(event){
      var field = event.target;
      if (!field || !field.hasAttribute) return;
      var state = field.hasAttribute('data-pf-jobs-state');
      // 'change' on a text input fires on blur and on Enter, not per keystroke,
      // which is what this wants: a half-typed 19 of 1900 must not be stored
      // and read back as a $1,881 gap while the contractor is still typing.
      var cost = field.hasAttribute(COST_ATTR);
      if (!state && !cost && !field.hasAttribute(LOST_ATTR)) return;
      var index = Number(field.getAttribute('data-pf-jobs-index'));
      if (!isFinite(index)) return;
      if (state) setOutcome(index, field.value);
      else if (cost) setCost(index, field.value);
      else setLostTo(index, field.value);
    });

    el('pf-jobs-panel').addEventListener('keydown', function(event){
      // Same reason as the name box above: Enter inside a page-level form would
      // submit it and reload the page.
      if (event.key !== 'Enter') return;
      var field = event.target;
      if (!field || !field.hasAttribute) return;
      var onCost = field.hasAttribute(COST_ATTR);
      if (!onCost && !field.hasAttribute(LOST_ATTR)) return;
      event.preventDefault();
      var index = Number(field.getAttribute('data-pf-jobs-index'));
      if (!isFinite(index)) return;
      if (onCost) setCost(index, field.value); else setLostTo(index, field.value);
    });
  };

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
`;

/**
 * The saved-bids script as one file, for the whole site.
 *
 * It was inlined into every page until now, and the arithmetic on that had
 * quietly become indefensible: **3.26 MiB of the built site, and 2.06 MiB of
 * the 16 MiB offline bundle, were the same ~14 KB of JavaScript written out 234
 * times.** A contractor on a jobsite paid for it on every page load and again
 * on every tool they saved for offline use.
 *
 * The two per-page values it used to be built around — the venture's slug and
 * which element holds its headline figure — now ride on the `<script>` tag as
 * attributes and are read back from it. Everything else was already a constant
 * shared by all 234 pages.
 *
 * Still stripped of its prose. It is one copy now, so the saving is trivial,
 * but the guarantee is not: `stripForInjection` is what proves no line of the
 * shipped source opens a template literal it does not close, and the test that
 * asserts it reads this file.
 */
export const SAVED_BIDS_MODULE_FILE = 'pf-jobs.js';

/** The contents of that file. Written once by the build, at the site root. */
export function renderSavedBidsModule() {
  return `${stripForInjection(JOBS_SCRIPT())}\n`;
}

/**
 * The band's stylesheet as one file, for the same reason the script became one.
 *
 * The script was extracted in #1917 and the stylesheet beside it was left
 * inline, which turned out to be the larger half: the band's CSS is ~5.4 KB and
 * it was written into all 237 pages that carry the band — **1.26 MiB of the
 * built site**, against the 15 KB the shared script now costs once. It is the
 * same bytes every time; nothing in it was ever per-page.
 *
 * A stylesheet is the easier extraction of the two, because it has no
 * per-page values to carry at all — no slug, no selector, nothing to ride on
 * the tag. The only thing the link needs is the depth of the page it is on,
 * which the build already computes for the chrome and the favicon.
 */
export const SAVED_BIDS_STYLE_FILE = 'pf-jobs.css';

/** The contents of that file. Written once by the build, at the site root. */
export function renderSavedBidsStyle() {
  return `${JOBS_CSS.trimStart()}`;
}

/**
 * Escaped, not interpolated. Both the stylesheet link and the script tag now
 * carry values into attribute position — a path built from the page's depth,
 * the venture's slug, and a CSS selector — so the character that would break
 * out of one is the quote, not the backslash a JSON string literal had to
 * guard against.
 */
const htmlAttr = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Add the saved-bids bar to one already-published page.
 *
 * Returns the html unchanged when the page carries no form worth remembering
 * (`pageTakesSavedBids`), when there is no `<body>` to attach to, or when the
 * bar is already there — the pass has to be safe to run twice.
 *
 * Placed directly after the shop-rates bar when there is one, and under the
 * navigation chrome otherwise, for the reason `injectShopRates` gives: the form
 * is the one part of these pages that is genuinely different from venture to
 * venture, so there is no element every calculator has in the same place. The
 * two bands sit together above the form in the same order on every tool — your
 * rates, then your bids.
 */
export function injectSavedBids(html, slug = '', toRoot = './') {
  if (typeof html !== 'string') return html;
  if (html.includes(JOBS_MARKER)) return html;

  // Before the shape test, not after: this page has a large, saveable form and
  // would pass it. What disqualifies it is what the form *is*. See above.
  if (COST_STRUCTURE_SLUGS.has(slug)) return html;

  if (!pageTakesSavedBids(html)) return html;

  const bodyOpen = html.match(/<body[^>]*>/i);
  if (!bodyOpen || !/<\/body>/i.test(html)) return html;

  // Resolved against the page as it arrived, not against the assembled
  // document: the band this build inserts carries no `hero-number`, but reading
  // the finished document would mean a future one could quietly become the
  // match. Decided here rather than at the bottom because three things now
  // depend on it — the feature-list claim, the paragraph, and the paragraph's
  // element.
  const amountSelector = pageHeadlineAmountSelector(html, slug);

  // The claim goes in with the feature, never on its own. See the clause above.
  const declared = addSavedBidsClause(html, amountSelector !== '');

  // A link now, not a `<style>` body: one file at the site root, cached across
  // every tool a contractor opens. See `SAVED_BIDS_STYLE_FILE`.
  const styleLink =
    `<link rel="stylesheet" href="${htmlAttr(toRoot + SAVED_BIDS_STYLE_FILE)}">`;
  const withStyle = declared.replace(/<\/head>/i, `${styleLink}\n</head>`);
  // A page with no <head> still gets the stylesheet, ahead of the bar it styles.
  const stylePrefix = withStyle === declared ? `${styleLink}\n` : '';

  const rates = withStyle.match(/<section class="pf-rates"[\s\S]*?<\/section>/i);
  const nav = withStyle.match(/<nav class="pf-chrome pf-chrome-top"[\s\S]*?<\/nav>/i);
  const anchor = rates ? rates[0] : nav ? nav[0] : null;
  const markup = JOBS_MARKUP(toRoot, amountSelector !== '');
  const anchored = anchor
    ? withStyle.replace(anchor, `${anchor}\n${stylePrefix}${markup}`)
    : withStyle.replace(bodyOpen[0], `${bodyOpen[0]}\n${stylePrefix}${markup}`);

  // A tag, not a body. The script is one file at the site root now — see
  // `renderSavedBidsModule` — and this is the only thing that varies per page.
  //
  // `type="module"` is kept from when this was inline, and for the same reason:
  // module scripts are deferred and run in document order, so this one, last in
  // the document, sees a form the venture's own deferred module has finished
  // building. A classic external script would run the moment it arrived, which
  // could be before that.
  const attr = htmlAttr;
  const tag = `<script type="module" src="${attr(toRoot + SAVED_BIDS_MODULE_FILE)}"` +
    ` ${JOBS_SLUG_ATTR}="${attr(slug)}" ${JOBS_AMOUNT_ATTR}="${attr(amountSelector)}"></script>`;

  return anchored.replace(/<\/body>/i, `${tag}\n</body>`);
}
