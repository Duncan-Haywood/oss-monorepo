var STOP_WORDS = new Set(["the","a","an","of","per","and","or","to","in","for","on","at","your","you","this","is","be","each","any","with"]);
var CONNECTIVES = [" must "," cannot "," can not "," can't "," can’t "," has to "," needs to "," should "," may not "," is not "," are not "," exceeds "];
var MATCH_FLOOR = 0.6;
var INVALID_MATCH_FLOOR = 0.2;
var SYNONYMS = new Map([["sq",["square"]],["sqft",["square","feet"]],["ft",["feet"]],["foot",["feet"]],["lf",["linear","feet"]],["sf",["square","feet"]],["lin",["linear"]],["yd",["yards"]],["yds",["yards"]],["cy",["cubic","yards"]],["sy",["square","yards"]],["hr",["hours"]],["hrs",["hours"]],["h",["hours"]],["hour",["hours"]],["qty",["count"]],["num",["count"]],["ea",["each"]],["pct",["percent"]],["percentage",["percent"]],["lb",["pounds"]],["lbs",["pounds"]],["mi",["miles"]],["amt",["amount"]],["avg",["average"]]]);
var singular = function singular(word) {
if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
return word;
};
var HIGHLIGHT_PROMISE = "check the highlighted input";
var NO_FIELD_LABEL = "check the values you entered";
var normalizeLabel = function normalizeLabel(text) {
return String(text ?? '')
.replace(/[^\p{L}\p{N}]+/gu, ' ')
.trim()
.toLowerCase();
};
var labelWords = function labelWords(text) {
const out = [];
for (const raw of normalizeLabel(text).split(' ')) {
if (!raw || STOP_WORDS.has(raw)) continue;
for (const word of (SYNONYMS.get(raw) ?? [raw])) {
if (!STOP_WORDS.has(word)) out.push(singular(word));
}
}
return out;
};
var messageSubject = function messageSubject(message) {
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
};
var scoreMatch = function scoreMatch(subject, label) {
const subjectWords = labelWords(subject);
const labelList = labelWords(label);
if (subjectWords.length === 0 || labelList.length === 0) return 0;
const labelSet = new Set(labelList);
const subjectSet = new Set(subjectWords);
const recall = subjectWords.filter((word) => labelSet.has(word)).length / subjectWords.length;
const precision = labelList.filter((word) => subjectSet.has(word)).length / labelList.length;
return recall * 0.65 + precision * 0.35;
};
var FIELD_SELECTOR = 'input, select, textarea';
var MARK_ATTR = 'data-pf-invalid';
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
function rowMatchesScope(node, scope) {
if (!scope) return false;
var words = labelWords(scope);
if (words.length === 0) return false;
var row = node.closest ? node.closest('.run, .row, .item, fieldset, tr, li, [data-row]') : null;
if (!row) return false;
var text = normalizeLabel(row.textContent || '');
var selects = row.querySelectorAll('select');
for (var i = 0; i < selects.length; i += 1) {
var picked = selects[i].selectedOptions && selects[i].selectedOptions[0];
if (picked) text += ' ' + normalizeLabel(picked.textContent || '');
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
var active = document.activeElement;
var typing = active && active !== document.body && active.matches && active.matches(FIELD_SELECTOR);
if (!typing && offScreen(node)) {
try { node.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (error) { node.scrollIntoView(); }
}
}
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
var fresh = message !== counted;
counted = message;
if (field) {
mark(field);
if (fresh) bump('invalid_field_marked');
return;
}
clearMarks();
if (fresh) bump('invalid_no_field');
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
