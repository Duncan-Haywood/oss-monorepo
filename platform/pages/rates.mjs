// Carries a contractor's own cost structure across every trade bid calculator
// on the site.
//
// Why this exists
// ---------------
// Thirty-six trade bid calculators here ask the same four questions before they
// can price anything: crew hourly wage, payroll burden, overhead on direct
// cost, and target net margin. Those four are not facts about the *job* — they
// are facts about the *business*, and they do not change between a door job and
// a crown-molding job. Every calculator nonetheless opens on a stranger's
// ballpark ($42/h, 32%, 15%, 20%), so the second tool a contractor opens makes
// them look up and retype the same four numbers they entered ten minutes ago,
// on a page that meanwhile shows a price computed from someone else's shop.
//
// That is the worst possible failure for this site's actual growth story. The
// hub exists so a visitor who lands on one calculator from search finds the
// other fifty-eight; `portfolio/DIRECTION.md` counts return usage and
// time-to-first-value as the signals worth moving. A visitor who crosses to a
// second tool and is met with a four-field re-entry has been given a reason to
// leave, right at the moment they were about to become a returning user.
//
// So: save those four once, and every trade bid calculator on this origin opens
// with them. Nothing leaves the browser — one `localStorage` key on the site's
// own origin, which is the same device-local convention the hub's usage counter
// already uses.
//
// Injected at build time, not written into each venture, for the same two
// reasons the navigation chrome is (see `injectChrome`): a calculator lands on
// `main` most days and the injection covers each new one for free, and venture
// pages are edited concurrently by other sessions, so the same four-line edit
// committed into thirty-six product files would conflict with nearly every open
// branch.

/**
 * The fields carried between tools.
 *
 * All four are present, with these exact ids and these exact meanings, in every
 * `ventures/*-bid-calculator/index.html` on `main` — they are the shared spine
 * of the family rather than a coincidence of naming. `burdenRate`,
 * `overheadRate` and `targetMargin` are percentages in every one of them, and
 * `overheadRate` is specifically overhead *on direct cost*, not a day rate.
 *
 * Deliberately not carried: anything job-shaped (square feet, corners, trips)
 * and anything trade-shaped (hours per unit, material invoices). Those differ
 * per bid and per tool, and prefilling them from another trade would be worse
 * than a blank field — it would be a wrong number that looks considered.
 *
 * `max` is the ceiling the calculators themselves accept, so a restored value
 * can never prefill a field the tool would then reject. A margin of 100% has no
 * arithmetic meaning here (price divided by zero), which is why the forms cap
 * it below 100 and this does too.
 */
export const SHOP_RATE_FIELDS = [
  { id: 'hourlyWage', label: 'Crew hourly wage', prefix: '$', suffix: '/h', max: 100000 },
  { id: 'burdenRate', label: 'Payroll burden', suffix: '%', max: 500 },
  { id: 'overheadRate', label: 'Overhead on direct cost', suffix: '%', max: 500 },
  { id: 'targetMargin', label: 'Target net margin', suffix: '%', max: 99.9 },
];

/** The one `localStorage` key. Site-wide on purpose: that is the whole feature. */
export const SHOP_RATES_KEY = 'portfolio-shop-rates';

const SHOP_RATES_MARKER = 'pf-rates';

/**
 * Only a finite, non-negative number inside the field's own range is carried.
 * Same contract the calculators enforce on input, and the same reason: a
 * prefilled value the tool would reject is a page that opens broken.
 */
function usableRate(field, value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(result) || result < 0) return null;
  if (typeof field.max === 'number' && result > field.max) return null;
  return result;
}

/**
 * Keep only the known fields, and only where the value is usable.
 *
 * Returns `null` rather than `{}` when nothing survives, so "no rates" is one
 * state throughout instead of two that behave differently.
 */
