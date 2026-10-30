// @ts-check
// The HOA packet page: opens the design carried in the link (`#d=`, as the
// designer's "HOA packet" button writes it) or a preset (`#preset=8x12`), and
// lays out the packet for the browser's print dialog, which saves a PDF.

import { buildShed, normalize, PRESETS } from './model.mjs';
import { packetHtml, decodeDesign, encodeDesign } from './hoa.mjs';
import { createViewer } from './render3d.mjs';
import { recordUsage } from './usage.mjs';

const $ = (s) => /** @type {any} */ (document.querySelector(s));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let storage = null;
try { storage = globalThis.localStorage; } catch { /* blocked */ }
const optedOut = () => { try { return storage?.getItem('shed-designer-usage-preference') === '1'; } catch { return false; } };

/** The design this page shows, and where it came from. */
function current() {
  const pm = /#preset=([^&]*)/.exec(location.hash);
  const key = pm ? decodeURIComponent(pm[1]) : '';
  if (key && PRESETS[key]) return { design: normalize(PRESETS[key]()), preset: key, note: '' };
  const d = decodeDesign(location.hash);
  if (d) return { design: normalize(d), preset: '', note: '' };
  return { design: normalize(PRESETS['8x12']()), preset: '8x12', note: location.hash.includes('d=') ? 'That link is broken or cut short, so this is the starting 8x12 instead.' : '' };
}

let perspective = /** @type {string|null} */ (null);
let lastKey = '';

function render() {
  const { design, preset, note } = current();
  const shed = buildShed(design);
  const key = JSON.stringify(design);
  if ($('#with3d').checked) {
    if (key !== lastKey || !perspective) {
      const c = document.createElement('canvas');
      c.width = 1200; c.height = 760;
      const v = createViewer(c);
      perspective = v ? (v.show(shed, { refit: true }), v.snapshot()) : null;
    }
  }
  lastKey = key;
  $('#packet').innerHTML = packetHtml(shed, { perspective: $('#with3d').checked ? perspective : null, date: new Date().toISOString().slice(0, 10) });
  $('#note').textContent = note;
  $('#edit').href = `./#d=${encodeDesign(design)}`;
  document.title = `HOA packet: ${design.name}`;
  for (const a of document.querySelectorAll('#samples a')) a.toggleAttribute('aria-current', a.getAttribute('data-preset') === preset);
}

$('#samples').innerHTML = Object.keys(PRESETS).map((k) => `<a href="#preset=${encodeURIComponent(k)}" data-preset="${esc(k)}">${esc(k)}</a>`).join(' ');
$('#print').addEventListener('click', () => { recordUsage(storage, optedOut(), 'hoa-packets'); window.print(); });
$('#with3d').addEventListener('change', render);
window.addEventListener('hashchange', render);
render();
