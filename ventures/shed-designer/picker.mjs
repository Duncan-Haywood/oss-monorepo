// @ts-check
// Pick a starting design: a strip of ready-made designs, a detail panel for
// one (renders, price and where it goes, size, storage, looks, openings,
// structure, why it is on the list) and a side-by-side compare of two or
// three. "Start from this design" hands a copy to the editor.
//
// Any element on the page with data-detail="<id>" opens that design's detail,
// and data-compare="<id>" adds it to (or takes it out of) the compare, so a
// richer gallery of cards can reuse the panel by carrying those attributes.

import { PRESETS, buildShed, normalize } from './model.mjs';
import { createViewer } from './render3d.mjs';
import { pictureFor } from './renders.mjs';
import { designFacts, compareRows, tradeOff } from './designfacts.mjs';
import { fmtFtIn, fmtIn } from './lumber.mjs';
import { kitLineHtml } from './value.mjs';
import { estimate, examplePrices } from './estimate.mjs';
import { costBreakdown, costDelta, deltaPhrase, signedDollars } from './costs.mjs';
import { bridgeHtml } from './costview.mjs';

/** @typedef {{ id: string, title?: string, design: any, reason?: string }} Entry */

/** The built-in starting points, until a search supplies optimised ones. */
export function presetEntries() {
  const titles = {
    '8x12': '8x12 ridge beam, 8 ft height limit',
    '8x12 classic': '8x12 classic, 8 ft walls',
    '8x10': '8x10 gable shed',
    '10x12': '10x12 gable shed',
    '12x16': '12x16, double door on the gable',
    '8x8 lean': '8x8 garden shed',
  };
  return Object.entries(PRESETS).map(([id, make]) => ({ id, title: titles[id] || id, design: make() }));
}

export const MAX_COMPARE = 3;

/** Where a looks score loses most, in a few words: "short on windows 0/15, overhang 11.3/15". @param {{ terms: { label: string, points: number, max: number }[] }} looks */
const topTerms = (looks) => {
  const low = looks.terms.filter((t) => t.points < t.max - 1e-9).sort((a, b) => a.points / a.max - b.points / b.max).slice(0, 2).map((t) => `${t.label.toLowerCase()} ${t.points}/${t.max}`);
  return low.length ? `short on ${low.join(', ')}` : 'full marks on every term';
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n) => {
  const format = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
  const text = format(Math.abs(n));
  return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};
const n1 = (x) => (Math.round(x * 10) / 10).toString();
const WALL = { front: 'front', back: 'back', left: 'left gable', right: 'right gable' };

// Camera angles for the renders: front corner, back corner, gable end.
const VIEWS = [
  { key: 'front', label: 'Front corner', theta: -0.95, phi: 0.36 },
  { key: 'back', label: 'Back corner', theta: Math.PI - 0.95, phi: 0.36 },
  { key: 'end', label: 'Gable end', theta: 0, phi: 0.12 },
];

// Pictures drawn ahead of time by make-renders.mjs (renders/), used when a
// design is one of them unchanged: sharper than a live snapshot and no wait.
const STORED_VIEWS = [
  { key: 'hero', label: 'Front corner' },
  { key: 'side', label: 'Gable end' },
  { key: 'back', label: 'Back' },
  { key: 'framing', label: 'Framing' },
];

/**
 * @param {{
 *   root: HTMLElement, dialog: HTMLDialogElement, tray: HTMLElement,
 *   entries?: Entry[], prices?: () => any, priceOf?: (shed: any) => any,
 *   onStart: (design: any) => void, count?: (event: string) => void,
 *   current?: () => any,
 * }} opts
 * `current` is the design open in the editor: each card and detail then shows
 * its cost against it, priced the same way (`priceOf`) on both sides.
 */
