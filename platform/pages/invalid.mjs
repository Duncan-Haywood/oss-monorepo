// Highlights the input a calculator is actually complaining about.
//
// Why this exists
// ---------------
// 103 tools on this site refuse to price a job like this:
//
//     Wood privacy, 6 ft: linear feet must be at least 0
//     check the highlighted input
//
// The first line is the hero number, replaced by the message. The second is the
// label under it. Measured in Chromium on 2026-08-29 against
// `fence-bid-calculator`, nothing on the page is highlighted when that appears:
// no `aria-invalid`, no outline, no focus move. The sentence names a promise the
// family has never kept, on every one of the 103 pages that prints it — 9 of
// them mark a field for some *other* reason, and not one marks the field this
// message is about.
//
// The cost is not cosmetic. These forms carry twenty to forty numeric inputs and
// several repeated rows: `fence-bid-calculator` opens with 26 visible number
// fields, and a run row can be added for every fence line on the property. A
// contractor who fat-fingers a minus sign into one of them gets a sentence, an
// instruction to look at a highlight that does not exist, and no price. On a
// phone, the offending field is usually scrolled off-screen entirely. The
// recovery path from a typo is the second most-travelled path through these
// tools after the happy one, and it dead-ends.
//
// So: read the message the calculator wrote, find the field it names, and mark
// it. Nothing here invents validation of its own — the calculator remains the
// only thing that decides what is wrong. This only answers "which box?", which
// is the half the message cannot express and the page already claims to have
// answered.
//
// Injected at build time rather than written into each venture, for the two
// reasons `injectShopRates` and `injectChrome` give: a calculator lands on
// `main` most days and the injection covers each new one for free, and the same
// edit committed into 103 concurrently-edited product files would conflict with
// nearly every open branch.

import { stripForInjection } from './jobs.mjs';

/**
 * The sentence the family prints, verbatim.
 *
 * This is the gate as well as the trigger: a page that does not promise a
 * highlight is left alone, so the injection lands on exactly the pages whose
 * promise is currently unkept, and on a new calculator the day it copies the
 * line. Matched case-insensitively at runtime but searched for literally in the
 * source, which is how all 103 spell it.
 */
export const HIGHLIGHT_PROMISE = 'check the highlighted input';

/**
 * What the label is rewritten to when the message names no field this page has.
 *
 * Some messages are about the form as a whole — "Add at least one fence run to
 * price" — and no highlight can answer them. Leaving the original sentence there
 * would keep the page pointing at a highlight it did not draw, which is the
 * defect this file exists to remove; it is not less of a lie when it is only
 * sometimes told.
 */
export const NO_FIELD_LABEL = 'check the values you entered';

const MARKER = 'pf-invalid';

/** Written into the tool page; the runtime file at the site root. */
export const INVALID_MODULE_FILE = 'pf-invalid.mjs';
export const INVALID_STYLE_FILE = 'pf-invalid.css';

const attr = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------
// Matching a message to a field
//
// These four are pure and exported so they can be tested here in node rather
// than only through a browser, and their *source* is what ships (see
// `INVALID_HELPERS`) so the page runs the tested body rather than a hand-copied
// paraphrase of it. `jobs.mjs` established that convention after a transcribed
// copy of `normalizeBid` went stale.
// ---------------------------------------------------------------------------

/**
 * Words that carry no identity, so an overlap on them is not evidence.
 *
 * "Hours per post" and "hours per walk gate" share two of three words, and both
 * share "per" with every rate field on the page.
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'per', 'and', 'or', 'to', 'in', 'for', 'on', 'at',
  'your', 'you', 'this', 'is', 'be', 'each', 'any', 'with',
]);

/**
 * The phrases a validation sentence uses to turn from naming a field to saying
 * what is wrong with it. Everything before the earliest one is the field.
 *
 * Drawn from the `throw new Error` bodies across `ventures/*\/calc.mjs`:
 * "must be a number", "must be at least 0", "must be a whole number", "cannot
 * exceed 100%", "must be greater than zero".
 */
