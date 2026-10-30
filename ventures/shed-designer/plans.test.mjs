// The plan set checked against the model it was drawn from: the DXF parsed
// back group by group, every labelled dimension against the length it spans,
// the gable studs against the roof line drawn over them, and every printed
// mark inside the page and clear of the title block.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign, PRESETS } from './model.mjs';
import { estimate } from './estimate.mjs';
import { buildSheets, sheetSvg, sheetsDxf } from './drawings.mjs';

const designs = [['default', defaultDesign()], ...Object.entries(PRESETS).map(([name, make]) => [name, make()])];
// A birdsmouth and a connector seat, a ridge board and a beam, and a wide overhang.
designs.push(['birdsmouth beam', { ...defaultDesign(), rafterSeat: 'birdsmouth', roofType: 'ridgeBeam' }]);
designs.push(['connector board', { ...defaultDesign(), rafterSeat: 'connector', roofType: 'ridgeBoard', overhang: 12 }]);
// A wide site-built double door, which has its own sheet and parts.
designs.push(['site-built door', { ...defaultDesign(), length: 168, openings: [{ id: 'o1', kind: 'door', wall: 'front', offset: 40, width: 60, height: 78, product: 'site-built' }] }]);

const sets = designs.map(([name, design]) => {
  const shed = buildShed(design);
  const marks = new Map();
  for (const p of estimate(shed).parts) for (const id of p.ids) marks.set(id, p.mark);
  return { name, shed, sheets: buildSheets(shed, marks) };
});

/** Read a DXF back as [code, value] pairs, failing on anything malformed. */
function parseDxf(text) {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  assert.equal(lines.length % 2, 0, 'group codes and values pair up');
  const pairs = [];
  for (let i = 0; i < lines.length; i += 2) {
    assert.match(lines[i], /^-?\d+$/, `line ${i + 1} is a group code`);
    pairs.push([Number(lines[i]), lines[i + 1]]);
  }
  return pairs;
}

/** Entities in the ENTITIES section, each as a map of group code to its values. */
function entities(pairs) {
  const start = pairs.findIndex(([c, v], i) => c === 2 && v === 'ENTITIES' && pairs[i - 1][1] === 'SECTION');
  assert.ok(start > 0, 'an ENTITIES section');
  const out = [];
  for (let i = start + 1; i < pairs.length; i++) {
    const [c, v] = pairs[i];
    if (c === 0 && v === 'ENDSEC') return out;
    if (c === 0) out.push({ type: v, g: new Map() });
    else {
      const e = out[out.length - 1];
      e.g.set(c, [...(e.g.get(c) || []), v]);
    }
  }
  assert.fail('ENTITIES is never closed');
}

test('the DXF parses back: R12, declared layers, finite coordinates, one-line ASCII text', () => {
  for (const { name, sheets } of sets) {
    const pairs = parseDxf(sheetsDxf(sheets));
    const header = pairs.findIndex(([c, v]) => c === 9 && v === '$ACADVER');
    assert.equal(pairs[header + 1][1], 'AC1009', `${name}: R12`);
    const layers = new Set(pairs.filter(([c], i) => c === 2 && pairs[i - 1][0] === 0 && pairs[i - 1][1] === 'LAYER').map(([, v]) => v));
    const ents = entities(pairs);
    assert.ok(ents.length > 500, name);
    let texts = 0;
    for (const e of ents) {
      assert.ok(['LINE', 'TEXT'].includes(e.type), `${name}: ${e.type}`);
      const layer = e.g.get(8)?.[0];
      assert.ok(layers.has(layer), `${name}: layer ${layer} is declared`);
      for (const code of [10, 20, 30, 11, 21, 31, 40, 50]) for (const v of e.g.get(code) || []) assert.ok(Number.isFinite(Number(v)), `${name}: ${e.type} ${code}=${v}`);
      if (e.type === 'LINE') for (const code of [10, 20, 11, 21]) assert.equal(e.g.get(code)?.length, 1, `${name}: LINE has ${code}`);
      if (e.type === 'TEXT') {
        texts++;
        const s = e.g.get(1)[0];
        assert.ok(Number(e.g.get(40)[0]) > 0, `${name}: text height`);
        // R12 has no UTF-8: anything outside ASCII turns to garbage in older readers.
        assert.match(s, /^[\x20-\x7e]*$/, `${name}: ${JSON.stringify(s)}`);
      }
    }
    assert.ok(texts > 50, name);
  }
});

