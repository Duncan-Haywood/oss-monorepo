import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildShed, defaultDesign, normalize, PRESETS } from './model.mjs';
import { estimate } from './estimate.mjs';
import { structuralChecks } from './checks.mjs';
import { fmtIn } from './lumber.mjs';
import { PRODUCTS } from './products.mjs';
import { boardPrice } from './prices.mjs';
import { budget, laborHours } from './simplify.mjs';

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
  const size = (o) => `${fmtIn(o.width)} x ${fmtIn(o.height)}`;
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
    overhangBudget: money(low.overhangChoice.budget),
    overhangNext: fmtIn(low.overhangChoice.next.overhang),
    overhangNextAdds: money(low.overhangChoice.next.adds),
    beam: `${Math.round(checks.rows.find((r) => /Ridge beam$/.test(r.member)).ratio * 100)}%`,
    snow: String(checks.loads.snow),
    classicStud: fmtIn(classic.dims.studLen),
    classicDoor: size(classic.design.openings.find((o) => o.kind === 'door')),
    classicWindow: size(classic.design.openings.find((o) => o.kind === 'window')),
    plumb: fmtIn(classic.dims.plumbH),
    lowDoor: fmtIn(d.openings.find((o) => o.kind === 'door').height),
    waste8: fmtIn(96 - classic.dims.studLen),
    waste16: fmtIn(192 - 2 * (classic.dims.studLen + classic.design.kerf)),
    _studCheaperAlone: 2 * boardPrice('2x4', 8).price < boardPrice('2x4', 16).price,
    skid: `${Math.round(checks.rows.find((r) => r.member === 'Skids on blocks').ratio * 100)}%`,
    soil: `${Math.round(checks.rows.find((r) => r.member === 'Blocks on the soil').ratio * 100)}%`,
    anchors: `${Math.round(checks.rows.find((r) => r.member === 'Ground anchors (overturning and sliding)').ratio * 100)}%`,
    _othersUnder30: checks.rows.filter((r) => !/Ridge beam$|^Skids on blocks$|^Blocks on the soil$|^Ground anchors/.test(r.member) && r.governs !== 'span rating').every((r) => r.ratio < 0.3),
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
  assert.ok(f._studCheaperAlone, 'the page says a stud costs less from its own 8 ft board');
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

// The README's worked numbers are recomputed the same way, so a pricing or
// framing change that moves one fails here instead of leaving the README behind.
test('the README quotes the tool\'s current numbers', () => {
  const md = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
  const has = (text) => assert.ok(md.includes(text), `README should say: ${text}`);
  const low = buildShed(defaultDesign());
  const d = low.design;
  const est = estimate(low);
  const door = d.openings.find((o) => o.kind === 'door');
  const windows = d.openings.filter((o) => o.kind === 'window');
  has(`a single ${door.product === 'site-built' ? 'site-built ' : ''}${fmtIn(door.width)} x ${fmtIn(door.height)}`);
  const win = PRODUCTS.find((p) => p.id === windows[0].product);
  assert.equal(windows.length, 2);
  assert.ok(windows.every((w) => w.product === win.id));
  has(`(${fmtIn(win.roW)} x ${fmtIn(win.roH)} rough openings)`);
  has(`**Walls:** ${fmtIn(d.wallHeight)}.`);
  has(`**Pitch:** ${d.pitch}/12.`);
  has(`the peak is ${fmtIn(low.dims.peak, { feet: true })} above the gravel`);
  const at3 = buildShed(normalize({ ...d, pitch: 3, maxPeak: 0, autoWall: false, autoPitch: false, autoOverhang: false }));
  has(`Even 3/12 would be ${fmtIn(at3.dims.peak, { feet: true })}.`);
  const oc = low.overhangChoice;
  has(`**Overhang:** ${fmtIn(d.overhang)}. The longest from 6" to 18" whose whole order (rafters, sheathing, roofing, trim) costs at most ${money(oc.budget)} more than the cheapest overhang's, ${fmtIn(oc.cheapest)}. ${oc.adds < 0.005 ? `It costs no more than ${fmtIn(oc.cheapest)}` : `It adds ${money(oc.adds)}`}; ${fmtIn(oc.next.overhang)} would add ${money(oc.next.adds)}`);
  // "because it needs a fifth bundle of shingles"
  const at = (oh) => estimate(buildShed(normalize({ ...d, autoWall: false, autoPitch: false, autoOverhang: false, overhang: oh })));
  const bundles = (e) => e.shopping.find((r) => /shingles \(/.test(r.name)).qty;
  assert.equal(bundles(at(oc.next.overhang)), 5);
  assert.equal(bundles(at(d.overhang)), 4);
  has(`The rafters are ${fmtIn(low.members.find((m) => m.kind === 'rafter').length)}.`);
  has(`that design is ${est.pieces} pieces from ${est.boards} boards`);
  has(`The cut sheet's boards cost ${money(est.cutSheetCost)} against a proven lower bound of ${money(est.lowerBound)}`);
  has(`the lumber is ${money(est.lumberCost)}, and the whole shed is ${money(est.total)} before sales tax`);
  const checks = structuralChecks(low);
  const worst = checks.rows.reduce((a, r) => (r.ratio > a.ratio ? r : a));
  assert.match(worst.member, /Ridge beam$/);
  has(`the ridge beam is the most loaded member at ${Math.round(worst.ratio * 100)}%`);
  const classic = estimate(buildShed(PRESETS['8x12 classic']()));
  has(`is ${classic.pieces} pieces from ${classic.boards} boards and ${money(classic.total)} before sales tax`);
  const b = budget(defaultDesign());
  const saving = b.best.steps.reduce((t, s) => t + s.saving, 0);
  const said = md.match(/On the default 8x12 it finds (\$[\d,.]+) in materials and time at \$(\d+) an hour \(([^)]*)\)/);
  assert.ok(said, 'the budget sentence');
  assert.equal(said[1], money(saving));
  assert.equal(Number(said[2]), d.laborRate);
  has(`On the default 8x12 it comes to about ${Math.round(laborHours(low, est))} hours.`);
});
