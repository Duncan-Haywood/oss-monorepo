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
 */
export const EXCLUDED_FIELD_IDS = new Set(['usageOptOut']);

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
export const HEADLINE_AMOUNT_OVERRIDES = { 'lawn-care-bid-calculator': '#monthly' };

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
  if (!bids || !bids.length) return '';

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
  if (answered < MIN_RESPONSE_SAMPLE) return '';

  var quiet = 0;
  for (var w = 0; w < bids.length; w++) {
    var bid = bids[w];
    if (!bid || typeof bid !== 'object') continue;
    if (bid.outcome === 'won' || bid.outcome === 'lost') continue;
    var waited = bidWaitingDays(bid.at, nowMs);
    if (waited !== null && waited > high) quiet++;
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
 * Only averages go through here. Every figure quoted back as an actual bid is
 * the stored string, so no number a contractor reads to a customer has been
 * through a rounding rule this file invented.
 */
export function formatBidAmount(currency, value) {
  var decimals = Math.abs(value) < 100 ? 2 : 0;
  var fixed = Math.abs(value).toFixed(decimals);
  var parts = fixed.split('.');
  var whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (value < 0 ? '-' : '') + currency + whole + (parts[1] ? '.' + parts[1] : '');
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
  ...[bidWaitingDays, bidWaitingPhrase, followUpSentence, bidResponseDays, chaseSentence]
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
  ...[normalizeBidName, normalizeOutcome, normalizeLostTo, normalizeHeadlineAmount, isExcludedId,
    normalizeBid].map(
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
  // `normalizeLostTo` is emitted here as well as in `BID_RECORD_HELPERS`, and
  // that is not a duplicate: no script includes both lists, the record helpers
  // exist for the backup panel, and the page script builds its records by hand
  // and needs this one function to read what the visitor typed into the box.
  ...[normalizeLostTo, bidAmountValue, bidPriceSide, formatBidAmount, priceBandSentence,
    undercutSentence].map(
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
  'lost, including how far over the winning price you were on the lost jobs whose final price you know';

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
 */
const JOBS_STYLE = `<style>
.pf-jobs{font:inherit;font-size:.85rem;line-height:1.45;color:inherit;
  max-width:1060px;margin:0 auto;padding:8px 18px 0;box-sizing:border-box}
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
.pf-jobs-age{font-variant-numeric:tabular-nums}
.pf-jobs-state{font:inherit;font-size:.85rem;color:inherit;background:#8080801f;
  border:1px solid #80808059;border-radius:7px;padding:3px 6px}
/* Sized to the figure it holds, not to the row: a four-or-five digit price on
   a 390px phone screen next to Restore and Delete, which is where these are
   filled in. It shrinks but does not grow, so it yields before the name does. */
.pf-jobs-lostto{font:inherit;font-size:.85rem;color:inherit;background:transparent;
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
</style>`;

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
  </p>
  <div class="pf-jobs-panel" id="pf-jobs-panel" hidden>
    <p>Keep this bid so it is still here when the customer calls back. Every number on this form is saved together, under a name you choose, along with the figure it gave you, and restoring one puts the whole job back exactly as you priced it. Mark each one won or lost when you hear &mdash; the ones you have not heard back on stay listed as waiting, with how long they have been out. Once a few have come back, this panel says how long yours actually take, and how many are still out past that.${withPriceBand ? ' Once a few here are decided, this panel says what the ones you won averaged against the ones you lost, so you can see where your price tips. On a lost bid you can also note what the job went for, if you heard &mdash; then it says how far off you actually were, which is the part guessing gets wrong in both directions.' : ''}</p>
    <div class="pf-jobs-save">
      <label class="pf-jobs-label" for="pf-jobs-name">Name this bid</label>
      <input type="text" id="pf-jobs-name" maxlength="60" autocomplete="off" placeholder="e.g. 14 Oak St — Mrs Reid">
      <button type="button" data-pf-jobs="save">Save this bid</button>
    </div>
    <p class="pf-jobs-summary" id="pf-jobs-summary" hidden></p>
    <p class="pf-jobs-chase" id="pf-jobs-chase" hidden></p>${withPriceBand ? `
    <p class="pf-jobs-band" id="pf-jobs-band" hidden></p>
    <p class="pf-jobs-band pf-jobs-gap" id="pf-jobs-gap" hidden></p>` : ''}
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

  var bandShown = '';
  var gapShown = '';
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

    var fields = formFields();
    var byId = {};
    for (var i = 0; i < fields.length; i++) byId[fields[i].id] = fields[i];

    // Atomic or refused. See the header of this module: a partial write leaves
    // a form that prices a real but different job, which is worse than not
    // restoring at all because it looks finished.
    var missing = [], extra = [];
    for (var id in bid.fields) {
      if (Object.prototype.hasOwnProperty.call(bid.fields, id) && !byId[id]) missing.push(id);
    }
    for (var k = 0; k < fields.length; k++) {
      if (!Object.prototype.hasOwnProperty.call(bid.fields, fields[k].id)) extra.push(fields[k].id);
    }

    if (missing.length > 0 || extra.length > 0) {
      bump('bid_restore_refused');
      var parts = [];
      if (missing.length > 0) parts.push(missing.length + ' the form does not have');
      if (extra.length > 0) parts.push(extra.length + ' the form has that this bid never priced');
      say(
        'Not restored. “' + bid.name + '” has ' + parts.join(', and ') +
        '. Add or remove rows until the form matches the job you saved, then restore again — ' +
        'a partly restored bid would price a different job.'
      );
      return;
    }

    var written = 0;
    for (var id2 in bid.fields) {
      if (!Object.prototype.hasOwnProperty.call(bid.fields, id2)) continue;
      var node = byId[id2];
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
  var lostToBox = function(index){
    return document.querySelector('[data-pf-jobs-lostto][data-pf-jobs-index="' + index + '"]');
  };

  // Only when the box still had focus, which is what tells the two callers
  // apart. 'change' fires on blur as well as on Enter, and refocusing after a
  // blur would drag the caret back out of whatever the visitor had just tabbed
  // to — a worse bug than the one this fixes.
  var reFocusLostTo = function(state){
    if (!state || !state.had) return;
    var box = lostToBox(state.index);
    if (!box) return;
    try {
      box.focus();
      var at = Math.min(state.caret == null ? box.value.length : state.caret, box.value.length);
      box.setSelectionRange(at, at);
    } catch (e) {}
  };

  var focusState = function(index){
    var box = lostToBox(index);
    var had = !!box && document.activeElement === box;
    var caret = null;
    if (had) { try { caret = box.selectionStart; } catch (e) {} }
    return { index: index, had: had, caret: caret };
  };

  var setLostTo = function(index, value){
    var focus = focusState(index);
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
      var box = lostToBox(index);
      if (box) box.value = typed;
      reFocusLostTo(focus);
      say('Could not read “' + typed + '” as a price, so the figure for “' + bid.name +
        '” is unchanged. Enter what the job went for as a plain amount, like 1900 or 1900.50.');
      return;
    }

    var before = bid.lostTo || '';
    if (went) bid.lostTo = went; else delete bid.lostTo;
    if (before === (went || '')) { render(); reFocusLostTo(focus); return; }

    if (!writeMine(list)) { say('This browser would not update its storage.'); return; }
    render();
    reFocusLostTo(focus);
    bump(went ? 'bid_lost_to_set' : 'bid_lost_to_cleared');
    say(went
      ? 'Noted: “' + bid.name + '” went for ' + went + '.'
      : 'Cleared what “' + bid.name + '” went for.');
  };

  var remove = function(index){
    var list = mine();
    var bid = list[index];
    if (!bid) { render(); return; }
    list.splice(index, 1);
    if (!writeMine(list)) { say('This browser would not update its storage.'); return; }
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
      if (!state && !field.hasAttribute('data-pf-jobs-lostto')) return;
      var index = Number(field.getAttribute('data-pf-jobs-index'));
      if (!isFinite(index)) return;
      if (state) setOutcome(index, field.value); else setLostTo(index, field.value);
    });

    el('pf-jobs-panel').addEventListener('keydown', function(event){
      // Same reason as the name box above: Enter inside a page-level form would
      // submit it and reload the page.
      if (event.key !== 'Enter') return;
      var field = event.target;
      if (!field || !field.hasAttribute || !field.hasAttribute('data-pf-jobs-lostto')) return;
      event.preventDefault();
      var index = Number(field.getAttribute('data-pf-jobs-index'));
      if (isFinite(index)) setLostTo(index, field.value);
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

  const withStyle = declared.replace(/<\/head>/i, `${JOBS_STYLE}\n</head>`);
  // A page with no <head> still gets the stylesheet, ahead of the bar it styles.
  const stylePrefix = withStyle === declared ? `${JOBS_STYLE}\n` : '';

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
  // Escaped, not interpolated. The slug used to be JSON-encoded into a string
  // literal; it is now an attribute value, so the character that would break
  // out of it is a different one and the guard has to move with it.
  const attr = (value) => String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const tag = `<script type="module" src="${attr(toRoot + SAVED_BIDS_MODULE_FILE)}"` +
    ` ${JOBS_SLUG_ATTR}="${attr(slug)}" ${JOBS_AMOUNT_ATTR}="${attr(amountSelector)}"></script>`;

  return anchored.replace(/<\/body>/i, `${tag}\n</body>`);
}
