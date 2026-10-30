// Writes one "how much lumber does an NxM shed take" page per common size,
// plus an index, from the framing engine itself, so the counts on the pages are
// the ones the tool prints. Run: node make-size-pages.mjs  (then commit the output).
import { writeFileSync } from 'node:fs';
import { PRESETS, buildShed } from './model.mjs';
import { estimate } from './estimate.mjs';

export const SIZES = [
  [8, 8, '8x10'], [8, 10, '8x10'], [8, 16, '8x10'],
  [10, 10, '10x12'], [10, 12, '10x12'], [10, 14, '10x12'], [10, 16, '10x12'], [10, 20, '10x12'],
  [12, 12, '12x16'], [12, 14, '12x16'], [12, 16, '12x16'], [12, 20, '12x16'], [12, 24, '12x16'], [12, 32, '12x16'],
  [14, 14, '12x16'], [14, 20, '12x16'], [16, 20, '12x16'], [16, 24, '12x16'],
];
// The 8x12 page predates this script and is hand-written, so 8x12 is linked, not rewritten.
const HAND = '8x12 page: shed-plans-with-cut-list.html';
const HAND_FILE = 'shed-plans-with-cut-list.html';
const slug = (w, l) => `how-much-lumber-for-a-${w}x${l}-shed.html`;
const money = (n) => {
  const format = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(n));
  return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};
const ft = (inch) => `${inch / 12}'`;

export function design(w, l, base) {
  const d = PRESETS[base]();
  d.name = `${w}x${l} gable shed`;
  d.width = w * 12;
  d.length = l * 12;
  // Keep every opening at least 36" (king, jack and a stud) from the end of its wall.
  const wallLen = (wall) => (wall === 'front' || wall === 'back' ? d.length : d.width);
  d.openings = d.openings.map((o) => ({ ...o, offset: Math.min(o.offset, wallLen(o.wall) - o.width - 36) }));
  // Openings on one wall need 12" between them for their kings and jacks; spread them evenly if they crowd.
  for (const wall of ['front', 'back', 'left', 'right']) {
    const on = d.openings.filter((o) => o.wall === wall).sort((a, b) => a.offset - b.offset);
    const crowded = on.some((o, i) => i > 0 && o.offset - (on[i - 1].offset + on[i - 1].width) < 12);
    if (crowded) {
      const gap = (wallLen(wall) - on.reduce((a, o) => a + o.width, 0)) / (on.length + 1);
      let x = gap;
      for (const o of on) { o.offset = Math.round(x); x += o.width + gap; }
    }
  }
  return d;
}

export function figures(w, l, base) {
  const shed = buildShed(design(w, l, base));
  const est = estimate(shed);
  const rows = est.lumber.map((m) => {
    const byStock = {};
    for (const b of m.result.boards) byStock[b.stock] = (byStock[b.stock] || 0) + 1;
    return {
      material: m.material, pieces: m.pieces, cost: m.result.cost,
      boards: m.result.boards.length,
      stocks: Object.entries(byStock).sort((a, b) => a[0] - b[0]).map(([s, n]) => `${n} x ${ft(+s)}`).join(', '),
    };
  });
  return {
    w, l, base, rows,
    pieces: est.pieces, boards: est.boards, cutCost: est.cutSheetCost, bound: est.lowerBound,
    lumber: est.lumberCost, total: est.grandTotal, perSqFt: est.grandTotal / (w * l),
    rafter: shed.dims.rafterCut, pitch: shed.design.pitch, problems: est.problems.length + shed.warnings.length,
  };
}

