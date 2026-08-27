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
  return { name, at, fields };
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
export const SAVED_BIDS_CLAUSE = 'saved bids you can name, reopen and reprice';

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
 */
export function addSavedBidsClause(html) {
  if (typeof html !== 'string') return html;
  if (html.includes(SAVED_BIDS_CLAUSE)) return html;
  return html.replace(FEATURE_LIST_RE, (match, open, list, close) =>
    list.trim() === '' ? match : `${open}${list}, ${SAVED_BIDS_CLAUSE}${close}`,
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
.pf-jobs-when{opacity:.7;font-variant-numeric:tabular-nums}
.pf-jobs-note{margin:10px 0 0;opacity:.72}
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
const JOBS_MARKUP = `<section class="pf-jobs" hidden data-pf-jobs-root>
  <p class="pf-jobs-line">
    <span class="pf-jobs-status" id="pf-jobs-status" role="status"></span>
    <button type="button" id="pf-jobs-toggle" aria-expanded="false" aria-controls="pf-jobs-panel">Saved bids</button>
  </p>
  <div class="pf-jobs-panel" id="pf-jobs-panel" hidden>
    <p>Keep this bid so it is still here when the customer calls back. Every number on this form is saved together, under a name you choose, and restoring one puts the whole job back exactly as you priced it.</p>
    <div class="pf-jobs-save">
      <label class="pf-jobs-label" for="pf-jobs-name">Name this bid</label>
      <input type="text" id="pf-jobs-name" maxlength="60" autocomplete="off" placeholder="e.g. 14 Oak St — Mrs Reid">
      <button type="button" data-pf-jobs="save">Save this bid</button>
    </div>
    <ul class="pf-jobs-list" id="pf-jobs-list" hidden></ul>
    <p class="pf-jobs-note">Kept in this browser only, on this site&rsquo;s own storage. Nothing is uploaded, and clearing your browser data clears it. Bids are kept per tool, so these are the ones you saved here.</p>
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
 */
const JOBS_SCRIPT = (slug) => `<script type="module">
(function(){
  var SLUG = ${JSON.stringify(slug)};
  var KEY = ${JSON.stringify(SAVED_BIDS_KEY)};
  var MAX = ${MAX_SAVED_BIDS};
  var MIN_FIELDS = ${MIN_SAVEABLE_FIELDS};
  var EXCLUDED = ${JSON.stringify([...EXCLUDED_FIELD_IDS])};
  var UNSAVEABLE = ${JSON.stringify([...UNSAVEABLE_TYPES])};

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

  var render = function(){
    var list = mine();
    var ul = el('pf-jobs-list');
    ul.textContent = '';
    ul.hidden = list.length === 0;
    for (var i = 0; i < list.length; i++) {
      var bid = list[i];
      var li = document.createElement('li');

      var name = document.createElement('span');
      name.className = 'pf-jobs-name';
      name.textContent = bid.name;
      li.appendChild(name);

      var at = document.createElement('span');
      at.className = 'pf-jobs-when';
      at.textContent = when(bid.at);
      li.appendChild(at);

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
    for (var j = 0; j < list.length; j++) {
      if (list[j].name === name) { list.splice(j, 1); replaced = true; break; }
    }
    list.unshift({ name: name, at: new Date().toISOString(), fields: values });

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
    toggle.addEventListener('click', function(){
      var panel = el('pf-jobs-panel');
      var open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) bump('saved_bids_opened');
    });

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
  };

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
</script>`;

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
export function injectSavedBids(html, slug = '') {
  if (typeof html !== 'string') return html;
  if (html.includes(JOBS_MARKER)) return html;

  if (!pageTakesSavedBids(html)) return html;

  const bodyOpen = html.match(/<body[^>]*>/i);
  if (!bodyOpen || !/<\/body>/i.test(html)) return html;

  // The claim goes in with the feature, never on its own. See the clause above.
  const declared = addSavedBidsClause(html);

  const withStyle = declared.replace(/<\/head>/i, `${JOBS_STYLE}\n</head>`);
  // A page with no <head> still gets the stylesheet, ahead of the bar it styles.
  const stylePrefix = withStyle === declared ? `${JOBS_STYLE}\n` : '';

  const rates = withStyle.match(/<section class="pf-rates"[\s\S]*?<\/section>/i);
  const nav = withStyle.match(/<nav class="pf-chrome pf-chrome-top"[\s\S]*?<\/nav>/i);
  const anchor = rates ? rates[0] : nav ? nav[0] : null;
  const anchored = anchor
    ? withStyle.replace(anchor, `${anchor}\n${stylePrefix}${JOBS_MARKUP}`)
    : withStyle.replace(bodyOpen[0], `${bodyOpen[0]}\n${stylePrefix}${JOBS_MARKUP}`);

  return anchored.replace(/<\/body>/i, `${JOBS_SCRIPT(slug)}\n</body>`);
}