const CONNECTIVES = [
  ' must ', ' cannot ', ' can not ', " can't ", ' can’t ', ' has to ',
  ' needs to ', ' should ', ' may not ', ' is not ', ' are not ', ' exceeds ',
];

/**
 * The abbreviations a form uses and a validation message does not.
 *
 * Measured, not guessed: `countertop-bid-calculator` labels its field "Finished
 * top sq ft" and rejects it with "Finished square feet must be at least 0", and
 * eleven of the twelve tools that first failed to match differed only in this
 * way. The form is short because it is a form; the sentence is long because it
 * is a sentence.
 *
 * An entry may expand into several words — "lf" is "linear feet" — so this maps
 * a token to a list.
 */
const SYNONYMS = new Map(Object.entries({
  sq: ['square'], sqft: ['square', 'feet'], ft: ['feet'], foot: ['feet'],
  lf: ['linear', 'feet'], sf: ['square', 'feet'], lin: ['linear'],
  yd: ['yards'], yds: ['yards'], cy: ['cubic', 'yards'], sy: ['square', 'yards'],
  hr: ['hours'], hrs: ['hours'], h: ['hours'], hour: ['hours'],
  qty: ['count'], num: ['count'], ea: ['each'],
  pct: ['percent'], percentage: ['percent'],
  lb: ['pounds'], lbs: ['pounds'],
  mi: ['miles'], amt: ['amount'], avg: ['average'],
  // Deliberately absent: `min`, which is "minutes" on a cleaning tool and
  // "minimum" on every tool that has a minimum charge. An expansion that is
  // wrong half the time is worse than no expansion.
}).map(([key, value]) => [key, value]));

/**
 * Crude singular folding, so "walk gates" and "walk gate" are the same word.
 *
 * Not a stemmer: it only removes a trailing plural `s` from a word long enough
 * that the `s` is unlikely to be the word. "Hours" keeps its meaning as
 * "hour"; "gas" and "loss" are left alone.
 */
