// The drawn cutting layouts use exactly the sheets the shopping list counts,
// every piece once, inside its sheet and clear of the others.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, buildShed, normalize } from './model.mjs';
import { sheetCount2d, sidingUpperSheets } from './estimate.mjs';
import { sheetLayout, sidingUpperLayout } from './cutlayout.mjs';
import { cuttingGroups, cuttingSheet } from './cutting-sheets.mjs';
import { buildSheets, sheetSvg, sheetsDxf } from './drawings.mjs';
import { GALLERY_DESIGNS } from './gallery-data.mjs';

const KINDS = ['floor sheet', 'roof sheathing', 'loft deck', 'attic deck'];
const piecesOf = (shed, kind) => shed.panels.filter((p) => p.kind === kind).map((p) => ({ len: p.geom.profile[2][0], w: p.geom.profile[2][1] }));

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 2 ** 32; };
}

/** Presets, gallery designs and a seeded sweep of sizes, pitches and siding. */
function designs() {
  const out = [...Object.entries(PRESETS).map(([k, f]) => [k, f()]), ...GALLERY_DESIGNS.map((g) => [`gallery ${g.id}`, g.design])];
  const r = rng(7);
  const presets = Object.entries(PRESETS);
  const sidings = ['T1-11', 'LP SmartSide', 'LP SmartSide 7/16', 'LP SmartSide lap', 'fiber cement'];
  for (let n = 0; n < 60; n++) {
    const [k, f] = presets[Math.floor(r() * presets.length)];
    const d = { ...f(), width: 72 + 6 * Math.floor(r() * 15), length: 72 + 6 * Math.floor(r() * 25), pitch: 3 + Math.floor(r() * 8), sidingType: sidings[Math.floor(r() * sidings.length)] };
    out.push([`${k} ${d.width}x${d.length} ${d.pitch}/12 ${d.sidingType}`, normalize(d)]);
  }
  return out;
}

/** Rectangles of a flat layout overlap by more than a rounding error. */
const overlaps = (a, b) => Math.min(a.x + a.len, b.x + b.len) - Math.max(a.x, b.x) > 1e-6 && Math.min(a.y + a.w, b.y + b.w) - Math.max(a.y, b.y) > 1e-6;

test('each flat layout has the sheets the list buys, every piece once, inside the sheet, none overlapping', () => {
  for (const [name, d] of designs()) {
    const shed = buildShed(d);
    for (const kind of KINDS) {
      const pieces = piecesOf(shed, kind);
      const lay = sheetLayout(pieces);
      assert.equal(lay.sheets.length, sheetCount2d(pieces), `${name}: ${kind}`);
      assert.deepEqual(lay.sheets.flatMap((s) => s.cuts.map((c) => c.i)).sort((a, b) => a - b), pieces.map((_, i) => i), `${name}: ${kind} pieces`);
      for (const sh of lay.sheets) {
        for (const c of sh.cuts) {
          assert.ok(c.x >= -1e-9 && c.y >= -1e-9 && c.x + c.len <= 96 + 1e-6 && c.y + c.w <= 48 + 1e-6, `${name}: ${kind} piece off the sheet`);
          assert.ok(Math.abs(c.len - Math.min(96, pieces[c.i].len)) < 1e-9 && Math.abs(c.w - Math.min(48, pieces[c.i].w)) < 1e-9, `${name}: ${kind} piece resized`);
        }
        sh.cuts.forEach((a, i) => sh.cuts.slice(i + 1).forEach((b) => assert.ok(!overlaps(a, b), `${name}: ${kind} pieces overlap`)));
      }
    }
  }
});

test('the siding layout above the lower panels has the sheets the list buys, nested pieces clear of each other', () => {
  let nestedSeen = 0;
  for (const [name, d] of designs()) {
    const shed = buildShed(d);
    const lay = sidingUpperLayout(shed);
    assert.equal(lay.sheets.length, sidingUpperSheets(shed), name);
    assert.deepEqual(lay.sheets.flatMap((s) => s.cuts.map((c) => c.i)).sort((a, b) => a - b), (shed.sidingUpper || []).map((_, i) => i), `${name} pieces`);
    nestedSeen += lay.nested;
    for (const sh of lay.sheets) {
      for (const c of sh.cuts) for (const [x, y] of /** @type {[number, number][]} */ (c.pts)) assert.ok(x >= -1e-9 && x <= 48 + 1e-9 && y >= -1e-9 && y <= 96 + 1e-6, `${name}: outside the panel`);
      // A nested pair shares a 48" strip: at each edge, the upper piece starts at or above where the lower one ends.
      const byStrip = [...sh.cuts].sort((a, b) => a.y - b.y);
      for (let i = 1; i < byStrip.length; i++) {
        const lo = byStrip[i - 1].pts; const hi = byStrip[i].pts;
        const at = (pts, x, pick) => pick(...pts.filter((p) => Math.abs(p[0] - x) < 1e-9).map((p) => p[1]));
        for (const x of [0, 48]) assert.ok(at(hi, x, Math.min) >= at(lo, x, Math.max) - 1e-6, `${name}: pieces overlap at x=${x}`);
      }
    }
  }
  assert.ok(nestedSeen > 10, 'the sweep reaches nested pairs');
});

test('the 8x10 cuts its two gable strips from one panel, nested head to toe', () => {
  const shed = buildShed(PRESETS['8x10']());
  const lay = sidingUpperLayout(shed);
  assert.equal(shed.sidingUpper.length, 4);
  assert.equal(lay.sheets.length, 1);
  assert.equal(lay.nested, 2);
  // Without nesting, each piece's height alone would take two panels.
  assert.equal(sidingUpperSheets(shed, false), 2);
});

test('the plan set carries a cutting layout sheet that renders to SVG and DXF', () => {
  for (const key of ['8x12', '8x10', '10x10 barn', '8x12 lean-to']) {
    const shed = buildShed(PRESETS[key]());
    const sheet = buildSheets(shed).find((s) => s.id === 'cutting');
    assert.ok(sheet, key);
    const groups = cuttingGroups(shed);
    const drawn = sheet.items.filter((it) => it.t === 'poly' && it.cls === 'hidden').length;
    assert.equal(drawn, groups.reduce((t, g) => t + g.sheets.length, 0), `${key}: one outline per sheet`);
    assert.match(sheetSvg(sheet), /<svg/);
    assert.match(sheetsDxf([sheet]), /EOF/);
  }
  // No floor, roof or siding sheets, no cutting sheet.
  assert.equal(cuttingSheet({ design: { siding: false }, panels: [] }), null);
});
