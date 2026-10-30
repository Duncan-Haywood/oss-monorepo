import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildShed, defaultDesign, normalize, PRESETS } from './model.mjs';
import { estimate } from './estimate.mjs';
import { structuralChecks } from './checks.mjs';
import { fmtIn } from './lumber.mjs';
import { PRODUCTS } from './products.mjs';
import { boardPrice } from './prices.mjs';

// The worked example on the marketing page quotes the tool's own output. Every
// number tagged data-fact="key" is recomputed here, so a change to the engine
// or the starting prices fails this test until the page is updated.

const money = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function facts() {
  const classic = buildShed(PRESETS['8x12 classic']());
  const est = estimate(classic);
  const len = (shed, kind) => fmtIn(shed.members.find((m) => m.kind === kind).length);
  const low = buildShed(defaultDesign());
  const d = low.design;
  const at3 = buildShed(normalize({ ...d, pitch: 3, maxPeak: 0, autoWall: false, autoPitch: false, autoOverhang: false }));
  const checks = structuralChecks(low);
  return {
    pieces: String(est.pieces),
    boards: String(est.boards),
    cutSheetCost: money(est.cutSheetCost),
    lumberCost: money(est.lumberCost),
    lowerBound: money(est.lowerBound),
    total: money(est.total),
    ...Object.fromEntries(est.lumber.flatMap((l) => [
      [`qty:${l.material}`, String(l.result.boards.length)],
      [`len:${l.material}`, [...new Set(l.result.boards.map((b) => b.stock / 12))].sort((x, y) => x - y).map((ft) => `${ft}'`).join(', ')],
    ])),
    joist: len(classic, 'floor joist'),
    rafter: len(classic, 'rafter'),
    jack: fmtIn(Math.max(...classic.members.filter((m) => m.kind === 'jack stud').map((m) => m.length))),
    p2x4x8: money(boardPrice('2x4', 8).price),
    p2x4x16: money(boardPrice('2x4', 16).price),
    minWindow: money(Math.min(...PRODUCTS.filter((p) => p.kind === 'window').map((p) => p.price))),
    minDoor: money(Math.min(...PRODUCTS.filter((p) => p.kind === 'door').map((p) => p.price))),
    wall: fmtIn(d.wallHeight),
    pitch: `${d.pitch}/12`,
    overhang: fmtIn(d.overhang),
    peak: fmtIn(low.dims.peak, { feet: true }),
    lowPeak: fmtIn(at3.dims.peak, { feet: true }),
    defaultRafter: len(low, 'rafter'),
    beam: `${Math.round(checks.rows.find((r) => /Ridge beam$/.test(r.member)).ratio * 100)}%`,
    snow: String(checks.loads.snow),
    skid: `${Math.round(checks.rows.find((r) => r.member === 'Skids on blocks').ratio * 100)}%`,
    soil: `${Math.round(checks.rows.find((r) => r.member === 'Blocks on the soil').ratio * 100)}%`,
    _othersUnder30: checks.rows.filter((r) => !/Ridge beam$|^Skids on blocks$|^Blocks on the soil$/.test(r.member)).every((r) => r.ratio < 0.3),
    _unpriced: est.unpriced.length,
  };
}

test('the marketing page quotes the tool\'s current numbers', () => {
  const html = readFileSync(new URL('./shed-plans-with-cut-list.html', import.meta.url), 'utf8');
  const f = facts();
  const tagged = [...html.matchAll(/data-fact="([^"]+)">([^<]*)</g)];
  assert.ok(tagged.length >= 20);
  for (const [, key, text] of tagged) {
    assert.ok(key in f, `unknown fact ${key}`);
    assert.equal(text, f[key], `page says ${key} = ${text}, the tool says ${f[key]}`);
  }
  for (const key of Object.keys(f).filter((k) => !k.startsWith('_'))) assert.ok(tagged.some(([, k]) => k === key), `${key} is not on the page`);
  assert.ok(f._othersUnder30, 'the page says every member but the ridge beam is under 30%');
  // The page says the preset's door and windows are left out of the total.
  assert.equal(f._unpriced, 3);
  assert.match(html, new RegExp(`${f.pieces} pieces from ${f.boards} boards`));
});

test('llms.txt quotes the same example', () => {
  const llms = readFileSync(new URL('./llms.txt', import.meta.url), 'utf8');
  const f = facts();
  assert.match(llms, new RegExp(`${f.pieces} pieces from ${f.boards} boards`));
});
