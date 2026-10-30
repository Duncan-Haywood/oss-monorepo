// @ts-check
// The "Start from a ready design" strip at the top of the page: one card per
// gallery design (gallery.mjs), priced now with the page's prices, flicked
// through with the arrows, the arrow keys or a swipe, and copied into a new
// design tab on "Customise".

import { buildShed, normalize } from './model.mjs';
import { describeGallery } from './gallery.mjs';
import { GALLERY_DESIGNS } from './gallery-data.mjs';
import { fmtFtIn } from './lumber.mjs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const whole = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const RANK = { price: 'lowest price', volume: 'most room', perDollar: 'most room per $', floor: 'biggest floor' };

/**
 * @param {{ root: HTMLElement, priceOf: (shed: any) => any, onPick: (design: any, title: string) => void, createViewer: (c: HTMLCanvasElement) => any }} opts
 */
export function mountGallery({ root, priceOf, onPick, createViewer }) {
  const track = /** @type {HTMLElement} */ (root.querySelector('#gallery-track'));
  const pos = /** @type {HTMLElement} */ (root.querySelector('#gallery-pos'));
  const prev = /** @type {HTMLButtonElement} */ (root.querySelector('#gallery-prev'));
  const next = /** @type {HTMLButtonElement} */ (root.querySelector('#gallery-next'));
  /** @type {Map<string, string>} */
  const thumbs = new Map();
  let cards = /** @type {any[]} */ ([]);
  let priceKey = '';

  function draw() {
    track.innerHTML = cards.map((c, i) => `
      <article class="card gallery-card" data-gallery="${esc(c.id)}" aria-roledescription="slide" aria-label="${i + 1} of ${cards.length}: ${esc(c.title)}">
        ${thumbs.has(c.id) ? `<img src="${thumbs.get(c.id)}" alt="3D view of the ${esc(c.title)}" width="360" height="240">` : '<div class="thumb-wait">rendering...</div>'}
        <h3 class="h4">${esc(c.title)}${c.rank ? ` <span class="pill">${RANK[c.rank]}</span>` : ''}</h3>
        <p class="gallery-price"><strong>${whole(c.total)}</strong> <span class="muted">materials before tax</span></p>
        <dl>
          <div><dt>Size</dt><dd>${esc(c.size)} (${c.footprint.toFixed(0)} sq ft)</dd></div>
          <div><dt>Clear floor</dt><dd>${c.floor.toFixed(0)} sq ft</dd></div>
          <div><dt>Room under the roof</dt><dd>${Math.round(c.volume)} cu ft</dd></div>
          <div><dt>Wall for shelves</dt><dd>${Math.round(c.shelf)} ft</dd></div>
          <div><dt>Widest door</dt><dd>${fmtFtIn(c.door)}</dd></div>
          <div><dt>Most used member</dt><dd>${Math.round(c.worst * 100)}% of capacity</dd></div>
        </dl>
        <p class="gallery-why">${esc(c.why)}</p>
        <p class="muted small">${esc(c.summary)}.${c.changes.length ? ` The search chose: ${esc(c.changes.join(', '))}.` : ''}</p>
        <button type="button" class="btn" data-pick="${esc(c.id)}">Customise this design</button>
      </article>`).join('');
    update();
  }

  /** Price the cards again when the prices or the store choice change. @param {string} key */
  function refresh(key) {
    if (key === priceKey && cards.length) return;
    priceKey = key;
    cards = describeGallery(GALLERY_DESIGNS, undefined, priceOf);
    const at = track.scrollLeft;
    draw();
    track.scrollLeft = at;
    queueThumbs();
  }

  // One thumbnail per tick, from an off-page viewer, so the page stays responsive.
  let viewer = null;
  let timer = /** @type {any} */ (0);
  function queueThumbs() {
    clearTimeout(timer);
    timer = setTimeout(function step() {
      const c = cards.find((x) => !thumbs.has(x.id));
      if (!c) return;
      if (!viewer) {
        const cv = document.createElement('canvas'); cv.width = 720; cv.height = 480;
        viewer = createViewer(cv);
      }
      if (!viewer) return;
      viewer.show(buildShed(normalize(c.design)), { refit: true });
      thumbs.set(c.id, viewer.snapshot());
      const slot = track.querySelector(`[data-gallery="${CSS.escape(c.id)}"] .thumb-wait`);
      if (slot) slot.outerHTML = `<img src="${thumbs.get(c.id)}" alt="3D view of the ${esc(c.title)}" width="360" height="240">`;
      timer = setTimeout(step, 30);
    }, 400);
  }

  const items = () => /** @type {HTMLElement[]} */ ([...track.querySelectorAll('.gallery-card')]);
  /** The card whose left edge is nearest the strip's. */
  function current() {
    const left = track.getBoundingClientRect().left;
    let best = 0; let gap = Infinity;
    items().forEach((el, i) => { const g = Math.abs(el.getBoundingClientRect().left - left); if (g < gap) { gap = g; best = i; } });
    return best;
  }
  // Where a click or key last sent the strip, so the scroll events of its
  // smooth scroll do not count it back from halfway.
  let heading = /** @type {{ n: number, left: number, t: number } | null} */ (null);
  let shown = 0;
  const at = () => shown;
  /** @param {number} i */
  function go(i) {
    const list = items();
    const n = Math.max(0, Math.min(list.length - 1, i));
    const el = list[n];
    if (!el) return;
    const left = Math.min(track.scrollWidth - track.clientWidth, track.scrollLeft + el.getBoundingClientRect().left - track.getBoundingClientRect().left);
    heading = { n, left, t: Date.now() };
    track.scrollTo({ left, behavior: 'smooth' });
    show(n);
  }
  /** @param {number} n */
  function show(n) {
    shown = n;
    const len = items().length;
    pos.textContent = `${n + 1} of ${len}`;
    prev.disabled = n === 0;
    next.disabled = n === len - 1;
  }
  function update() {
    if (heading && Math.abs(track.scrollLeft - heading.left) <= 2) { show(heading.n); heading = null; return; }
    if (heading && Date.now() - heading.t < 1000) return;
    heading = null;
    // A swipe to the strip's end the last few cards are all in view: count the last one as shown.
    show(track.scrollLeft + track.clientWidth >= track.scrollWidth - 2 && track.scrollLeft > 0 ? items().length - 1 : current());
  }
  prev.addEventListener('click', () => go(at() - 1));
  next.addEventListener('click', () => go(at() + 1));
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(at() + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(at() - 1); }
  });
  let scrollTimer = /** @type {any} */ (0);
  track.addEventListener('scroll', () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(update, 80); });
  track.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-pick]');
    if (!b) return;
    const c = cards.find((x) => x.id === b.getAttribute('data-pick'));
    if (c) onPick(structuredClone(c.design), c.title);
  });
  return { refresh };
}
