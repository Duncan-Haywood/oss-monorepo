// Hand a priced bid to another person, and prove they are looking at the same
// number you sent.
//
// Why this exists
// ---------------
// A contractor prices a job here and then has to get that price to somebody
// else — the homeowner, the spouse who was not at the walkthrough, the GC who
// asked for a number by Friday. `platform/proposal` covers the formal half of
// that (a printable customer document), and `jobs.mjs` covers keeping the bid
// for yourself. Neither hands the *live tool* to the other person, so the thing
// the recipient receives is a flat figure they cannot ask a question of. "What
// if we skip the tear-off" costs another phone call.
//
// Fifty-eight pages already answered this with a per-venture `share.mjs`: an
// allowlist of field names encoded into the URL hash. That works, and it is
// where this feature's shape comes from. What it does not do is scale or stay
// correct:
//
//   * **It is absent on more pages than it is present.** 159 of the 234 pages
//     with a form have no share control at all, and every calculator that lands
//     on `main` — most days — lands without one.
//   * **The allowlist drifts from the form.** This is the recorded defect, not
//     a hypothetical: `share.mjs` carried its own field list, a calculator grew
//     `quantity` and `targetMargin`, the list did not, and a shared link
//     silently dropped both. The recipient computed a different profit than the
//     sender saw, and nothing anywhere said so.
//
// So this derives the field set from the form itself, at the moment the link is
// made, exactly as `jobs.mjs` collects fields for a saved bid — there is no
// list to keep in step, and a field added to a calculator tomorrow rides in the
// link with no edit here. Injected at build time for the two reasons the chrome,
// the shop-rates bar and the saved-bids band are: a new calculator is covered
// for free, and the same edit committed into 159 product files would conflict
// with nearly every open branch.
//
// The guarantee that makes a shared link worth sending
// ----------------------------------------------------
// A link carries the sender's headline figure alongside the fields, and the
// recipient's page checks the number it recomputed against it. That check is
// the whole point. Every failure mode above — the dropped field, the form that
// gained a row, the calculator whose constants changed between the two visits —
// ends the same way: two people reading one price and seeing different money.
// Silence is what made the `quantity` bug expensive. Here the page says so.
//
// Three outcomes, and the page states which one happened:
//
//   * **Match.** The fields applied and the figure agrees. The recipient is
//     told the number came from the sender, and can reprice freely from there.
//   * **Applied, figure differs.** Everything was written, but this page
//     computes something else. The link is still useful — the inputs are real —
//     and the visitor is warned not to quote from it until they know why.
//   * **Refused.** The link's field set is not this form's field set, so
//     writing the overlap would leave a form that prices a *different, smaller*
//     job than the sender priced. Nothing is written. This is the same
//     atomic-or-refused rule a saved-bid restore follows, for the same reason.
//
// Where it is not offered
// -----------------------
// Two exclusions, both at build time, both so the control is never drawn where
// it would work badly:
//
//   * **Pages with their own share link.** A second button beside `copyShare`,
//     writing a second hash format, is worse than the drift it fixes. Those 58
//     keep what they have.
//   * **Pages that build their fields in script.** The itemised calculators
//     (flooring by room, tree service by tree) create inputs at runtime, so a
//     recipient's blank form has one row where the sender had four. The field
//     sets cannot match and the honest outcome would be a link that always
//     refuses. A dead link is worse than no button, so those pages get neither.

import {
  EXCLUDED_FIELD_IDS,
  normalizeHeadlineAmount,
  pageTakesSavedBids,
  restoreMismatch,
  stripForInjection,
} from './jobs.mjs';

/**
 * The hash namespace.
 *
 * Prefixed rather than bare, unlike the per-venture `share.mjs` which puts raw
 * encoded JSON straight after the `#`. Two reasons, and the second is why this
 * could not simply copy the older spelling: these pages already use the
 * fragment as an anchor — the hub links a saved bid to `/<slug>/#pf-jobs` — and
 * a bare payload would be indistinguishable from a heading anchor. A prefix
 * makes "is this a bid link" a question with an answer.
 */
export const BID_LINK_PREFIX = 'bid=';

/** Ceiling on fields in one link, well above the widest form here (~40). */
export const MAX_LINK_FIELDS = 120;