const CSS = `    :root { font-family: ui-sans-serif, system-ui, sans-serif; color: #1f2420; background: #f4f1ea; }
    body { max-width: 780px; margin: auto; padding: 30px 18px 50px; line-height: 1.6; }
    h1 { font: 800 clamp(1.9rem, 5vw, 3rem)/1.05 Georgia, serif; letter-spacing: -.03em; }
    h2 { margin-top: 2em; font-size: 1.25rem; }
    table { border-collapse: collapse; width: 100%; font-size: .92rem; background: #fffdf8; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e2dbcc; }
    td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
    .cta { display: inline-block; background: #24392b; color: #f8f5eb; padding: 12px 20px; border-radius: 999px; font-weight: 700; text-decoration: none; }
    .note { background: #fffdf8; border: 1px solid #d8d1c2; border-radius: 12px; padding: 12px 16px; }
    footer { font-size: .85rem; color: #5b6157; margin-top: 40px; }`;
const ICON = `<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Crect%20width='32'%20height='32'%20rx='7'%20fill='%23784421'/%3E%3Cpath%20d='M6%2015L16%207l10%208v10H6z'%20fill='%23fff'/%3E%3C/svg%3E">`;
const FOOT = `  <footer>
    <p><strong>No warranty.</strong> This tool is provided free and as-is, without warranty of any kind. It is not engineering, construction, building-code or legal advice and does not replace a qualified professional or your building department. <strong>You are responsible for reviewing and verifying its output before relying on it.</strong> Prices are store listings seen 2026-10-29 and may be stale; type your own in the tool.</p>
    <p>Everything runs in your browser; nothing is uploaded. MIT licensed. <a href="https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/shed-designer">Source</a> · <a href="https://github.com/sponsors/Duncan-Haywood">GitHub Sponsors</a></p>
  </footer>`;

const sizeRow = (f) => `<tr><td><a href="${slug(f.w, f.l)}">${f.w}x${f.l}</a></td><td class="n">${f.pieces}</td><td class="n">${f.boards}</td><td class="n">${money(f.lumber)}</td><td class="n">${money(f.total)}</td></tr>`;

export function page(f, all) {
  const t = `${f.w}x${f.l}`;
  const sq = f.w * f.l;
  const title = `How Much Lumber for a ${t} Shed? ${f.pieces} Pieces, ${f.boards} Boards, Cut List`;
  const desc = `A ${t} gable shed (${sq} sq ft) framed board by board: ${f.pieces} pieces from ${f.boards} boards, lumber about ${money(f.lumber)}, whole shed about ${money(f.total)}. Free cut list and plans in your browser.`;
  const tableRows = f.rows.map((r) => `<tr><td>${r.material}</td><td class="n">${r.pieces}</td><td class="n">${r.boards}</td><td>${r.stocks}</td><td class="n">${money(r.cost)}</td></tr>`).join('\n      ');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${ICON}
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="How much lumber does a ${t} shed take?">
  <meta property="og:description" content="${f.pieces} framing pieces from ${f.boards} boards, worked out from the framing, not a rule of thumb.">
  <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: `How much lumber does a ${t} shed take?` })}</script>
  <style>
${CSS}
  </style>
