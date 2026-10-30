// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign, normalize, PRESETS } from './model.mjs';
import { estimate, examplePrices } from './estimate.mjs';
import { costBreakdown, costDelta, deltaPhrase, costBridge, signedDollars, assemblyOfLine, materialOfLine, ASSEMBLIES } from './costs.mjs';
import { breakdownHtml, bridgeHtml, deltaSentence, tipHtml } from './costview.mjs';

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.02, `${msg}: ${a} vs ${b}`);
const designs = () => [
  ...Object.values(PRESETS).map((p) => p()),
  // Every siding, the metal roof, an inside finish, insulation, paint and a gravel pad, so every kind of line is met.
  ...['LP SmartSide', 'board and batten', 'vinyl', 'fiber cement'].map((sidingType) => ({ ...defaultDesign(), sidingType, sidingColor: 'white' })),
  { ...defaultDesign(), roofCover: 'metal', interior: 'drywall', insulation: true, polkaDots: true, glitter: true, pad: 'full', compaction: 'plate compactor', floorPanel: 'OSB' },
  { ...defaultDesign(), interior: 'teen bedroom', roofType: 'ridgeBoard', foundation: 'deck blocks' },
];

test('the assemblies and the material types each add up to the shopping list, on every preset', () => {
  for (const d of designs()) {
    const shed = buildShed(d);
    const est = estimate(shed);
    const b = costBreakdown(shed, est);
    close(b.assemblies.reduce((t, g) => t + g.total, 0), est.total, `${shed.design.name} by assembly`);
    close(b.materials.reduce((t, g) => t + g.total, 0), est.total, `${shed.design.name} by material`);
    for (const g of [...b.assemblies, ...b.materials]) close(g.lines.reduce((t, l) => t + l.total, 0), g.total, `${g.label} lines`);
    assert.ok(!b.assemblies.some((g) => g.key === 'other'), `${shed.design.name}: every line has an assembly`);
    assert.ok(!b.materials.some((g) => g.key === 'other'), `${shed.design.name}: every line has a material type`);
    // Largest first.
    for (let i = 1; i < b.assemblies.length; i++) assert.ok(b.assemblies[i - 1].total >= b.assemblies[i].total);
  }
});

test('lumber is split by where its pieces go: skids to the foundation, joists to the floor, studs to the walls, rafters to the roof', () => {
  const shed = buildShed(defaultDesign());
  const est = estimate(shed);
  const b = costBreakdown(shed, est);
  const g = (k) => /** @type {any} */ (b.assemblies.find((x) => x.key === k));
  assert.ok(g('foundation').lines.some((l) => l.name === 'PT 4x4 boards'), 'skids are foundation');
  assert.ok(g('floor').lines.some((l) => l.name === 'PT 2x6 boards'), 'treated joists are floor');
  assert.ok(g('walls').lines.some((l) => l.name === '2x4 boards'), 'studs are wall framing');
  assert.ok(g('roof').lines.some((l) => l.name === '2x6 boards'), 'rafters are roof framing');
  assert.ok(g('roof').lines.some((l) => l.name === '2x10 boards'), 'the ridge beam is roof framing');
  // The 2x4 boards cost what the shopping list says, however they are shared out.
  const bought = est.shopping.filter((r) => r.source?.key?.startsWith('lumber:2x4:')).reduce((t, r) => t + r.total, 0);
  const shared = b.assemblies.flatMap((a) => a.lines.filter((l) => l.name === '2x4 boards')).reduce((t, l) => t + l.total, 0);
  close(shared, bought, '2x4 shared out');
});

test('non-lumber lines go to the assembly they build', () => {
  assert.equal(assemblyOfLine({ section: 'Sheet goods', source: { key: 'roofSheet' } }), 'roof');
  assert.equal(assemblyOfLine({ section: 'Sheet goods', source: { key: 'floorOSB' } }), 'floor');
  assert.equal(assemblyOfLine({ section: 'Foundation and hardware', source: { key: 'gableVent' } }), 'openings');
  assert.equal(assemblyOfLine({ section: 'Foundation and hardware', source: { key: 'hurricaneTie' } }), 'hardware');
  assert.equal(assemblyOfLine({ section: 'Foundation and hardware', source: { key: 'concreteBlock' } }), 'foundation');
  assert.equal(assemblyOfLine({ section: 'Site prep', source: { key: 'gravelTon' } }), 'foundation');
  assert.equal(assemblyOfLine({ section: 'Door hardware', source: { key: 'tHinge' } }), 'openings');
  assert.equal(materialOfLine({ section: 'Lumber', source: { key: 'lumber:PT 4x4:12' } }), 'treated');
  assert.equal(materialOfLine({ section: 'Lumber', source: { key: 'lumber:2x4:8' } }), 'framing');
  assert.equal(materialOfLine({ section: 'Siding', source: { key: 'wallSheathing' } }), 'sheathing');
  assert.equal(materialOfLine({ section: 'Fasteners and sealants', source: { key: 'zFlashing' } }), 'metal');
  assert.equal(materialOfLine({ section: 'Interior', source: { key: 'interiorPaint' } }), 'paint');
});

