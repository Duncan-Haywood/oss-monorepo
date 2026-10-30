// @ts-check
// Flicking through the strip of ready designs (picker.mjs's `.pick-list`):
// previous and next buttons with an "n of m" count, the arrow keys while the
// strip has focus, and a swipe (the strip scrolls sideways and snaps to a
// card). The strip may be redrawn at any time; cards are counted fresh.

import { GALLERY_DESIGNS } from './gallery-data.mjs';

/** The gallery as picker.mjs entries. */
export function galleryEntries() {
  return GALLERY_DESIGNS.map((g) => ({ id: g.id, title: g.title, reason: g.reason, design: structuredClone(g.design) }));
}

/**
 * @param {{ track: HTMLElement, prev: HTMLButtonElement, next: HTMLButtonElement, pos: HTMLElement, item?: string }} opts
 */
export function mountStripNav({ track, prev, next, pos, item = 'li' }) {
  const items = () => /** @type {HTMLElement[]} */ ([...track.querySelectorAll(`:scope > ${item}`)]);
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
  /** @param {number} n */
  function show(n) {
    const len = items().length;
    shown = Math.max(0, Math.min(len - 1, n));
    pos.textContent = len ? `${shown + 1} of ${len}` : '';
    prev.disabled = shown === 0;
    next.disabled = shown >= len - 1;
  }
  /** @param {number} i */
  function go(i) {
    const list = items();
    const n = Math.max(0, Math.min(list.length - 1, i));
    const el = list[n];
    if (!el) return;
    const left = Math.max(0, Math.min(track.scrollWidth - track.clientWidth, track.scrollLeft + el.getBoundingClientRect().left - track.getBoundingClientRect().left));
    heading = { n, left, t: Date.now() };
    track.scrollTo({ left, behavior: 'smooth' });
    show(n);
  }
  function settle() {
    if (heading && Math.abs(track.scrollLeft - heading.left) <= 2) { show(heading.n); heading = null; return; }
    if (heading && Date.now() - heading.t < 1000) return;
    heading = null;
    // A swipe to the strip's end: the last few cards are all in view, so count the last one as shown.
    show(track.scrollLeft > 0 && track.scrollLeft + track.clientWidth >= track.scrollWidth - 2 ? items().length - 1 : current());
  }
  prev.addEventListener('click', () => go(shown - 1));
  next.addEventListener('click', () => go(shown + 1));
  track.addEventListener('keydown', (e) => {
    if (e.target !== track) return; // keys on a card's own buttons stay theirs
    if (e.key === 'ArrowRight') { e.preventDefault(); go(shown + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(shown - 1); }
  });
  let timer = /** @type {any} */ (0);
  track.addEventListener('scroll', () => { clearTimeout(timer); timer = setTimeout(settle, 80); });
  // A redrawn strip (a re-price) keeps the count right.
  new MutationObserver(() => show(shown)).observe(track, { childList: true });
  show(0);
  return { go, get shown() { return shown; } };
}