</head>
<body>
  <p><a href="./">Shed Designer</a> · <a href="shed-lumber-list-by-size.html">All sizes</a></p>
  <h1>How much lumber does a ${t} shed take?</h1>
  <p>A ${t} gable shed on skids, framed the common way, takes <strong>${f.pieces} framing pieces cut from ${f.boards} boards</strong>. The cut sheet's boards cost ${money(f.cutCost)} (no way of cutting those pieces from those lengths can cost less than ${money(f.bound)}); a few spare boards bring the lumber to about ${money(f.lumber)}. The whole shed, with siding, roofing, sheathing, fasteners and a gravel pad, comes to about ${money(f.total)} before sales tax, ${money(f.perSqFt)} per square foot.</p>
  <p><a class="cta" href="./">Open Shed Designer</a> and change the size, door and windows: the counts update to your design.</p>

  <h2>The design behind these numbers</h2>
  <p>${f.l} ft along the ridge, ${f.w} ft across the gable, 8 ft walls (91-1/2" studs under three 1-1/2" plates), a ${f.pitch}/12 roof with a 12" overhang, 2x4 walls 16" on centre, pressure-treated 4x6 skids on a gravel pad, a 3/4" plywood floor, T1-11 siding and shingles. Rafters are cut ${f.rafter}" long including the plumb cut. Doors and windows are those of the tool's ${f.base} preset, with kings, jacks, headers, sills and cripples framed around each.</p>

  <h2>Lumber by material</h2>
  <table>
    <thead><tr><th>Material</th><th class="n">Pieces</th><th class="n">Boards</th><th>Board lengths</th><th class="n">Cost</th></tr></thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>
  <p>Pieces are packed into 8 to 16 ft boards by a cut optimizer, so a stud comes from the cheapest board that holds it; one board often yields several pieces.</p>

  <h2>Other sizes</h2>
  <table>
    <thead><tr><th>Size</th><th class="n">Pieces</th><th class="n">Boards</th><th class="n">Lumber</th><th class="n">Whole shed</th></tr></thead>
    <tbody>
      ${all.filter((g) => g !== f).map(sizeRow).join('\n      ')}
      <tr><td><a href="${HAND_FILE}">8x12</a></td><td colspan="4">worked example, with the door and peak-height variants</td></tr>
    </tbody>
  </table>

  <p class="note">The counts were printed by the tool's own engine for these designs on 2026-10-29 (<code>make-size-pages.mjs</code>); a test re-runs the engine and fails if a number here drifts. Its tests check studs, jacks, headers and cripples by hand and that no piece floats or overlaps. It has not been checked by building a shed from it. Door and window count, wall height, roof pitch and local prices change every figure, so use the tool for your design. Your building department decides whether you need a permit.</p>

${FOOT}
</body>
</html>
`;
}

export function indexPage(all) {
  const rows = all.map((f) => `<tr><td><a href="${slug(f.w, f.l)}">${f.w}x${f.l}</a></td><td class="n">${f.w * f.l}</td><td class="n">${f.pieces}</td><td class="n">${f.boards}</td><td class="n">${money(f.lumber)}</td><td class="n">${money(f.total)}</td><td class="n">${money(f.perSqFt)}</td></tr>`).join('\n      ');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${ICON}
  <title>Shed Lumber List by Size: 8x8 to 16x24, Boards and Cost</title>
  <meta name="description" content="How many boards and how much money a gable shed takes at ${all.length + 1} common sizes from 8x8 to 16x24, each framed stud by stud, with the cut list for your own size free in the browser.">
  <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: 'Shed lumber list by size' })}</script>
  <style>
${CSS}
  </style>
</head>
<body>
  <p><a href="./">Shed Designer</a></p>
  <h1>Shed lumber list by size</h1>
  <p>Each row is a gable shed framed board by board by the Shed Designer engine, not a rule of thumb. Click a size for its lumber by material; <a href="${HAND_FILE}">8x12</a> has its own worked page.</p>
  <table>
    <thead><tr><th>Size</th><th class="n">Sq ft</th><th class="n">Pieces</th><th class="n">Boards</th><th class="n">Lumber</th><th class="n">Whole shed</th><th class="n">Per sq ft</th></tr></thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <p><a class="cta" href="./">Design your own size</a></p>
${FOOT}
</body>
</html>
`;
}

export function generate() {
  const all = SIZES.map(([w, l, b]) => figures(w, l, b));
  const files = { 'shed-lumber-list-by-size.html': indexPage(all) };
  for (const f of all) files[slug(f.w, f.l)] = page(f, all);
  return { all, files };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { files } = generate();
  for (const [name, html] of Object.entries(files)) writeFileSync(new URL(name, import.meta.url), html);
  const urls = ['', HAND_FILE, 'hoa-packet.html', ...Object.keys(files)];
  const base = 'https://example.invalid/shed-designer/';
  writeFileSync(new URL('sitemap.xml', import.meta.url), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${base}${u}</loc></url>`).join('')}</urlset>`);
  console.log(`wrote ${Object.keys(files).length} pages`);
}