/** Ceiling on one field's value, so a crafted hash cannot balloon a page. */
export const MAX_LINK_VALUE = 512;

const LINK_MARKER = 'pf-link';

// The two things the shared script cannot know until it is on a page: which
// venture it is running inside, and which element holds that tool's headline
// figure. Carried on the tag rather than baked into the source, which is what
// lets one file serve all 159 pages. Read with `querySelector` and not
// `document.currentScript`, which is `null` in a module script.
const LINK_SLUG_ATTR = 'data-pf-link-slug';
const LINK_AMOUNT_ATTR = 'data-pf-link-amount';

/**
 * Values a form control can hold, as carried in a link.
 *
 * Strings are `input`/`select`/`textarea` values; booleans are the checked
 * state of a checkbox or radio. The same two types `jobs.mjs` stores, because
 * both features read and write the same controls and a third type in one of
 * them would mean a bid that saves but will not send.
 */
function normalizeLinkValue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.length > MAX_LINK_VALUE ? null : value;
  return null;
}

/**
 * Is this a value the cap turned away, rather than one that was never carriable?
 *
 * The distinction decides whether a link opens at all, and getting it wrong
 * killed the feature outright on `security-camera-bid-calculator`. Its proposal
 * scope draft is generated from the priced job and runs past 512 characters, so
 * the encoder dropped it — correctly, a fragment is not the place for prose —
 * and the decoder then found one control on the form that the link did not
 * mention. That is the signature of a link written by a *different* tool, so the
 * guard refused the whole bid and told the recipient to ask the sender what
 * tool they used. On every link the page itself had just written.
 *
 * A field the sender's own encoder set aside for length is not a disagreement
 * about what this form is. It is a known omission, and naming it in the payload
 * is what lets the guard keep its teeth for the case it was built for.
 */
function omittedForLength(value) {
  return typeof value === 'string' && value.length > MAX_LINK_VALUE;
}

/**
 * Is this an id the link may carry?
 *
 * Mirrors `jobs.mjs`'s exclusions — its own controls, and the usage opt-out,
 * which is a visitor's standing preference about this site rather than a number
 * in a bid and must never be set by somebody else's link.
 */
export function isLinkableId(id) {
  if (typeof id !== 'string' || id === '') return false;
  if (id.startsWith('pf-')) return false;
  return !EXCLUDED_FIELD_IDS.has(id);
}

/**
 * Fields and figure into a fragment.
 *
 * `v` is a format version. Nothing reads it yet beyond rejecting what it does
 * not recognise, which is the point: a link a contractor emails on Tuesday may
 * be opened next spring, and a page that cannot tell an old payload from a
 * corrupt one has to guess. Guessing here means writing half a bid.
 *
 * Returns `''` when there is nothing worth sending, so a caller can refuse to
 * make a link rather than producing one that opens an empty form.
 */
export function encodeBidLink(input) {
  const fields = input && typeof input === 'object' ? input.fields : null;
  if (!fields || typeof fields !== 'object') return '';

  const out = {};
  const omitted = [];
  let count = 0;
  for (const id of Object.keys(fields)) {
    if (!isLinkableId(id)) continue;
    const value = normalizeLinkValue(fields[id]);
    if (value === null) {
      // Named, not silently skipped — see `omittedForLength`.
      if (omittedForLength(fields[id]) && omitted.length < MAX_LINK_FIELDS) omitted.push(id);
      continue;
    }
    if (count >= MAX_LINK_FIELDS) break;
    out[id] = value;
    count++;
  }
  if (count === 0) return '';

  const payload = { v: 1, f: out };
  if (omitted.length > 0) payload.o = omitted;
  const amount = normalizeHeadlineAmount(
    typeof input.amount === 'string' ? input.amount : '');
  if (amount) payload.a = amount;

  return BID_LINK_PREFIX + encodeURIComponent(JSON.stringify(payload));
}

/**
 * A fragment back into fields and figure, or `null` if it is not one of ours.
 *
 * Every value is re-validated on the way in rather than trusted because it
 * arrived in a URL the sender wrote. A fragment is the one part of these pages
 * a stranger can set, so this treats it as hostile: unknown version, wrong
 * shape, an id the form would not have offered, or a value of the wrong type
 * all drop out here rather than reaching a control.
 */