/** The first length written in a label: 12' 0", 7' 2-1/2", 53", 3-1/2" or 15/16". */
function firstLength(s) {
  const m = s.match(/(?:(\d+)'\s*)?(?:(\d+)(?:-(\d+)\/(\d+))?"|(\d+)\/(\d+)")/);
  if (!m) return null;
  const inches = m[2] !== undefined ? Number(m[2]) + (m[3] ? Number(m[3]) / Number(m[4]) : 0) : Number(m[5]) / Number(m[6]);
  return Number(m[1] || 0) * 12 + inches;
}

test('every labelled dimension says the length it spans, to 1/16"', () => {
  let n = 0;
  for (const { name, sheets } of sets) {
    for (const s of sheets) {
      for (const it of s.items) {
        if (it.t !== 'dim' || !it.text) continue;
        const said = firstLength(it.text);
        if (said === null) continue;
        n++;
        const spans = Math.hypot(it.b[0] - it.a[0], it.b[1] - it.a[1]);
        assert.ok(Math.abs(said - spans) <= 1 / 16 + 1e-6, `${name}, ${s.id}: "${it.text}" spans ${spans.toFixed(3)}"`);
      }
    }
  }
  assert.ok(n > 200, String(n));
});

test('the rafter detail dimensions the board from long point to long point', () => {
  for (const { name, shed, sheets } of sets) {
    const sheet = sheets.find((s) => s.id === 'rafter');
    const d = sheet.items.find((it) => it.t === 'dim' && /cut length/.test(it.text || ''));
    assert.ok(Math.abs(Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) - shed.dims.rafterCut) < 1 / 16, name);
  }
});

test('gable studs stop at the roof line drawn over them', () => {
  for (const { name, shed, sheets } of sets) {
    for (const side of ['left', 'right']) {
      const sheet = sheets.find((s) => s.id === `wall-${side}`);
      const roof = sheet.items.find((it) => it.t === 'poly' && it.cls === 'roofline');
      const [[x0, z0], [x1, z1]] = roof.pts;
      const mid = (x0 + roof.pts[roof.pts.length - 1][0]) / 2;
      const underside = (x) => z0 + (Math.min(x, 2 * mid - x) - x0) * (z1 - z0) / (x1 - x0);
      const studs = sheet.items.filter((it) => it.t === 'poly' && it.closed && it.pts.length === 4 && it.pts[2][1] !== it.pts[3][1]);
      assert.ok(studs.length >= 2, `${name} ${side}: gable studs drawn`);
      for (const st of studs) for (const [x, z] of [st.pts[2], st.pts[3]]) assert.ok(Math.abs(z - underside(x)) < 0.02, `${name} ${side}: stud top ${z.toFixed(2)} vs roof ${underside(x).toFixed(2)} at ${x.toFixed(2)}`);
    }
  }
});

test('nothing on a printed sheet runs off the page or under the title block', () => {
  const W = 1100;
  for (const { name, sheets } of sets) {
    for (const [i, s] of sheets.entries()) {
      const svg = sheetSvg(s, { name, number: i + 1, of: sheets.length });
      const tbY = Number(svg.match(/<rect class="tb" x="16" y="([\d.]+)"/)[1]);
      const body = svg.slice(0, svg.indexOf('<rect class="tb"'));
      const pts = [];
      for (const m of body.matchAll(/points="([^"]+)"/g)) for (const p of m[1].split(' ')) pts.push(p.split(',').map(Number));
      for (const m of body.matchAll(/<line [^>]*x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/g)) pts.push([+m[1], +m[2]], [+m[3], +m[4]]);
      for (const m of body.matchAll(/<text [^>]*x="([-\d.]+)" y="([-\d.]+)"/g)) pts.push([+m[1], +m[2]]);
      assert.ok(pts.length > 10, `${name} ${s.id}`);
      for (const [x, y] of pts) assert.ok(x >= 0 && x <= W && y >= 0 && y <= tbY - 2, `${name} ${s.id}: (${x}, ${y}) with the title block at ${tbY}`);
    }
  }
});

test('printing keeps the results: the print rules hide main\'s other children, never main itself', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const print = html.slice(html.indexOf('@media print'));
  // The panels sit in section.results inside <main>: a rule hiding every child of body but .results blanked the printout.
  assert.ok(html.indexOf('<main>') < html.indexOf('class="results"') && html.indexOf('class="results"') < html.indexOf('</main>'));
  assert.doesNotMatch(print, /body\[data-print\] > \*:not\(\.results\)/);
  assert.match(print, /body\[data-print\] > \*:not\(main\)/);
  assert.match(html, /@page plan-sheet \{ size: letter landscape;/);
});

test('every mark in the parts list is lettered on at least one sheet', () => {
  for (const { name, shed, sheets } of sets) {
    const est = estimate(shed);
    const drawn = new Set(sheets.flatMap((s) => s.items.filter((it) => it.t === 'text' && it.cls === 'mark').map((it) => it.text)));
    const missing = est.parts.filter((p) => !drawn.has(p.mark)).map((p) => `${p.mark} ${p.kind}`);
    assert.deepEqual(missing, [], name);
  }
});

test('a site plan sheet is drawn from the lot you type, with every clearance and its warnings', async () => {
  const { normalize, siteLayout } = await import('./model.mjs');
  const bare = buildSheets(buildShed(defaultDesign()));
  assert.ok(!bare.some((x) => x.id === 'site'), 'no lot typed, no site plan');
  const d = normalize({ ...defaultDesign(), lotWidthFt: 50, lotDepthFt: 100, siteLeftFt: 6, siteRearFt: 6, setbackFt: 5, houseWidthFt: 30, houseDepthFt: 40, houseLeftFt: 10, houseFrontFt: 25 });
  const s = buildShed(d);
  const sheets = buildSheets(s);
  assert.deepEqual(sheets.slice(0, 2).map((x) => x.id), ['cover', 'site']);
  const site = siteLayout(s.design);
  // 50 ft lot, a 12 ft shed 6 ft from the left: 32 ft to the right line. 100 ft deep, 8 ft wide, 6 ft from the rear: 86 ft to the street.
  assert.equal(site.clear.right, 32 * 12);
  assert.equal(site.clear.front, 86 * 12);
  assert.equal(site.clear.rearEave, 6 * 12 - s.design.overhang);
  // The house's back wall is at 65 ft from the street, the shed's front at 86 ft: 21 ft apart.
  assert.equal(site.houseGap, 21 * 12);
  const words = [sheets[1].note, ...sheets[1].items.map((i) => /** @type {any} */ (i).text || '')].join('\n');
  assert.match(words, /left 6' 0", right 32' 0", street 86' 0"/);
  assert.match(words, /to the house 21' 0"/);
  assert.match(words, /not a survey/);
  assert.match(sheets[0].items.map((i) => i.text || '').join(' '), /2\. Site plan/);
  assert.ok(!s.warnings.some((w) => /site plan/.test(w)), 'clear of a 5 ft setback');
  const tight = buildShed(normalize({ ...d, siteRearFt: 3 }));
  assert.ok(tight.warnings.some((w) => /closer than your 5' 0" setback to the rear lot line/.test(w)), tight.warnings.join('\n'));
  const off = buildShed(normalize({ ...d, siteLeftFt: 45 }));
  assert.ok(off.warnings.some((w) => /runs past the right lot line/.test(w)));
  const onHouse = buildShed(normalize({ ...d, siteRearFt: 40, siteLeftFt: 15 }));
  assert.ok(onHouse.warnings.some((w) => /overlaps the house/.test(w)));
  // Junk typed into the fields is clamped, never NaN.
  const junk = normalize({ ...defaultDesign(), lotWidthFt: 'x', lotDepthFt: -5, setbackFt: null });
  assert.deepEqual([junk.lotWidthFt, junk.lotDepthFt, junk.setbackFt], [0, 0, 0]);
});

test('the cover sheet carries what a permit or HOA reviewer asks for, and never claims approval', () => {
  const s = buildShed(PRESETS['8x12 classic']());
  const cover = buildSheets(s)[0];
  const words = cover.items.map((i) => i.text || '').join('\n');
  assert.match(words, /96 sq ft floor area/);
  assert.match(words, /Owner: _+ {3}Site address: _+/);
  assert.match(words, /Siding: T1-11, natural stain\. Roof: asphalt shingles, charcoal\. Trim: 1x4, white\./);
  assert.match(words, /Overall height: peak /);
  assert.match(words, /IRC \(R105\.2\) exempts a one-storey detached accessory building up to 200 sq ft/);
  assert.match(words, /Not engineered and not checked against any building code/);
  assert.ok(!/permit-ready|approved/i.test(words));
});