export function normalizeRates(values) {
  if (!values || typeof values !== 'object') return null;
  const result = {};
  for (const field of SHOP_RATE_FIELDS) {
    const value = usableRate(field, values[field.id]);
    if (value !== null) result[field.id] = value;
  }
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Parse what came back out of storage.
 *
 * Storage is the visitor's own disk and can hold anything — a half-written
 * value from a crashed tab, a key another tool happened to use, a payload from
 * a future version of this file. Every one of those has to end as "no saved
 * rates" rather than as an exception thrown into the page, because the failure
 * mode of a throw here is a calculator that stops calculating.
 */
export function parseStoredRates(raw) {
  if (typeof raw !== 'string' || raw === '') return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  return normalizeRates(parsed.rates && typeof parsed.rates === 'object' ? parsed.rates : parsed);
}

/** The stored form. Versioned so a later shape can be told apart from this one. */
export function serializeRates(values) {
  const rates = normalizeRates(values);
  if (!rates) return null;
  return JSON.stringify({ v: 1, rates });
}

/**
 * Does this page have the form these rates belong to?
 *
 * Every field must be present. A page carrying two of the four is not a trade
 * bid calculator that grew differently — it is a different kind of page, and
 * half-prefilling it would put a number in a field whose meaning we have not
 * checked. The deep SEO pages inside each venture ("how much to charge to…")
 * carry no form at all and are skipped by the same test.
 */
export function pageCarriesShopRates(html) {
  if (typeof html !== 'string') return false;
  return SHOP_RATE_FIELDS.every((field) =>
    new RegExp(`<input[^>]*\\bid="${field.id}"`, 'i').test(html),
  );
}

/**
 * Scoped under `.pf-rates`, and — like the navigation chrome — it takes its
 * colours from the host page rather than from the operating system. Most
 * ventures here are deliberately light-only and carry no `prefers-color-scheme`
 * rule, so a band painted from its own dark palette would sit as a near-black
 * slab on a cream page for any visitor with a dark OS.
 */
const RATES_STYLE = `<style>
.pf-rates{font:inherit;font-size:.85rem;line-height:1.45;color:inherit;
  max-width:1060px;margin:0 auto;padding:8px 18px 0;box-sizing:border-box}
.pf-rates-line{margin:0;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:baseline}
.pf-rates-status{opacity:.82}
.pf-rates button{font:inherit;font-size:.85rem;color:inherit;background:#8080801f;
  border:1px solid #80808059;border-radius:7px;padding:3px 9px;cursor:pointer}
.pf-rates button:hover{background:#8080802e}
.pf-rates-panel{margin:8px 0 0;padding:12px 14px;border:1px solid #80808040;
  border-radius:10px;background:#8080800f}
.pf-rates-panel p{margin:0 0 10px}
.pf-rates-list{margin:0 0 10px;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:4px 18px}
.pf-rates-list li{margin:0}
.pf-rates-list b{font-variant-numeric:tabular-nums}
.pf-rates-actions{display:flex;flex-wrap:wrap;gap:8px}
.pf-rates-note{margin:10px 0 0;opacity:.72}
.pf-rates :focus-visible{outline:2px solid currentColor;outline-offset:2px}
@media (max-width:780px){.pf-rates{padding:8px 14px 0}}
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
const RATES_MARKUP = `<section class="pf-rates" hidden data-pf-rates-root>
  <p class="pf-rates-line">
    <span class="pf-rates-status" id="pf-rates-status" role="status"></span>
    <button type="button" id="pf-rates-toggle" aria-expanded="false" aria-controls="pf-rates-panel">Your shop rates</button>
  </p>
  <div class="pf-rates-panel" id="pf-rates-panel" hidden>
    <p>Wage, burden, overhead, and target margin are the same on every job you bid. Save them once and every trade bid calculator here opens with your numbers instead of a stranger&rsquo;s ballpark.</p>
    <ul class="pf-rates-list" id="pf-rates-list" hidden></ul>
    <div class="pf-rates-actions">
      <button type="button" data-pf-rates="save">Save the rates on this bid</button>
      <button type="button" data-pf-rates="apply" hidden>Use my saved rates here</button>
      <button type="button" data-pf-rates="clear" hidden>Forget my rates</button>
    </div>
    <p class="pf-rates-note">Kept in this browser only, on this site&rsquo;s own storage. Nothing is uploaded, and clearing your browser data clears it. Forgetting them leaves the numbers already on this bid alone.</p>
  </div>
</section>`;

/**
 * The browser half.
 *
 * A module script, not a classic one, and that is load-bearing: inline classic
 * scripts run the moment they are parsed, which would be *before* the venture's
 * own deferred module has restored a saved or shared bid. Module scripts are
 * deferred and run in document order, so this one — injected last — sees the
 * finished form. The `load` fallback covers a venture module that stalls.
 *
 * The rule about what may be overwritten is the whole design:
 *
 *   - A field named in the page's URL fragment (or a leftover query string)
 *     came off a *bid link* someone sent. Those are the sender's numbers on
 *     the sender's job, and replacing them would silently price a different
 *     bid than the sender saw — the exact bug `share.mjs` was written to
 *     avoid. Never overwritten. Bid links live in the fragment so wage and
 *     margin never hit the server log or a Referer.
 *   - Anything else is overwritten by the saved rates, including the copy sitting
 *     in this browser's own saved bid. That copy is a snapshot of what the rates
 *     were when the bid was last touched; the saved rates are what they are now.
 *     If a contractor raises their wage, every tool has to show it, or the
 *     feature is a lie the second time it matters.
 */
const RATES_SCRIPT = `<script type="module">
(function(){
  var FIELDS = ${JSON.stringify(
    SHOP_RATE_FIELDS.map(({ id, label, prefix, suffix, max }) => ({
      id,
      label,
      prefix: prefix || '',
      suffix: suffix || '',
      max,
    })),
  )};
  var KEY = ${JSON.stringify(SHOP_RATES_KEY)};

  var root = document.querySelector('[data-pf-rates-root]');
  if (!root) return;
  var el = function(id){ return document.getElementById(id); };
  var fieldFor = function(id){
    var node = el(id);
    return node && node.tagName === 'INPUT' ? node : null;
  };
  // Defensive: the build only injects this where all four exist, but a venture
  // could rename one tomorrow, and a half-applied set of rates is worse than
  // none. Removing the panel is the honest outcome.
  for (var i = 0; i < FIELDS.length; i++) {
    if (!fieldFor(FIELDS[i].id)) { root.remove(); return; }
  }

  var store = (function(){ try { return window.localStorage; } catch (e) { return null; } })();
  // Number('') and Number(null) are 0. A blank field must not become a $0
  // wage that then prices the next trade at nothing and looks deliberate.
  var usable = function(raw, max){
    if (raw === '' || raw === null || raw === undefined) return null;
    var value = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!isFinite(value) || value < 0 || value > max) return null;
    return value;
  };
  var read = function(){
    if (!store) return null;
    var raw;
    try { raw = store.getItem(KEY); } catch (e) { return null; }
    if (!raw) return null;
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return null; }
    if (!parsed || typeof parsed !== 'object') return null;
    var source = parsed.rates && typeof parsed.rates === 'object' ? parsed.rates : parsed;
    var out = {}, kept = 0;
    FIELDS.forEach(function(f){
      var value = usable(source[f.id], f.max);
      if (value === null) return;
      out[f.id] = value; kept++;
    });
    return kept === FIELDS.length ? out : null;
  };
  var write = function(rates){
    if (!store) return false;
    try { store.setItem(KEY, JSON.stringify({ v: 1, rates: rates })); return true; }
    catch (e) { return false; }
  };

  // The same anonymous, device-local convention the rest of the site uses:
  // which things were done, never who did them, never leaving the device, and
  // silent for a browser asking not to be counted.
  var bump = function(event){
    try {
      if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
      if (!store || store.getItem('portfolio-hub-optout') === '1') return;
      var k = 'portfolio-hub-usage';
      var counts = JSON.parse(store.getItem(k) || '{}');
      counts[event] = (counts[event] || 0) + 1;
      counts.last_day = new Date().toISOString().slice(0, 10);
      store.setItem(k, JSON.stringify(counts));
    } catch (e) {}
  };

  var encoded = (location.hash || location.search).replace(/^[#?]/, '');
  var params = new URLSearchParams(encoded);
  var format = function(f, value){
    var shown = Math.round(value * 100) / 100;
    return f.prefix + shown.toLocaleString('en-US') + f.suffix;
  };

  var currentFromForm = function(){
    var out = {}, kept = 0;
    FIELDS.forEach(function(f){
      var value = usable(fieldFor(f.id).value, f.max);
      if (value === null) return;
      out[f.id] = value; kept++;
    });
    return kept === FIELDS.length ? out : null;
  };

  // Writing the value is not enough: the calculator recomputes on 'input' and
  // saves the bid on the document-level listener, so a silent assignment would
  // leave the price on screen computed from the number that is no longer there.
  var applyRates = function(rates, force){
    var applied = [], heldBack = [];
    FIELDS.forEach(function(f){
      if (!(f.id in rates)) return;
      if (!force && params.has(f.id)) { heldBack.push(f); return; }
      var node = fieldFor(f.id);
      applied.push(f);
      if (String(node.value) === String(rates[f.id])) return;
      node.value = rates[f.id];
      // "Hand-entered" as far as the venture's suggested-rate kits are
      // concerned, so a preset change cannot stomp the contractor's own rate.
      node.dataset.edited = '1';
      // 'input' only. Every calculator recomputes on 'input' and saves the bid
      // on a document-level 'input' listener, so this is enough — and their
      // 'change' handler is the one that records a usage event, which would be
      // a false reading: the visitor did not price anything, the page loaded.
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return { applied: applied, heldBack: heldBack };
  };

  var render = function(rates, outcome){
    root.hidden = false;
    var list = el('pf-rates-list');
    var status = el('pf-rates-status');
    var button = function(name){ return root.querySelector('[data-pf-rates="' + name + '"]'); };

    if (!rates) {
      status.textContent = 'Save your rates once \\u2014 every calculator here uses them.';
      list.hidden = true;
      list.innerHTML = '';
      button('save').textContent = 'Save the rates on this bid';
      button('apply').hidden = true;
      button('clear').hidden = true;
      return;
    }

    list.hidden = false;
    list.innerHTML = FIELDS.filter(function(f){ return f.id in rates; }).map(function(f){
      var label = document.createElement('li');
      label.textContent = f.label + ': ';
      var value = document.createElement('b');
      value.textContent = format(f, rates[f.id]);
      label.appendChild(value);
      return label.outerHTML;
    }).join('');

    button('save').textContent = 'Update from this bid';
    button('clear').hidden = false;
    var held = outcome && outcome.heldBack.length;
    button('apply').hidden = !held;
    status.textContent = held
      ? 'This bid came from a link, so it still shows the sender\\u2019s rates.'
      : 'Using your shop rates.';
  };

  var start = function(){
    var rates = read();
    var outcome = rates ? applyRates(rates, false) : null;
    if (outcome && outcome.applied.length) bump('shop_rates_applied');
    render(rates, outcome);

    el('pf-rates-toggle').addEventListener('click', function(){
      var panel = el('pf-rates-panel');
      var open = panel.hidden;
      panel.hidden = !open;
      el('pf-rates-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) bump('shop_rates_opened');
    });

    root.addEventListener('click', function(event){
      var action = event.target && event.target.closest && event.target.closest('[data-pf-rates]');
      if (!action) return;
      var name = action.getAttribute('data-pf-rates');

      if (name === 'save') {
        var next = currentFromForm();
        if (!next) {
          el('pf-rates-status').textContent = 'Fill in all four rates on the bid first.';
          return;
        }
        if (!write(next)) {
          el('pf-rates-status').textContent = 'This browser is blocking site storage, so rates cannot be saved.';
          return;
        }
        bump('shop_rates_saved');
        render(next, { applied: FIELDS, heldBack: [] });
        el('pf-rates-status').textContent = 'Saved. Every trade bid calculator here opens with these.';
        return;
      }

      if (name === 'apply') {
        var saved = read();
        if (!saved) return;
        bump('shop_rates_applied');
        render(saved, applyRates(saved, true));
        el('pf-rates-status').textContent = 'Repriced with your rates.';
        return;
      }

      if (name === 'clear') {
        try { if (store) store.removeItem(KEY); } catch (e) {}
        bump('shop_rates_cleared');
        render(null, null);
        el('pf-rates-status').textContent = 'Forgotten. The numbers on this bid are unchanged.';
      }
    });
  };

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
</script>`;

/**
 * Add the shop-rates bar to one already-published page.
 *
 * Returns the html unchanged when the page is not a trade bid calculator, when
 * there is no `<body>` to attach to, or when the bar is already there — the
 * pass has to be safe to run twice.
 *
 * Placed directly after the navigation chrome rather than inside the form,
 * because the form is the one part of these pages that is genuinely different
 * from venture to venture: there is no element every calculator has in the same
 * place, and a regex that guessed would put the control somewhere different on
 * each of thirty-six tools. Under the nav it is the first thing below the site
 * bar on every one of them.
 */
export function injectShopRates(html) {
  if (typeof html !== 'string') return html;
  if (html.includes(SHOP_RATES_MARKER)) return html;
  if (!pageCarriesShopRates(html)) return html;

  const bodyOpen = html.match(/<body[^>]*>/i);
  if (!bodyOpen || !/<\/body>/i.test(html)) return html;

  const withStyle = html.replace(/<\/head>/i, `${RATES_STYLE}\n</head>`);
  // A page with no <head> still gets the stylesheet, ahead of the bar it styles.
  const stylePrefix = withStyle === html ? `${RATES_STYLE}\n` : '';

  const nav = withStyle.match(/<nav class="pf-chrome pf-chrome-top"[\s\S]*?<\/nav>/i);
  const anchored = nav
    ? withStyle.replace(nav[0], `${nav[0]}\n${stylePrefix}${RATES_MARKUP}`)
    : withStyle.replace(bodyOpen[0], `${bodyOpen[0]}\n${stylePrefix}${RATES_MARKUP}`);

  return anchored.replace(/<\/body>/i, `${RATES_SCRIPT}\n</body>`);
}
