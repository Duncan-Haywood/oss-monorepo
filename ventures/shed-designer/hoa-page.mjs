// @ts-check
// The HOA packet page: opens the design carried in the link (`#d=`, as the
// designer's "HOA packet" button writes it) or a preset (`#preset=8x12`), and
// lays out the packet for the browser's print dialog, which saves a PDF.

import { buildShed, normalize, PRESETS } from './model.mjs';
import { packetHtml, decodeDesign, encodeDesign, cornerFor, CORNERS } from './hoa.mjs';
import { createViewer } from './render3d.mjs';
import { pictureFor } from './renders.mjs';
import { GALLERY_DESIGNS } from './gallery-data.mjs';
import { recordUsage } from './usage.mjs';

const $ = (s) => /** @type {any} */ (document.querySelector(s));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let storage = null;
try { storage = globalThis.localStorage; } catch { /* blocked */ }
const optedOut = () => { try { return storage?.getItem('shed-designer-usage-preference') === '1'; } catch { return false; } };

/** The design this page shows, where it came from, and the design as stored (for its pre-drawn picture). */
function current() {
  const pm = /#preset=([^&]*)/.exec(location.hash);
  const key = pm ? decodeURIComponent(pm[1]) : '';
  if (key && PRESETS[key]) { const raw = PRESETS[key](); return { design: normalize(raw), raw, preset: key, note: '' }; }
  const gm = /#gallery=([^&]*)/.exec(location.hash);
  const g = gm ? GALLERY_DESIGNS.find((x) => x.id === decodeURIComponent(gm[1])) : null;
  if (g) return { design: normalize(/** @type {any} */ (g.design)), raw: g.design, preset: `gallery:${g.id}`, note: '' };
  const d = decodeDesign(location.hash);
  if (d) return { design: normalize(d), raw: d, preset: '', note: '' };
  const raw = PRESETS['8x12']();
  return { design: normalize(raw), raw, preset: '8x12', note: location.hash.includes('d=') ? 'That link is broken or cut short, so this is the starting 8x12 instead.' : '' };
}

let perspective = /** @type {string|null} */ (null);
let lastKey = '';
/** The pre-drawn pictures (renders/manifest.json), once loaded; null until then or if it cannot load. */
let manifest = /** @type {any} */ (null);

function render() {
  const { design, raw, preset, note } = current();
  const shed = buildShed(design);
  const corner = cornerFor(design, $('#corner').value);
  const key = `${JSON.stringify(design)}|${corner}|${manifest ? 1 : 0}`;
  if ($('#with3d').checked && (key !== lastKey || !perspective)) {
    // A starting or gallery design seen from the front-right corner already has
    // a drawn picture (make-renders.mjs, the same viewer); anything else is drawn here.
    // Gallery designs keep only the smaller card picture.
    const stored = corner === 'front-right' ? ['hero', 'card'].map((v) => pictureFor(manifest, raw, v)).find(Boolean) : null;
    if (stored) perspective = stored.src;
    else {
      const c = document.createElement('canvas');
      c.width = 1200; c.height = 760;
      const v = createViewer(c, { presentation: true });
      perspective = v ? (v.show(shed, { refit: true }), v.view(CORNERS[corner].theta, 0.26), v.snapshot()) : null;
    }
  }
  lastKey = key;
  $('#packet').innerHTML = packetHtml(shed, { perspective: $('#with3d').checked ? perspective : null, corner, date: new Date().toISOString().slice(0, 10) });
  $('#note').textContent = note;
  $('#edit').href = `./#d=${encodeDesign(design)}`;
  document.title = `HOA packet: ${design.name}`;
  for (const a of document.querySelectorAll('#samples a, #gallery-samples a')) a.toggleAttribute('aria-current', a.getAttribute('data-preset') === preset);
}

$('#samples').innerHTML = Object.keys(PRESETS).map((k) => `<a href="#preset=${encodeURIComponent(k)}" data-preset="${esc(k)}">${esc(k)}</a>`).join(' ');
$('#gallery-samples').innerHTML = GALLERY_DESIGNS.map((g) => `<a href="#gallery=${encodeURIComponent(g.id)}" data-preset="gallery:${esc(g.id)}">${esc(g.title)}</a>`).join(' ');
$('#print').addEventListener('click', () => { recordUsage(storage, optedOut(), 'hoa-packets'); window.print(); });
$('#with3d').addEventListener('change', render);
$('#corner').addEventListener('change', render);
window.addEventListener('hashchange', render);
render();
fetch('renders/manifest.json').then((r) => (r.ok ? r.json() : null)).then((m) => { if (m) { manifest = m; render(); } }).catch(() => {});