function singular(word) {
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/**
 * Text reduced to the words worth comparing.
 *
 * The bracketed unit is kept, not dropped. Dropping it looked right — "Payroll
 * burden (%)" is the burden whether or not the sign is there — but on
 * `deck-staining-bid-calculator` the label is "Walking surface (sq ft)" and the
 * rejection is "Deck square feet must be at least 0", where the unit is the
 * *only* thing the two have in common. It is also what separates a "(sq ft)"
 * field from the "(lf)" one beside it. A punctuation-only unit like "%" leaves
 * nothing behind anyway.
 */
export function normalizeLabel(text) {
  return String(text ?? '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

/**
 * The normalized words of `text`, minus the ones that carry no identity, with
 * abbreviations expanded and plurals folded.
 */
export function labelWords(text) {
  const out = [];
  for (const raw of normalizeLabel(text).split(' ')) {
    // Tested before folding: `singular('this')` is "thi", which is in no stop
    // list and would have re-admitted every stop word ending in an s.
    if (!raw || STOP_WORDS.has(raw)) continue;
    for (const word of (SYNONYMS.get(raw) ?? [raw])) {
      if (!STOP_WORDS.has(word)) out.push(singular(word));
    }
  }
  return out;
}

/**
 * Split a validation message into the row it is about and the field it names.
 *
 * `scope` is the row label a repeated-row calculator prefixes — "Wood privacy,
 * 6 ft: linear feet must be at least 0" — and is what tells two identical
 * "Linear feet" inputs apart. `subject` is the field name with the complaint
 * removed.
 *
 * A message with no connective keeps its whole text as the subject rather than
 * returning nothing, because "Add at least one fence run to price" should score
 * badly against every field rather than match the first one by accident.
 */
export function messageSubject(message) {
  const text = String(message ?? '').trim();
  if (!text) return { scope: '', subject: '' };
  let scope = '';
  let rest = text;
  const colon = text.indexOf(': ');
  if (colon > 0) {
    scope = text.slice(0, colon).trim();
    rest = text.slice(colon + 2).trim();
  }
  const lower = rest.toLowerCase();
  let cut = rest.length;
  for (const connective of CONNECTIVES) {
    const at = lower.indexOf(connective);
    if (at > 0 && at < cut) cut = at;
  }
  return { scope, subject: rest.slice(0, cut).trim() };
}

/**
 * How well a field's label answers a message's subject, from 0 to 1.
 *
 * Both directions count. Recall alone ("every word of the subject appears in
 * this label") lets a long label win on containing everything plus ten other
 * words; precision alone ("every word of this label appears in the subject")
 * lets the one-word label "Hours" beat "Hours per post" for "hours per post".
 * Recall is weighted higher because the message is the thing being explained.
 */
export function scoreMatch(subject, label) {
  const subjectWords = labelWords(subject);
  const labelList = labelWords(label);
  if (subjectWords.length === 0 || labelList.length === 0) return 0;
  const labelSet = new Set(labelList);
  const subjectSet = new Set(subjectWords);
  const recall = subjectWords.filter((word) => labelSet.has(word)).length / subjectWords.length;
  const precision = labelList.filter((word) => subjectSet.has(word)).length / labelList.length;
  return recall * 0.65 + precision * 0.35;
}

/**
 * Below this, a match is a coincidence.
 *
 * Set from the measured runs rather than by taste: at 0.5 the message "Add at
 * least one fence run to price" matched the "Linear feet" input on the strength
 * of the word "one" surviving normalization in some labels. Every genuine
 * field-naming message measured scores above 0.62.
 */
export const MATCH_FLOOR = 0.6;

/**
 * The floor when the field is already invalid by its own markup.
 *
 * A `type="number"` input holding -5 under `min="0"` has said it is wrong
 * without any help from the message, so the words only have to break a tie
 * between it and the other controls in that state. Measured on
 * `countertop-bid-calculator`, where four controls are natively invalid at once
 * and the one the message names scores 0.30 against the other three's zero:
 * under the full floor that page fell back to naming no field at all.
 */
export const INVALID_MATCH_FLOOR = 0.2;

// ---------------------------------------------------------------------------
// The browser half
// ---------------------------------------------------------------------------

/**
 * The three pure functions plus their constants, as source, for embedding.
 *
 * `Function.prototype.toString` returns the exact characters of the definition,
 * so the page runs what the tests here ran.
 */
const INVALID_HELPERS = [
  `var STOP_WORDS = new Set(${JSON.stringify([...STOP_WORDS])});`,
  `var CONNECTIVES = ${JSON.stringify(CONNECTIVES)};`,
  `var MATCH_FLOOR = ${MATCH_FLOOR};`,
  `var INVALID_MATCH_FLOOR = ${INVALID_MATCH_FLOOR};`,
  `var SYNONYMS = new Map(${JSON.stringify([...SYNONYMS])});`,
  `var singular = ${stripForInjection(singular.toString())};`,
  `var HIGHLIGHT_PROMISE = ${JSON.stringify(HIGHLIGHT_PROMISE)};`,
  `var NO_FIELD_LABEL = ${JSON.stringify(NO_FIELD_LABEL)};`,
  ...[normalizeLabel, labelWords, messageSubject, scoreMatch]
    .map((fn) => `var ${fn.name} = ${stripForInjection(fn.toString())};`),
].join('\n');

/**
 * The page script.
 *
 * Shape notes, because two of these are the difference between a help and a
 * nuisance:
 *
 * - **Nothing is focused.** The contractor is usually typing in the very field
 *   that is wrong; moving focus mid-keystroke would eat the next character.
 *   The page is scrolled to the field only when no form control has focus at
 *   all, which is the case where the visitor cannot see what to fix.
 * - **Native validity outranks text.** A `type="number"` input holding -5 under
 *   `min="0"` reports `rangeUnderflow` on its own, and when exactly one control
 *   on the page is invalid that way it *is* the one the message is about,
 *   whatever the words say. Text matching is what settles the rest — a blank
 *   field, or a value the calculator rejects for a reason the markup does not
 *   encode.
 * - It marks one field, not every plausible one. Five highlighted boxes is the
 *   same "hunt for it" the message already forced.
 */
const INVALID_SCRIPT = () => `
${INVALID_HELPERS}

var FIELD_SELECTOR = 'input, select, textarea';
var MARK_ATTR = 'data-pf-invalid';

// Controls the site chrome injected (the shop-rates bar, the saved-bids band,
// the share panel) are not part of the calculator and can never be what a
// calc.mjs message is about — but the rates bar's inputs carry labels reading
// "Crew hourly wage", which is exactly the text a wage message would match.
function isOwnField(node) {
  for (var el = node; el && el.classList; el = el.parentElement) {
    var names = el.classList;
    for (var i = 0; i < names.length; i += 1) {
      if (names[i].indexOf('pf-') === 0) return false;
    }
  }
  return true;
}

function isVisible(node) {
  return !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length);
}

// The label a human reads for this control: its <label for>, or the <label> it
// sits inside, minus any nested control's own text.
function labelTextFor(node) {
  var parts = [];
  if (node.id) {
    var byFor = document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(node.id) : node.id) + '"]');
    if (byFor) parts.push(byFor.textContent);
  }
  var wrapping = node.closest ? node.closest('label') : null;
  if (wrapping) parts.push(wrapping.textContent);
  if (parts.length === 0) {
    var labelled = node.getAttribute('aria-label') || node.getAttribute('placeholder') || '';
    if (labelled) parts.push(labelled);
  }
  return parts.join(' ');
}

function candidates() {
  var out = [];
  var nodes = document.querySelectorAll(FIELD_SELECTOR);
  for (var i = 0; i < nodes.length; i += 1) {
    var node = nodes[i];
    if (node.type === 'hidden' || node.type === 'button' || node.type === 'submit') continue;
    if (!isOwnField(node) || !isVisible(node)) continue;
    out.push(node);
  }
  return out;
}

// A repeated-row form prefixes its messages with the row's own name, which is
// usually the selected option of the row's type picker. Comparing against the
// row container's whole text catches both that and a row headed by a caption.
function rowMatchesScope(node, scope) {
  if (!scope) return false;
  var words = labelWords(scope);
  if (words.length === 0) return false;
  var row = node.closest ? node.closest('.run, .row, .item, fieldset, tr, li, [data-row]') : null;
  if (!row) return false;
  var text = labelWords(row.textContent || '').join(' ');
  var selects = row.querySelectorAll('select');
  for (var i = 0; i < selects.length; i += 1) {
    var picked = selects[i].selectedOptions && selects[i].selectedOptions[0];
    if (picked) text += ' ' + labelWords(picked.textContent || '').join(' ');
  }
  for (var w = 0; w < words.length; w += 1) {
    if (text.indexOf(words[w]) === -1) return false;
  }
  return true;
}

function nativelyInvalid(fields) {
  var out = [];
  for (var i = 0; i < fields.length; i += 1) {
    var node = fields[i];
    if (typeof node.checkValidity === 'function' && !node.checkValidity()) out.push(node);
  }
  return out;
}

/**
 * The field a message is about, or null.
 *
 * The words decide. Native validity is evidence, not an answer: an earlier
 * version returned the page's single natively-invalid control outright, and on
 * a form where one unrelated field is already out of range that marked it for
 * every message — including "Add at least one fence run to price", which is
 * about no field at all. So being natively invalid is a bonus on the score and,
 * failing everything else, the tie-breaker when the words alone are not enough.
 */
function fieldForMessage(message) {
  var fields = candidates();
  if (fields.length === 0) return null;
  var broken = nativelyInvalid(fields);
  var isBroken = function (node) { return broken.indexOf(node) !== -1; };
  var parsed = messageSubject(message);
  var best = null;
  var bestScore = 0;
  for (var i = 0; i < fields.length; i += 1) {
    var node = fields[i];
    var score = scoreMatch(parsed.subject, labelTextFor(node));
    if (rowMatchesScope(node, parsed.scope)) score += 0.25;
    if (isBroken(node)) score += 0.15;
    if (score > bestScore) { bestScore = score; best = node; }
  }
  if (best && bestScore >= MATCH_FLOOR) return best;
  // Nothing the words are confident about. One control that its own markup
  // already rejects, and that the message at least brushes against, is a better
  // answer than none — this is the "Finished top sq ft" / "Finished square
  // feet" shape, where the form abbreviates what the sentence spells out.
  if (broken.length === 1 && best === broken[0] && bestScore >= INVALID_MATCH_FLOOR) return best;
  return null;
}

function clearMarks() {
  var marked = document.querySelectorAll('[' + MARK_ATTR + ']');
  for (var i = 0; i < marked.length; i += 1) {
    marked[i].removeAttribute(MARK_ATTR);
    marked[i].removeAttribute('aria-invalid');
    marked[i].classList.remove('pf-invalid-field');
  }
}

function offScreen(node) {
  var box = node.getBoundingClientRect();
  var height = window.innerHeight || document.documentElement.clientHeight;
  return box.bottom < 0 || box.top > height;
}

function mark(node) {
  if (node.getAttribute(MARK_ATTR)) return;
  clearMarks();
  node.setAttribute(MARK_ATTR, '1');
  node.setAttribute('aria-invalid', 'true');
  node.classList.add('pf-invalid-field');
  // Never while a control has focus: the visitor is almost always typing in the
  // field that is wrong, and a scroll under the caret is worse than no scroll.
  var active = document.activeElement;
  var typing = active && active !== document.body && active.matches && active.matches(FIELD_SELECTOR);
  if (!typing && offScreen(node)) {
    try { node.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (error) { node.scrollIntoView(); }
  }
}

// The message is the hero number, which the page replaced with the sentence. It
// is not addressed by a shared id across the family, so it is found by position:
// the element just before the label, else the page's own hero element.
function messageElement(label) {
  var previous = label.previousElementSibling;
  if (previous && (previous.textContent || '').trim()) return previous;
  var parent = label.parentElement;
  if (!parent) return null;
  return parent.querySelector('.hero-number, .negative');
}

function promiseLabels(root) {
  var found = [];
  var nodes = root.querySelectorAll('*');
  for (var i = 0; i < nodes.length; i += 1) {
    var node = nodes[i];
    if (node.children.length) continue;
    var text = (node.textContent || '').trim().toLowerCase();
    if (text === HIGHLIGHT_PROMISE) found.push(node);
  }
  return found;
}

// The site's own anonymous, device-local counter, on the same terms as the
// shop-rates bar and the saved-bids band: which things happened, never who did
// them, never leaving the device, and silent for a browser asking not to be
// counted.
//
// Two events, and the second is the one that matters for maintenance:
// invalid_no_field is a rejection this could not attribute to a box. If that
// number grows against invalid_field_marked, a calculator has started wording
// its messages in a way the matcher cannot follow, and the page is back to
// telling people to look at a highlight it did not draw.
function bump(event) {
  try {
    if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
    var store = window.localStorage;
    if (!store || store.getItem('portfolio-hub-optout') === '1') return;
    var key = 'portfolio-hub-usage';
    var counts = JSON.parse(store.getItem(key) || '{}');
    counts[event] = (counts[event] || 0) + 1;
    counts.last_day = new Date().toISOString().slice(0, 10);
    store.setItem(key, JSON.stringify(counts));
  } catch (error) { /* storage can be denied outright; never break for a count */ }
}

var rewriting = false;
var counted = '';

function sync() {
  if (rewriting) return;
  var labels = promiseLabels(document);
  if (labels.length === 0) { clearMarks(); counted = ''; return; }
  var label = labels[0];
  var host = messageElement(label);
  var message = host ? (host.textContent || '').trim() : '';
  var field = fieldForMessage(message);
  // The page rewrites its own label on every keystroke, so the same rejection
  // arrives here many times. One count per distinct message.
  var fresh = message !== counted;
  counted = message;
  if (field) {
    mark(field);
    if (fresh) bump('invalid_field_marked');
    return;
  }
  clearMarks();
  if (fresh) bump('invalid_no_field');
  // No field to point at, so stop pointing. Guarded because writing the label
  // is itself a mutation this observer would otherwise read back.
  rewriting = true;
  try { label.textContent = NO_FIELD_LABEL; } finally { rewriting = false; }
}

function start() {
  try { sync(); } catch (error) { /* never break the calculator */ }
  var observer = new MutationObserver(function () {
    try { sync(); } catch (error) { /* as above */ }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
`;

/**
 * The mark itself.
 *
 * A ring rather than a border swap, so nothing reflows when a field is marked —
 * a form that jumps a pixel on every keystroke that fails validation is its own
 * distraction. `currentColor` is deliberately not used: this has to read as
 * wrong, and it is the one place on these pages where colour carries meaning.
 * It is never the *only* carrier — `aria-invalid` says the same thing to a
 * screen reader, and the sentence above the form says it in words.
 */
const INVALID_CSS = `
.pf-invalid-field{outline:2px solid #c5321f;outline-offset:1px;
  border-radius:4px;background:#c5321f14}
@media (prefers-color-scheme:dark){
  .pf-invalid-field{outline-color:#ff8a75;background:#ff8a7514}
}
/* The customer's proposal is printed from these pages and must never carry the
   contractor's working state; see the print rule in rates.mjs for the same
   reasoning applied to the shop-rates band. */
@media print{.pf-invalid-field{outline:none;background:none}}
`;

/** The runtime file, written once at the site root. */
export function renderInvalidModule() {
  return `${stripForInjection(INVALID_SCRIPT())}\n`;
}

/** Its stylesheet, on the same terms. Nothing in it is ever per-page. */
export function renderInvalidStyle() {
  return INVALID_CSS.trimStart();
}

/**
 * Does this page promise a highlight it does not draw?
 *
 * The promise is the gate. A page without it gets nothing — there is no message
 * for this to explain, and marking fields on a page that never asked would be
 * inventing validation the tool does not have.
 */
export function pagePromisesHighlight(html) {
  if (typeof html !== 'string') return false;
  return html.toLowerCase().includes(HIGHLIGHT_PROMISE);
}

/**
 * Add the highlight runtime to one already-published page.
 *
 * Unchanged when the page makes no promise, when there is no `<body>`, or when
 * the pass has already run — like every other injection here it has to be safe
 * to run twice.
 */
export function injectInvalidField(html, toRoot = './') {
  if (typeof html !== 'string') return html;
  if (html.includes(MARKER)) return html;
  if (!pagePromisesHighlight(html)) return html;
  if (!/<body[^>]*>/i.test(html) || !/<\/body>/i.test(html)) return html;

  const styleLink = `<link rel="stylesheet" href="${attr(toRoot + INVALID_STYLE_FILE)}">`;
  const withStyle = html.replace(/<\/head>/i, `${styleLink}\n</head>`);
  // A page with no <head> still gets the stylesheet, ahead of the script.
  const prefix = withStyle === html ? `${styleLink}\n` : '';

  // `type="module"` for the reason the shop-rates tag gives: module scripts are
  // deferred and run in document order, so this one, last in the document, sees
  // a form the venture's own deferred module has finished building.
  const tag = `${prefix}<script type="module" src="${attr(toRoot + INVALID_MODULE_FILE)}"></script>`;
  return withStyle.replace(/<\/body>/i, `${tag}\n</body>`);
}