export function mountPicker(opts) {
  const { root, dialog, tray } = opts;
  /** @type {Entry[]} */
  let entries = opts.entries || presetEntries();
  /** @type {Map<string, ReturnType<typeof designFacts>>} */
  const facts = new Map();
  /** @type {string[]} */
  const chosen = [];
  /** Renders by design and angle; a design's renders stay valid until it changes. */
  const shots = new Map();
  let viewer = /** @type {any} */ (undefined);
  let opener = /** @type {HTMLElement | null} */ (null);
  let priceTimer = /** @type {any} */ (0);

  const entry = (id) => entries.find((e) => e.id === id);
  const factsOf = (id) => {
    if (!facts.has(id)) {
      const e = /** @type {Entry} */ (entry(id));
      facts.set(id, designFacts(e.design, { id, reason: e.reason, prices: opts.prices?.(), price: opts.priceOf }));
    }
    return /** @type {ReturnType<typeof designFacts>} */ (facts.get(id));
  };
  const allFacts = () => entries.map((e) => factsOf(e.id));
  // The design's own roofing and paint, which store kits leave out (value.mjs).
  const leftOutOf = (f) => {
    const shed = buildShed(normalize(f.design));
    const est = opts.priceOf ? opts.priceOf(shed) : estimate(shed, opts.prices?.() || examplePrices());
    return est.shopping.filter((l) => l.section === 'Roofing' || l.section === 'Paint').reduce((t, l) => t + (l.total || 0), 0);
  };
  const titleOf = (id) => entry(id)?.title || factsOf(id).name;
  // The open design's cost breakdown, kept until the design or the prices change.
  let here = /** @type {{ key: string, name: string, costs: any } | null} */ (null);
  const hereCosts = () => {
    const d = opts.current?.();
    if (!d) return null;
    const key = JSON.stringify(d);
    if (here?.key !== key) {
      const shed = buildShed(normalize(d));
      const est = opts.priceOf ? opts.priceOf(shed) : estimate(shed, opts.prices?.() || examplePrices());
      here = { key, name: shed.design.name, costs: costBreakdown(shed, est) };
    }
    return here;
  };
  /** The card's materials against the open design: the total change and its largest parts. */
  const againstHere = (f, max = 2) => {
    const h = hereCosts();
    if (!h) return null;
    const total = f.total - h.costs.total;
    return { name: h.name, total, phrase: deltaPhrase(costDelta(h.costs, f.costs), max), from: h.costs };
  };

  /** @type {any} */
  let manifest = null;
  /** The stored picture of a design from one view, when that exact design was drawn (a preset or a gallery card, unchanged). */
  const stored = (id, view) => {
    const e = entry(id);
    return manifest && e ? pictureFor(manifest, e.design, view) : null;
  };
  const thumb = (id) => {
    // The strip's cards are about 260 px wide: the 480 px card picture, not the hero.
    const r = stored(id, 'card') || stored(id, 'hero');
    if (r) return `<img src="${esc(r.src)}" alt="" width="${r.width}" height="${r.height}">`;
    return shots.has(shotKey(id)) ? `<img src="${shots.get(shotKey(id))}" alt="" width="600" height="400">` : '';
  };
  const shotKey = (id, view = VIEWS[0]) => `${id}|${view.key}|${JSON.stringify(entry(id)?.design)}`;
  /** A render of a design from one angle, or '' when there is no WebGL. */
  function shot(id, view = VIEWS[0]) {
    const key = shotKey(id, view);
    if (shots.has(key)) return shots.get(key);
    if (viewer === undefined) {
      const c = document.createElement('canvas'); c.width = 600; c.height = 400;
      viewer = createViewer(c, { presentation: true });
    }
    if (!viewer) return '';
    viewer.show(buildShed(normalize(/** @type {Entry} */ (entry(id)).design)), { refit: true });
    viewer.view(view.theta, view.phi);
    const url = viewer.snapshot();
    shots.set(key, url);
    return url;
  }
  const img = (id, view = VIEWS[0], extra = '') => {
    const src = shot(id, view);
    const alt = `${view.label} of the ${titleOf(id)}`;
    return src ? `<img src="${src}" alt="${esc(alt)}" width="600" height="400"${extra}>` : `<div class="thumb-wait">${esc(alt)} (3D needs WebGL)</div>`;
  };

  // ---- the strip of starting points ----
  function renderStrip() {
    const all = allFacts();
    const list = root.querySelector('.pick-list');
    if (!list) return;
    list.innerHTML = entries.map((e) => {
      const f = factsOf(e.id);
      const on = chosen.includes(e.id);
      return `<li class="pick">
        <button type="button" class="pick-open" data-detail="${esc(e.id)}" aria-label="Details of the ${esc(titleOf(e.id))}">
          <span class="pick-img" data-shot="${esc(e.id)}">${thumb(e.id) || '<span class="thumb-wait">rendering...</span>'}</span>
          <strong>${esc(titleOf(e.id))}</strong>
          <span class="pick-line">${money(f.total)} &middot; ${Math.round(f.footprintSqFt)} sq ft &middot; peak ${fmtFtIn(f.peak)}</span>
          <span class="pick-line">${Math.round(f.storage.volumeCuFt)} cu ft inside &middot; ${Math.round(f.storage.shelfFt)} ft of clear wall</span>
          <span class="pick-line pick-finish">Siding: ${esc(f.siding.split(',')[0])} &middot; ${esc(f.design.roofing ? (f.design.roofCover === 'metal' ? 'metal roof' : 'asphalt shingle roof') : 'no roofing')}</span>
          ${(() => { const a = againstHere(f); return a ? `<span class="pick-line pick-delta">${Math.abs(a.total) < 0.5 ? 'Same materials cost as' : `${esc(signedDollars(a.total))} against`} your &ldquo;${esc(a.name)}&rdquo;</span>` : ''; })()}
          <span class="pick-line pick-looks">Looks ${f.looks.score}/100, ${esc(topTerms(f.looks))}</span>
          <span class="pick-why">${esc(tradeOff(f, all))}</span>
        </button>
        <button type="button" class="btn pick-cmp" data-compare="${esc(e.id)}" aria-pressed="${on}">${on ? 'In compare' : 'Compare'}</button>
      </li>`;
    }).join('');
    queueShots();
  }

  // Thumbnails are drawn one at a time after the page is up, so they never hold it.
  let shotTimer = /** @type {any} */ (0);
  function queueShots() {
    clearTimeout(shotTimer);
    const next = root.querySelector('[data-shot] .thumb-wait')?.parentElement;
    if (!next) return;
    shotTimer = setTimeout(() => {
      const id = /** @type {string} */ (next.getAttribute('data-shot'));
      const src = shot(id);
      next.innerHTML = src ? `<img src="${src}" alt="" width="600" height="400">` : '<span class="thumb-wait">3D needs WebGL</span>';
      queueShots();
    }, 60);
  }

  function renderTray() {
    tray.hidden = chosen.length === 0;
    tray.innerHTML = `<span><strong>Compare:</strong> ${chosen.map((id) => esc(titleOf(id))).join(', ')}${chosen.length < 2 ? ' <span class="muted">(pick one more)</span>' : ''}</span>
      <button type="button" class="btn primary" data-compare-open ${chosen.length < 2 ? 'disabled' : ''}>Compare side by side</button>
      <button type="button" class="btn" data-compare-clear>Clear</button>`;
  }

  function toggleCompare(id) {
    const i = chosen.indexOf(id);
    if (i >= 0) chosen.splice(i, 1);
    else {
      if (chosen.length >= MAX_COMPARE) chosen.shift();
      chosen.push(id);
    }
    syncCompare();
  }

  function syncCompare() {
    for (const b of document.querySelectorAll('[data-compare]')) {
      const on = chosen.includes(/** @type {string} */ (b.getAttribute('data-compare')));
      b.setAttribute('aria-pressed', String(on));
      if (b.classList.contains('pick-cmp') || b.hasAttribute('data-compare-label')) b.textContent = on ? 'In compare' : 'Compare';
    }
    renderTray();
  }

  // ---- the dialog ----
  function show(html, label) {
    if (!dialog.open) opener = /** @type {HTMLElement} */ (document.activeElement);
    dialog.setAttribute('aria-labelledby', 'pick-dlg-title');
    dialog.innerHTML = `<div class="dlg-head"><h2 class="dlg-title" id="pick-dlg-title">${esc(label)}</h2><button type="button" class="btn" data-close>Close</button></div>${html}`;
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    }
    dialog.scrollTop = 0;
    /** @type {HTMLElement | null} */ (dialog.querySelector('[data-close]'))?.focus();
  }

  function openDetail(id) {
    const f = factsOf(id);
    const all = allFacts();
    const max = Math.max(...f.breakdown.map((b) => b.total));
    const on = chosen.includes(id);
    const doors = f.openings.filter((o) => o.kind === 'door');
    const wins = f.openings.filter((o) => o.kind === 'window');
    const opening = (o) => `<li>${o.kind === 'door' ? 'Door' : 'Window'} on the ${WALL[o.wall] || o.wall} wall, ${esc(o.size)}: ${esc(o.what)}</li>`;
    const html = `
      <p class="why"><strong>Why it's here:</strong> ${esc(tradeOff(f, all))}</p>
      <div class="shots">${stored(id, 'hero')
        ? STORED_VIEWS.map((v) => { const r = /** @type {any} */ (stored(id, v.key)); return r ? `<figure><img src="${esc(r.src)}" alt="${esc(r.alt)}" width="${r.width}" height="${r.height}"><figcaption>${v.label}</figcaption></figure>` : ''; }).join('')
        : VIEWS.map((v) => `<figure>${img(id, v)}<figcaption>${v.label}</figcaption></figure>`).join('')}</div>
      <div class="detail-grid">
        <section aria-labelledby="dd-cost"><h3 id="dd-cost">Price: ${money(f.total)}</h3>
          <p class="muted">Materials at the listed store prices, before tax (${money(f.grandTotal)} with tax and delivery as set).</p>
          ${(() => {
            const a = againstHere(f, 5);
            if (!a) return '';
            return `<p class="pick-delta">Against your &ldquo;${esc(a.name)}&rdquo;: materials ${esc(signedDollars(a.total))}${a.phrase ? ` (${esc(a.phrase)})` : ''}.</p>
          <details><summary>From your design's total to this one, by assembly</summary>${bridgeHtml(a.from, f.costs, { toLabel: titleOf(id) })}</details>`;
          })()}
          <ul class="bars">${f.breakdown.map((b) => `<li><span>${esc(b.name)}</span><span class="bar" aria-hidden="true"><span style="width:${Math.max(2, (b.total / max) * 100).toFixed(0)}%"></span></span><span class="n">${money(b.total)}</span></li>`).join('')}</ul>
        </section>
        <section aria-labelledby="dd-size"><h3 id="dd-size">Size and storage</h3>
          <dl class="facts">
            <div><dt>Footprint</dt><dd>${esc(f.footprint)}, ${Math.round(f.footprintSqFt)} sq ft${f.overLimit ? ' <span class="fail">over the size limit</span>' : ''}</dd></div>
            <div><dt>Wall height</dt><dd>${fmtFtIn(f.wallHeight)}</dd></div>
            <div><dt>Peak</dt><dd>${fmtFtIn(f.peak)} above grade</dd></div>
            <div><dt>Floor inside</dt><dd>${n1(f.storage.floorSqFt)} sq ft</dd></div>
            <div><dt>Volume inside</dt><dd>${Math.round(f.storage.volumeCuFt)} cu ft</dd></div>
            <div><dt>Shelf wall</dt><dd>${n1(f.storage.shelfFt)} ft with no door or window</dd></div>
            <div><dt>Headroom</dt><dd>${fmtFtIn(f.storage.headroom)} ${f.storage.open ? 'under the ridge beam, open to the roof' : 'under the rafter ties (more above them)'}</dd></div>
            <div><dt>Per $100</dt><dd>${n1(f.perDollar.sqFtPer100)} sq ft, ${Math.round(f.perDollar.cuFtPer100)} cu ft</dd></div>
            ${kitLineHtml(f, 3, leftOutOf(f))}
          </dl>
        </section>
        <section aria-labelledby="dd-look"><h3 id="dd-look">Looks</h3>
          <p><strong>${f.looks.score}/100</strong> on the tool's looks score: rules of thumb for small outbuildings, not a measure of beauty.</p>
          <ul class="looks-terms">${f.looks.terms.map((t) => `<li><span>${esc(t.label)}</span> <span class="n">${t.points}/${t.max}</span> <span class="muted">${esc(t.why)}</span></li>`).join('')}</ul>
          <dl class="facts">
            <div><dt>Style</dt><dd>${esc(f.style)}</dd></div>
            <div><dt>Siding</dt><dd>${esc(f.siding)}</dd></div>
            <div><dt>Roof</dt><dd>${esc(f.roof)}</dd></div>
          </dl>
          <h4>Doors (${doors.length}) and windows (${wins.length})</h4>
          <ul class="ops">${[...doors, ...wins].map(opening).join('') || '<li>None</li>'}</ul>
          ${f.storage.widestDoor ? `<p class="muted">Widest door: ${fmtIn(f.storage.widestDoor)} rough opening.</p>` : ''}
        </section>
        <section aria-labelledby="dd-frame"><h3 id="dd-frame">Structure</h3>
          <dl class="facts">
            <div><dt>Roof</dt><dd>${esc(f.structure.roof)}</dd></div>
            <div><dt>Rafters</dt><dd>${esc(f.structure.rafters)}</dd></div>
            <div><dt>Walls</dt><dd>${esc(f.structure.walls)} studs</dd></div>
            <div><dt>Floor</dt><dd>${esc(f.structure.floor)}</dd></div>
            <div><dt>Foundation</dt><dd>${esc(f.structure.foundation)}</dd></div>
            <div><dt>Checks</dt><dd class="${f.structure.ok ? 'ok' : 'fail'}">${f.structure.ok ? 'pass' : 'over capacity'}${f.structure.worst ? `; most used: ${esc(f.structure.worst.member.toLowerCase())}, ${Math.round(f.structure.worst.ratio * 100)}%` : ''}</dd></div>
          </dl>
          <p class="muted">Allowable-stress checks under the loads set in the design. Not engineered or code-checked.</p>
        </section>
      </div>
      <div class="dlg-actions">
        <button type="button" class="btn primary" data-start="${esc(id)}">Start from this design</button>
        <button type="button" class="btn" data-compare="${esc(id)}" data-compare-label aria-pressed="${on}">${on ? 'In compare' : 'Compare'}</button>
        ${chosen.length >= 2 || (chosen.length === 1 && !on) ? '<button type="button" class="btn" data-compare-open>Compare side by side</button>' : ''}
      </div>`;
    show(html, titleOf(id));
    opts.count?.('compares');
  }

  function openCompare() {
    if (chosen.length < 2) return;
    const list = chosen.map(factsOf);
    const rows = compareRows(list);
    const n = list.length;
    let group = '';
    let body = '';
    for (const r of rows) {
      if (r.group !== group) { group = r.group; body += `<h3 class="cmp-group">${esc(group)}</h3>`; }
      body += `<div class="cmp-row${r.differs ? ' differs' : ' same'}" role="group" aria-label="${esc(r.label)}"><div class="cmp-label">${esc(r.label)}${r.differs ? '' : ' <span class="muted">(same)</span>'}</div>${r.values.map((v, i) => `<div class="cmp-cell${r.best.includes(i) ? ' best' : ''}"><span class="sr-only">${esc(titleOf(chosen[i]))}: </span>${esc(v)}${r.best.includes(i) ? ' <span class="best-tag">best</span>' : ''}</div>`).join('')}</div>`;
    }
    const head = chosen.map((id) => `<div class="cmp-head">${stored(id, 'hero') ? (() => { const r = /** @type {any} */ (stored(id, 'hero')); return `<img src="${esc(r.src)}" alt="${esc(r.alt)}" width="${r.width}" height="${r.height}">`; })() : img(id)}<strong>${esc(titleOf(id))}</strong><span>${money(factsOf(id).total)}</span>
      <button type="button" class="btn primary" data-start="${esc(id)}">Start from this</button>
      <button type="button" class="btn" data-detail="${esc(id)}">Details</button></div>`).join('');
    const html = `<label class="check"><input type="checkbox" data-only-diff> Only show differences</label>
      <div class="cmp" style="--n:${n}"><div class="cmp-heads">${head}</div>${body}</div>
      <p class="muted">"Best" marks the lowest cost or the most room on a row; rows the designs share are greyed. Materials only, at the listed prices.</p>`;
    show(html, `Compare ${n} designs`);
    opts.count?.('compares');
  }

  function close() {
    if (typeof dialog.close === 'function' && dialog.open) dialog.close(); else dialog.removeAttribute('open');
    opener?.focus?.();
  }

  // ---- events ----
  document.addEventListener('click', (ev) => {
    const t = /** @type {HTMLElement} */ (ev.target);
    const d = t.closest('[data-detail]');
    if (d && entry(/** @type {string} */ (d.getAttribute('data-detail')))) { openDetail(/** @type {string} */ (d.getAttribute('data-detail'))); return; }
    const c = t.closest('[data-compare]');
    if (c && entry(/** @type {string} */ (c.getAttribute('data-compare')))) { toggleCompare(/** @type {string} */ (c.getAttribute('data-compare'))); return; }
    if (t.closest('[data-compare-open]')) { openCompare(); return; }
    if (t.closest('[data-compare-clear]')) { chosen.length = 0; syncCompare(); return; }
    const s = t.closest('[data-start]');
    if (s && entry(/** @type {string} */ (s.getAttribute('data-start')))) {
      const e = /** @type {Entry} */ (entry(/** @type {string} */ (s.getAttribute('data-start'))));
      close();
      opts.onStart(structuredClone(e.design));
      return;
    }
    if (t.closest('[data-close]')) close();
  });
  dialog.addEventListener('change', (ev) => {
    const t = /** @type {HTMLInputElement} */ (ev.target);
    if (t.matches('[data-only-diff]')) dialog.querySelector('.cmp')?.classList.toggle('only-diff', t.checked);
  });
  dialog.addEventListener('close', () => opener?.focus?.());
  // A click on the backdrop (outside the panel) closes it.
  dialog.addEventListener('click', (ev) => { if (ev.target === dialog) close(); });

  renderStrip();
  // The stored pictures' list; without it (offline, an old copy) every picture is drawn live.
  fetch(new URL('renders/manifest.json', import.meta.url)).then((r) => (r.ok ? r.json() : null)).then((m) => {
    if (!m?.designs) return;
    manifest = m;
    renderStrip();
  }).catch(() => {});
  renderTray();

  return {
    openDetail,
    openCompare,
    toggleCompare,
    /** Replace the list (say, with a search's optimised designs). @param {Entry[]} next */
    setEntries(next) { entries = next; facts.clear(); chosen.length = 0; renderStrip(); renderTray(); },
    /** Prices changed: re-price once typing pauses (each design takes about 30 ms to price). */
    reprice() { clearTimeout(priceTimer); priceTimer = setTimeout(() => { facts.clear(); here = null; renderStrip(); }, 500); },
    /** The open design changed: redraw the cards' cost against it once editing pauses. */
    refresh() { clearTimeout(priceTimer); priceTimer = setTimeout(() => { if (opts.current && JSON.stringify(opts.current()) !== here?.key) renderStrip(); }, 500); },
    get chosen() { return [...chosen]; },
  };
}