export function decodeBidLink(hash) {
  if (typeof hash !== 'string') return null;
  const raw = hash.replace(/^#/, '');
  if (!raw.startsWith(BID_LINK_PREFIX)) return null;

  let parsed;
  try {
    parsed = JSON.parse(decodeURIComponent(raw.slice(BID_LINK_PREFIX.length)));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (parsed.v !== 1) return null;
  const source = parsed.f;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;

  const fields = {};
  let count = 0;
  for (const id of Object.keys(source)) {
    if (!isLinkableId(id)) continue;
    const value = normalizeLinkValue(source[id]);
    if (value === null) continue;
    if (count >= MAX_LINK_FIELDS) break;
    fields[id] = value;
    count++;
  }
  if (count === 0) return null;

  // Re-validated like any other id from a stranger's URL: only names this form
  // could have offered, and never more than a form's worth of them.
  const omitted = Array.isArray(parsed.o)
    ? parsed.o.filter((id) => isLinkableId(id)).slice(0, MAX_LINK_FIELDS)
    : [];

  const amount = normalizeHeadlineAmount(typeof parsed.a === 'string' ? parsed.a : '');
  const result = { fields };
  if (omitted.length > 0) result.omitted = omitted;
  if (amount) result.amount = amount;
  return result;
}

/**
 * Which fields the link has that this form does not, and the reverse.
 *
 * The same function a saved-bid restore uses, deliberately: both are asking the
 * one question that decides whether writing is safe, and two spellings of it
 * would be two chances to answer differently.
 */
export function linkFieldMismatch(linkIds, formIds) {
  return restoreMismatch(linkIds, formIds);
}

/**
 * Does the sender's figure agree with what this page now shows?
 *
 * Compared as the normalized display strings rather than as parsed numbers, and
 * that is the conservative choice: `normalizeHeadlineAmount` already collapses
 * whitespace and rejects anything without a currency mark and a non-zero digit,
 * so two strings that survive it and match are the same rendered figure. Going
 * through `parseFloat` instead would call "$1,800" and "$1,800.40" equal on the
 * pages that render a thousands separator, which is exactly the near-miss this
 * check exists to catch.
 *
 * Unknown either side is not a mismatch — an old link carries no figure, and a
 * page whose hero has not resolved yet has nothing to disagree with. The visitor
 * is told the fields applied and nothing is claimed about the number.
 */
export function bidAmountAgrees(sent, shown) {
  const a = normalizeHeadlineAmount(typeof sent === 'string' ? sent : '');
  const b = normalizeHeadlineAmount(typeof shown === 'string' ? shown : '');
  if (!a || !b) return null;
  return a === b;
}

/**
 * Does this page already ship its own share control?
 *
 * Matched on the three things every one of the 58 hand-written adopters
 * carries: the button id, the module import, and the button's label. Any one of
 * them is enough — they are spelled consistently across those pages, and a page
 * that has even one is a page where a second button would confuse.
 */
export function pageHasOwnShareLink(html) {
  if (typeof html !== 'string') return false;
  return /id="copyShare"/.test(html)
    || /share\.mjs/.test(html)
    || /Copy share link/.test(html);
}

/**
 * Does this page build form controls in script?
 *
 * Detected as an `id` attribute containing a template-literal interpolation,
 * which is how every itemised calculator here spells a generated row
 * (`id="${prefix}-lengthFt"`). `pageSaveableFieldIds` already skips exactly
 * these ids when it scans the markup, so this is the same signal read for the
 * opposite purpose: there, "do not save a field that is not really there";
 * here, "do not offer a link that could never match this form".
 */
export function pageBuildsFieldsAtRuntime(html) {
  if (typeof html !== 'string') return false;
  return /\bid\s*=\s*(?:"[^"]*\$\{|'[^']*\$\{|`[^`]*\$\{|\$\{)/.test(html);
}

/**
 * Should the bid-link control be drawn on this page?
 *
 * `hasShareModule` is the venture's `share.mjs` on disk, passed by the build
 * because the markup cannot always answer the question `pageHasOwnShareLink`
 * asks. `freelance-retainer-calculator` keeps its whole script in `app.js`, so
 * the import, the button id (`share`) and the label ("Copy shareable link") are
 * all outside the html — and it shipped with its own button *and* this one,
 * writing two hash formats side by side, which is the exact thing that gate
 * exists to prevent. A file in the venture's directory is a fact; a string in
 * its markup was only ever a proxy for one.
 */
export function pageTakesBidLink(html, { hasShareModule = false } = {}) {
  if (typeof html !== 'string') return false;
  if (!pageTakesSavedBids(html)) return false;
  if (hasShareModule) return false;
  if (pageHasOwnShareLink(html)) return false;
  return !pageBuildsFieldsAtRuntime(html);
}

/**
 * Say so in the structured data.
 *
 * The precedent is #1894, where the customer proposal shipped on 100
 * calculators and named itself in none of them, so the portfolio's largest
 * feature was invisible to the only channel that brings these tools traffic.
 * This one ships on 159 pages and would have repeated it.
 *
 * The phrase names the guarantee and not just the capability, because "share a
 * link" is what the other 58 pages already claim and is not the interesting
 * part. The check is.
 */
export const BID_LINK_CLAUSE =
  'a link that hands this bid to the customer with every figure in it, which tells them if the price their browser works out is not the one you sent';

/** Both spellings of the feature list, matched as `jobs.mjs` matches them. */
const FEATURE_LIST_RE = /("featureList"\s*:\s*")((?:[^"\\]|\\.)*)(")/;

/**
 * Append the clause to a page's feature list.
 *
 * Called only from `injectBidLink`, once the control is known to be going in —
 * the same coupling `addSavedBidsClause` enforces, so a page can never advertise
 * a link it does not offer. Safe to run twice, and a no-op on the pages that
 * carry no feature list at all.
 */
export function addBidLinkClause(html) {
  if (typeof html !== 'string') return html;
  if (html.includes(BID_LINK_CLAUSE)) return html;
  return html.replace(FEATURE_LIST_RE, (match, open, list, close) =>
    list.trim() === '' ? match : `${open}${list}, ${BID_LINK_CLAUSE}${close}`,
  );
}

/**
 * The two helpers the browser needs, as source.
 *
 * Through `Function.prototype.toString` rather than transcribed, for the reason
 * `jobs.mjs` learned the hard way when the hub's backup panel carried a stale
 * hand-copy of `normalizeBid` and silently dropped every outcome: the page that
 * decides whether two figures agree and the tests that decide it must not be
 * able to disagree. Written in ES5 and self-contained for the same reason those
 * are.
 */
export const BID_LINK_HELPERS = [
  `var MAX_LINK_FIELDS = ${MAX_LINK_FIELDS};`,
  `var MAX_LINK_VALUE = ${MAX_LINK_VALUE};`,
  `var BID_LINK_PREFIX = ${JSON.stringify(BID_LINK_PREFIX)};`,
  `var EXCLUDED_FIELD_IDS = new Set(${JSON.stringify([...EXCLUDED_FIELD_IDS])});`,
  ...[
    normalizeHeadlineAmount,
    normalizeLinkValue,
    omittedForLength,
    isLinkableId,
    encodeBidLink,
    decodeBidLink,
    bidAmountAgrees,
  ].map((fn) => `var ${fn.name} = ${stripForInjection(fn.toString())};`),
].join('\n');

/**
 * Scoped under `.pf-link`, taking its colours from the host page.
 *
 * Only three rules, because the control is injected *into* the saved-bids band
 * and inherits everything structural from it — see `injectBidLink`. Most
 * ventures here are light-only and carry no `prefers-color-scheme` rule, so
 * anything painted from its own palette would sit as a dark slab on a cream
 * page for a visitor with a dark OS.
 */
const LINK_STYLE = `<style>
.pf-link-note{margin:8px 0 0;font-size:.85rem;line-height:1.45;opacity:.9;
  max-width:1060px;padding:0 18px;box-sizing:border-box}
.pf-link-note[data-pf-link-warn]{opacity:1;font-weight:600}
.pf-link-note a{color:currentColor;text-decoration:underline}
@media (max-width:780px){.pf-link-note{padding:0 14px}}
/* Never printed. The note says a price came from somebody else, which is not
   part of the customer proposal these pages print and would read, on a sheet
   handed to a homeowner, as a disclaimer about the number they are being
   quoted. */
@media print{.pf-link-note{display:none !important}}
</style>`;

/** The button, added to the saved-bids band's control line. */
const LINK_BUTTON =
  '<button type="button" id="pf-link-copy" data-pf-link>Copy link to this bid</button>';

/**
 * Where the recipient is told what happened.
 *
 * Rendered at build time and only filled by script, so the element a crawler
 * sees is empty rather than absent — and so the one thing that varies (what the
 * link did) is the only thing assembled in the browser. Sits outside the
 * `.pf-jobs` band, not inside it: that band is removed wholesale by its own
 * script on a page whose form turns out too short to be a bid, and the message
 * explaining a refused link has to survive that.
 */
const LINK_NOTE = '<p class="pf-link-note" id="pf-link-note" role="status" hidden></p>';

/**
 * The browser half.
 *
 * A module script for the reason `jobs.mjs` is one: module scripts are deferred
 * and run in document order, so this one — injected last — sees a form the
 * venture's own deferred module has finished building, and a hero the venture
 * has finished computing. A classic script would run the moment it arrived,
 * read an empty figure, and report every link as disagreeing.
 *
 * Comments are sparse on purpose; this string ships on 159 pages and the
 * service worker caches all of them. The decisions worth recording:
 *
 * **The link is built on click, never on load.** A hash written eagerly would
 * put the customer's numbers in the address bar of a contractor who never asked
 * to share anything, where the browser keeps it in history and the next person
 * at that laptop reads it.
 *
 * **Applying is atomic or refused**, and the refusal names the count each way.
 * Writing the overlap of two field sets leaves a form that computes a real,
 * plausible, smaller job than the one sent — the failure mode that is worse
 * than an error, because it looks like an answer.
 *
 * **The figure is compared after the venture's own module has recomputed**, on
 * the next frame rather than synchronously: every calculator here recomputes
 * from an `input` or `change` listener, and reading the hero in the same tick
 * as the dispatch reads the value from before the link was applied.
 */
const LINK_SCRIPT = () => `
${BID_LINK_HELPERS}
(function(){
  var tag = document.querySelector('script[${LINK_AMOUNT_ATTR}]');
  var amountSelector = tag ? tag.getAttribute('${LINK_AMOUNT_ATTR}') || '' : '';

  var note = document.getElementById('pf-link-note');
  var button = document.getElementById('pf-link-copy');

  var say = function(message, warn){
    if (!note) return;
    note.textContent = message;
    if (warn) note.setAttribute('data-pf-link-warn', ''); else note.removeAttribute('data-pf-link-warn');
    note.hidden = false;
  };

  var bump = function(event){
    try {
      if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
      if (localStorage.getItem('portfolio-hub-optout') === '1') return;
      var k = 'portfolio-hub-usage';
      var counts = JSON.parse(localStorage.getItem(k) || '{}');
      counts[event] = (counts[event] || 0) + 1;
      counts.last_day = new Date().toISOString().slice(0, 10);
      localStorage.setItem(k, JSON.stringify(counts));
    } catch (e) {}
  };

  var UNSHAREABLE = ['button', 'submit', 'reset', 'file', 'image', 'password'];

  var formFields = function(){
    var out = [];
    var nodes = document.querySelectorAll('input[id], select[id], textarea[id]');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!isLinkableId(node.id)) continue;
      if (node.tagName === 'INPUT' && UNSHAREABLE.indexOf((node.type || 'text').toLowerCase()) !== -1) continue;
      if (node.closest('[data-pf-jobs-root]')) continue;
      out.push(node);
    }
    return out;
  };

  var isToggle = function(node){
    return node.tagName === 'INPUT' && (node.type === 'checkbox' || node.type === 'radio');
  };

  var shownAmount = function(){
    if (!amountSelector) return '';
    var hero = document.querySelector(amountSelector);
    return hero ? String(hero.textContent || '') : '';
  };

  var readForm = function(){
    var fields = formFields();
    var values = {};
    for (var i = 0; i < fields.length; i++) {
      values[fields[i].id] = isToggle(fields[i]) ? !!fields[i].checked : String(fields[i].value);
    }
    return values;
  };

  var copy = function(){
    var values = readForm();
    var fragment = encodeBidLink({ fields: values, amount: shownAmount() });
    if (!fragment) { say('There is no bid on this form to send yet.', true); return; }

    // "Every number on this form" has to stay true. A long block of prose is
    // not a number and does not fit in a URL, and the sender is told which one
    // stayed behind rather than finding out from the recipient.
    var long = [];
    for (var key in values) {
      if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
      if (typeof values[key] === 'string' && values[key].length > MAX_LINK_VALUE) long.push(key);
    }
    var caveat = long.length
      ? ' Your ' + long.join(', ') + (long.length === 1 ? ' is' : ' are') +
        ' too long to fit in a link and stayed behind; paste ' +
        (long.length === 1 ? 'it' : 'them') + ' separately if the wording matters.'
      : '';

    var url = location.origin + location.pathname + location.search + '#' + fragment;
    var done = function(){
      bump('bid_link_copied');
      say('Link copied. It carries every number on this form, and the page it opens will say if the figure it works out is not the one you are sending. Nothing was uploaded — the whole bid rides in the link itself.' + caveat, false);
    };
    var fallback = function(){
      try {
        location.hash = fragment;
        say('This browser would not copy for us, so the link is in the address bar above — copy it from there. It carries every number on this form.', true);
      } catch (e) {
        say('This browser would not build a link for this bid.', true);
      }
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, fallback);
      } else { fallback(); }
    } catch (e) { fallback(); }
  };

  var apply = function(incoming){
    var fields = formFields();
    var byId = {};
    var formIds = [];
    for (var i = 0; i < fields.length; i++) { byId[fields[i].id] = fields[i]; formIds.push(fields[i].id); }

    var linkIds = Object.keys(incoming.fields);
    var form = {}; var link = {};
    for (var f = 0; f < formIds.length; f++) form[formIds[f]] = 1;
    for (var l = 0; l < linkIds.length; l++) link[linkIds[l]] = 1;
    // A field the sender's encoder set aside for length is accounted for: the
    // link says so by name. It is not a control this form has and the link had
    // never heard of, which is the only thing the guard below is asking about.
    var skipped = incoming.omitted || [];
    for (var s = 0; s < skipped.length; s++) link[skipped[s]] = 1;

    var missing = []; var extra = [];
    for (var m = 0; m < linkIds.length; m++) if (!form[linkIds[m]]) missing.push(linkIds[m]);
    for (var e = 0; e < formIds.length; e++) if (!link[formIds[e]]) extra.push(formIds[e]);

    if (missing.length > 0 || extra.length > 0) {
      var parts = [];
      if (missing.length > 0) parts.push(missing.length + ' this form does not have');
      if (extra.length > 0) parts.push(extra.length + ' this form has that the link never priced');
      say(
        'This bid link was not opened. It carries ' + parts.join(', and ') +
        ', so the numbers in it do not describe the job this form would price. ' +
        'Nothing on the page was changed — ask whoever sent it for the tool they used, ' +
        'because a partly opened bid would show a different price than they sent.',
        true
      );
      bump('bid_link_refused');
      return;
    }

    var written = 0;
    for (var id in incoming.fields) {
      if (!Object.prototype.hasOwnProperty.call(incoming.fields, id)) continue;
      var node = byId[id];
      var value = incoming.fields[id];
      if (isToggle(node)) node.checked = !!value; else node.value = String(value);
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
      written++;
    }
    bump('bid_link_opened');

    // Said rather than left to be noticed: the numbers are the bid, but a
    // recipient who sees an empty scope box should know it was too long to
    // travel and not that the sender left it blank.
    var left = skipped.length
      ? ' The sender\\'s ' + skipped.join(', ') + (skipped.length === 1 ? ' was' : ' were') +
        ' too long to fit in a link, so ' + (skipped.length === 1 ? 'it is' : 'they are') +
        ' this page\\'s own wording below.'
      : '';

    var settle = function(){
      var agrees = bidAmountAgrees(incoming.amount, shownAmount());
      if (agrees === true) {
        say('Opened from a shared bid — ' + written + ' fields, and this page works out the same ' +
          incoming.amount + ' the sender saw. Change anything below to reprice it.' + left, false);
      } else if (agrees === false) {
        say('Opened from a shared bid — ' + written + ' fields. The sender saw ' + incoming.amount +
          ' and this page works out ' + shownAmount().replace(/\\s+/g, ' ').trim() +
          '. Do not quote either figure until you know why they differ: the tool may have changed ' +
          'since the link was made, or a number in it may not have carried.', true);
        bump('bid_link_amount_differs');
      } else {
        say('Opened from a shared bid — ' + written + ' fields written to the form below. ' +
          'The link did not carry the figure the sender saw, so this page cannot confirm it matches.' + left, false);
      }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(settle); else setTimeout(settle, 0);
  };

  var start = function(){
    if (button) {
      if (formFields().length === 0) { button.remove(); } else {
        button.addEventListener('click', copy);
      }
    }
    var incoming = decodeBidLink(location.hash);
    if (incoming) apply(incoming);
  };

  start();
})();
`;

/** One file at the site root, loaded by every page that offers the control. */
export const BID_LINK_MODULE_FILE = 'pf-link.js';

/** The contents of that file, stripped of its prose. */
export function renderBidLinkModule() {
  return `${stripForInjection(LINK_SCRIPT())}\n`;
}

/**
 * Add the bid-link control to one already-published page.
 *
 * Runs **after** `injectSavedBids` and depends on it: the button is appended to
 * that band's control line rather than drawn in a band of its own, so the two
 * read as one bar — your bids, and the link that sends this one. A third band
 * stacked above the form would cost a line of vertical space on a phone for a
 * single button.
 *
 * That dependency is a real one and is checked, not assumed: a page without the
 * saved-bids line gets nothing. Both features are gated on `pageTakesSavedBids`,
 * so the only way to reach that branch is a future change to one gate and not
 * the other — which should fail closed rather than scatter an orphaned button.
 *
 * Returns the html unchanged when the control is already there, so the pass is
 * safe to run twice.
 *
 * `source` is the page as it stood *before* the saved-bids band was added, and
 * is what the gate reads. The edit is made to `html`, which is the only copy
 * carrying the line to hang the button on. Keeping them apart is what stops a
 * later band that happens to inject a control, or an inline script holding a
 * template literal, from changing whether this feature is offered — the
 * question is about the venture's form, and only the venture's form should be
 * able to answer it. Defaults to `html` so a caller with one copy still works.
 */
export function injectBidLink(html, options = {}) {
  const {
    slug = '', toRoot = './', amountSelector = '', source = html, hasShareModule = false,
  } = options;
  if (typeof html !== 'string') return html;
  if (html.includes(LINK_MARKER)) return html;
  const gate = typeof source === 'string' ? source : html;
  if (!pageTakesBidLink(gate, { hasShareModule })) return html;
  if (!/<\/body>/i.test(html)) return html;

  const line = html.match(/<p class="pf-jobs-line">[\s\S]*?<\/p>/i);
  if (!line) return html;

  // The claim goes in with the feature, never on its own. See the clause above.
  const declared = addBidLinkClause(html);

  const withStyle = declared.replace(/<\/head>/i, `${LINK_STYLE}\n</head>`);
  // A page with no <head> still gets the stylesheet, ahead of what it styles.
  const stylePrefix = withStyle === declared ? `${LINK_STYLE}\n` : '';

  // Re-matched against the declared copy: `addBidLinkClause` may have rewritten
  // bytes ahead of the line, which would make the earlier match's offsets stale.
  const anchor = withStyle.match(/<p class="pf-jobs-line">[\s\S]*?<\/p>/i);
  if (!anchor) return html;
  const withButton = withStyle.replace(
    anchor[0],
    `${stylePrefix}${anchor[0].replace(/<\/p>$/i, `  ${LINK_BUTTON}\n  </p>`)}`,
  );

  // The note sits after the whole saved-bids band, so it survives that band
  // being removed by its own script — see `LINK_NOTE`.
  const band = withButton.match(/<section class="pf-jobs"[\s\S]*?<\/section>/i);
  const withNote = band
    ? withButton.replace(band[0], `${band[0]}\n${LINK_NOTE}`)
    : withButton;

  const attr = (value) => String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const tag = `<script type="module" src="${attr(toRoot + BID_LINK_MODULE_FILE)}"` +
    ` ${LINK_SLUG_ATTR}="${attr(slug)}" ${LINK_AMOUNT_ATTR}="${attr(amountSelector)}"></script>`;

  return withNote.replace(/<\/body>/i, `${tag}\n</body>`);
}