test('a change to the windows shows up as a windows change and nothing else moves', () => {
  const d = normalize(defaultDesign());
  const win = d.openings.find((o) => o.kind === 'window');
  assert.ok(win);
  // Taking the windows' units out leaves their framing; the only line that moves is the unit itself.
  const priced = examplePrices();
  const a = costBreakdown(buildShed(d), estimate(buildShed(d), priced));
  const p2 = examplePrices();
  p2.items[`product:${win.product}`] = 0;
  const b = costBreakdown(buildShed(d), estimate(buildShed(d), p2));
  const delta = costDelta(a, b);
  assert.deepEqual(delta.map((x) => x.key), ['openings']);
  assert.ok(delta[0].delta < 0);
  assert.match(deltaPhrase(delta), /^doors and windows −\$\d+$/);
});

test('the bridge runs from one total to the other through each assembly, savings first', () => {
  const from = buildShed(defaultDesign());
  const to = buildShed(normalize({ ...defaultDesign(), floorPanel: 'OSB', sidingType: 'LP SmartSide' }));
  const a = costBreakdown(from, estimate(from));
  const b = costBreakdown(to, estimate(to));
  const br = costBridge(a, b);
  assert.equal(br.steps[0].kind, 'total');
  assert.equal(br.steps.at(-1)?.kind, 'total');
  close(br.steps[0].end, a.total, 'start');
  close(/** @type {any} */ (br.steps.at(-1)).end, b.total, 'end');
  const mid = br.steps.slice(1, -1);
  close(mid.reduce((t, s) => t + s.value, 0), b.total - a.total, 'steps add up');
  for (let i = 1; i < mid.length; i++) close(mid[i].start, mid[i - 1].end, 'each step starts where the last ended');
  const firstUp = mid.findIndex((s) => s.kind === 'up');
  if (firstUp >= 0) assert.ok(mid.slice(firstUp).every((s) => s.kind !== 'down'), 'savings come before rises');
  assert.ok(mid.some((s) => s.label === 'Floor' && s.value < 0), 'OSB subfloor saves on the floor');
  const html = bridgeHtml(a, b);
  assert.match(html, /Cheapest passing design/);
  assert.match(html, /class="sr-only">Floor: saves \$/);
});

test('the chart is ranked bars with every amount printed, and rows that open their lines', () => {
  const shed = buildShed(defaultDesign());
  const b = costBreakdown(shed, estimate(shed));
  const html = breakdownHtml(b, 'assemblies', new Set(['walls']));
  assert.equal((html.match(/class="cost-row"/g) || []).length, b.assemblies.length);
  assert.match(html, /aria-expanded="true" aria-controls="cost-assemblies-walls"/);
  assert.equal((html.match(/class="cost-lines" id="[^"]+" hidden/g) || []).length, b.assemblies.length - 1);
  for (const g of b.assemblies) assert.ok(html.includes(g.label), g.label);
  assert.match(tipHtml(b, 'assemblies', 'roofing'), /Roofing: \$/);
  assert.ok(ASSEMBLIES.length >= 10);
});

test('the change sentence names the assemblies and the total', () => {
  const a = buildShed(defaultDesign());
  const b = buildShed(normalize({ ...defaultDesign(), floorPanel: 'OSB' }));
  const s = deltaSentence(costBreakdown(a, estimate(a)), costBreakdown(b, estimate(b)), 'Last change');
  assert.match(s, /^Last change: materials −\$\d+ \(floor −\$\d+.*\)\.$/);
  assert.equal(deltaSentence(costBreakdown(a, estimate(a)), costBreakdown(a, estimate(a)), 'x'), '');
  assert.equal(signedDollars(-120.4), '−$120');
  assert.equal(signedDollars(15), '+$15');
  assert.equal(signedDollars(1234), '+$1,234');
});
