// Property test: sweep the input space with a seeded random generator and
// assert the invariants every design must keep, whatever a person types,
// drags, saves or pastes into a link.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, normalize, defaultDesign, PRESETS, WALLS, BLOCKS } from './model.mjs';
import { estimate, examplePrices, priceOr } from './estimate.mjs';
import { structuralChecks } from './checks.mjs';
import { connectionChecks } from './connections.mjs';
import { integrity } from './integrity.mjs';
import { buildSheets, sheetSvg, sheetsDxf, dxfText } from './drawings.mjs';
import { buildInstructions } from './instructions.mjs';
import { solidsOf } from './render3d.mjs';
import { PRODUCTS } from './products.mjs';

// FUZZ_N=2000 FUZZ_SEED=5 node --test fuzz.test.mjs sweeps wider; FUZZ_OUT=file.json writes the failures.
const N = Number(process.env.FUZZ_N || 150);
const SEED = Number(process.env.FUZZ_SEED || 1);

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 2 ** 32; };
}

function randomDesign(r) {
  const pick = (a) => a[Math.floor(r() * a.length)];
  const between = (lo, hi, step = 1) => lo + Math.floor(r() * ((hi - lo) / step + 1)) * step;
  const presets = Object.values(PRESETS);
  const base = r() < 0.3 ? pick(presets)() : defaultDesign();
  const d = {
    ...base,
    length: between(48, 288, 6), width: between(48, 192, 6),
    wallHeight: between(60, 120, 0.5), pitch: between(2, 14), overhang: between(0, 24),
    studSize: pick(['2x4', '2x6']), studSpacing: pick([12, 16, 24]),
    joistSize: pick(['2x4', '2x6', '2x8', '2x10']), joistSpacing: pick([12, 16, 24]),
    rafterSize: pick(['2x4', '2x6', '2x8', '2x10']), rafterSpacing: pick([12, 16, 24]),
    roofType: pick(['ridgeBeam', 'ridgeBoard']), beamSize: pick(['2x8', '2x10', '2x12']),
    skidSize: pick(['4x4', '4x6']), skidSpacing: between(24, 72, 6),
    foundation: pick(['gravel', ...Object.keys(BLOCKS)]), pad: pick(['full', 'under blocks']),
    floorPanel: pick(['plywood', 'OSB']), floorTreated: r() < 0.8,
    siding: r() < 0.9, roofing: r() < 0.9, gableVents: r() < 0.7,
    ventWidth: between(6, 24), ventHeight: between(6, 18),
    maxPeak: r() < 0.5 ? 0 : between(84, 180), snowLoad: between(0, 80, 5), windLoad: between(0, 40, 5),
    autoWall: r() < 0.3, autoPitch: r() < 0.3, autoOverhang: r() < 0.2,
    sidingType: pick(['T1-11', 'LP SmartSide', 'LP SmartSide 7/16', 'board and batten', 'vinyl', 'fiber cement']),
    sidingColor: pick(['natural', 'unfinished', 'pink']), polkaDots: r() < 0.2, glitter: r() < 0.1,
    roofCover: pick(['shingles', 'metal']), rafterSeat: pick(['birdsmouth', 'connector']),
    interior: pick(['none', 'OSB', 'plywood', 'drywall', 'teen bedroom']), insulation: r() < 0.2,
    name: pick(['Shed', 'Café “garden” shed <&>', 'x'.repeat(120), '\u{1F3E1} tiny']),
    wallTrim: pick(['1x4', 'none']), lengths: r() < 0.2 ? [8, 10, 12] : [8, 10, 12, 14, 16, 18, 20].filter(() => r() < 0.7),
  };
  const n = between(0, 5);
  d.openings = [];
  for (let i = 0; i < n; i++) {
    const kind = r() < 0.4 ? 'door' : 'window';
    const wall = pick(WALLS);
    const face = wall === 'front' || wall === 'back' ? d.length : d.width;
    const prods = PRODUCTS.filter((p) => p.kind === kind);
    const product = r() < 0.3 && prods.length ? pick(prods).id : (kind === 'door' && r() < 0.15 ? 'site-built' : undefined);
    d.openings.push({ id: `o${i + 1}`, kind, wall, offset: between(-12, face + 12), width: between(12, 96), height: between(12, 96), ...(kind === 'window' ? { sill: between(0, 72) } : {}), ...(product ? { product } : {}) });
  }
  return d;
}

/** What a strict R12 reader would reject: code/value pairs, integer codes, ASCII values, numeric coordinates, balanced sections, EOF. */
function dxfProblems(dxf) {
  const out = [];
  const lines = dxf.split('\n');
  if (lines.pop() !== '') out.push('dxf does not end in a newline');
  if (lines.length % 2) out.push('dxf has an odd number of lines');
  let open = 0;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const [code, val] = [lines[i], lines[i + 1]];
    if (!/^\d+$/.test(code)) { out.push(`dxf group code ${JSON.stringify(code)}`); break; }
    if (/[^\x20-\x7e]/.test(val) || val.length > 255) { out.push(`dxf value not short ASCII: ${val.slice(0, 40)}`); break; }
    if (/^(10|20|30|11|21|31|40|50)$/.test(code) && !Number.isFinite(Number(val))) { out.push(`dxf number ${code}=${val}`); break; }
    if (code === '0' && val === 'SECTION') open++;
    if (code === '0' && val === 'ENDSEC') open--;
  }
  if (open) out.push('dxf sections unbalanced');
  if (lines.at(-1) !== 'EOF') out.push('dxf does not end with EOF');
  return out;
}

const finite = (x) => typeof x === 'number' && Number.isFinite(x);

/** Every invariant one design must keep; returns the list of broken ones. */
export function invariants(input, prices = examplePrices()) {
  const bad = [];
  const shed = buildShed(input);
  for (const m of [...shed.members, ...(shed.doorParts || [])]) {
    if (!finite(m.length) || m.length <= 0) bad.push(`member ${m.id} ${m.kind} length ${m.length}`);
  }
  for (const g of [...shed.members, ...shed.panels, ...shed.fixtures].map((x) => x.geom).filter(Boolean)) {
    if (![...g.origin, ...g.profile.flat(), g.thickness].every(finite)) { bad.push('non-finite geometry'); break; }
  }
  for (const [k, v] of Object.entries(shed.dims)) if (typeof v === 'number' && !finite(v)) bad.push(`dims.${k} = ${v}`);
  const est = estimate(shed, prices);
  if (!finite(est.total) || est.total <= 0) bad.push(`total ${est.total}`);
  for (const r of est.shopping) if (!finite(r.qty) || r.qty <= 0 || !finite(r.price) || r.price < 0 || !finite(r.total)) bad.push(`shopping ${r.name} qty ${r.qty} price ${r.price}`);
  const integ = integrity(shed);
  if (integ.floating.length) bad.push(`floating: ${integ.floating.slice(0, 3).join(', ')}`);
  // A ridge too low to clear the ties or plates is a design the tool warns about, not a modelling bug.
  if (integ.clashes.length && !shed.warnings.some((w) => w.startsWith('The ridge sits too low'))) bad.push(`clashes: ${integ.clashes.slice(0, 3).join(', ')}`);
  const sc = structuralChecks(shed);
  for (const row of sc.rows) if (!finite(row.ratio) || row.ratio < 0) bad.push(`check ${row.member} ratio ${row.ratio}`);
  for (const n of ['Floor joists', 'Rafters', 'Wall studs']) if (!sc.rows.some((x) => x.member === n)) bad.push(`check missing: ${n}`);
  const cc = connectionChecks(shed);
  for (const row of cc.rows || []) if (row.ratio !== undefined && !finite(row.ratio)) bad.push(`connection ${row.member || row.name} ratio ${row.ratio}`);
  const sheets = buildSheets(shed);
  for (const s of sheets) {
    const svg = sheetSvg(s, { name: shed.design.name });
    if (/NaN|undefined|Infinity/.test(svg)) bad.push(`svg ${s.id} has NaN/undefined`);
    // Well-formed enough for an XML parser: no stray < or & in text, every element closed.
    const body = svg.replace(/<style>[\s\S]*?<\/style>/, '');
    if (/>[^<]*[&](?!amp;|lt;|gt;|quot;|#\d+;)/.test(body) || /<[^>]*</.test(body)) bad.push(`svg ${s.id} has unescaped text`);
    const open = (body.match(/<[a-z]+[^>]*[^/]>/g) || []).length;
    const close = (body.match(/<\/[a-z]+>/g) || []).length;
    if (open !== close) bad.push(`svg ${s.id}: ${open} open tags, ${close} closed`);
  }
  bad.push(...dxfProblems(sheetsDxf(sheets)));
  const ins = buildInstructions(shed, est);
  if (/NaN|undefined/.test(JSON.stringify(ins))) bad.push('instructions have NaN/undefined');
  solidsOf(shed);
  return bad;
}

test(`random designs keep every invariant (seed ${SEED}, ${N} designs)`, async () => {
  const r = rng(SEED);
  const failures = [];
  for (let i = 0; i < N; i++) {
    const d = randomDesign(r);
    let bad;
    try { bad = invariants(d); } catch (e) { bad = [`throws: ${e.stack.split('\n').slice(0, 3).join(' | ')}`]; }
    if (bad.length) failures.push({ i, bad, d });
  }
  if (process.env.FUZZ_OUT) (await import('node:fs')).writeFileSync(process.env.FUZZ_OUT, JSON.stringify(failures));
  else if (failures.length) console.log(JSON.stringify(failures.slice(0, 4)));
  assert.equal(failures.length, 0, `${failures.length} of ${N} designs broke an invariant`);
});

// Saved files, localStorage and #d= links can carry anything: every field of
// the design and of each opening is replaced at random by junk.
test('junk in a saved or linked design never throws and never prices to NaN', () => {
  const r = rng(SEED + 100);
  const JUNK = [null, undefined, '', 'abc', -1, 0, 1e9, -1e9, NaN, Infinity, true, false, [], {}, '12', ' 7 ', '2x4', [1, 2], { a: 1 }, 'PT 2x4', '1e3'];
  const junk = () => JUNK[Math.floor(r() * JUNK.length)];
  const keys = Object.keys(defaultDesign());
  for (let i = 0; i < Math.ceil(N / 2); i++) {
    const d = defaultDesign();
    for (const k of keys) if (r() < 0.15) d[k] = junk();
    if (Array.isArray(d.openings)) d.openings = d.openings.map((op) => (r() < 0.1 ? junk() : Object.fromEntries(Object.entries(op).map(([k, v]) => [k, r() < 0.2 ? junk() : v]))));
    const prices = examplePrices();
    prices.lumber['2x4'] = { 8: junk(), 10: junk(), 12: junk() };
    prices.items.caulk = junk();
    const n = normalize(d);
    assert.deepEqual(normalize(JSON.parse(JSON.stringify(n))), n, 'normalize is stable through a save');
    const bad = invariants(d, prices);
    assert.deepEqual(bad, [], JSON.stringify(d));
  }
});

// Each case below is a bug the sweeps above found, pinned so it stays fixed.

test('an inner rafter near a gable end moves in clear of the gable wall and its tie', () => {
  // 2x6 walls and rafters at 12": the layout put a rafter at 216", inside the right gable wall (216-1/2 to 222).
  const s = buildShed({ ...PRESETS['8x12 classic'](), length: 222, width: 84, pitch: 7, studSize: '2x6', rafterSpacing: 12 });
  const c = s.dims.rafterCenters;
  assert.ok(c.at(-2) + 0.75 + 1.5 <= 222 - 5.5 + 1e-9, `inner rafter and tie at ${c.at(-2)} clear the gable studs`);
  assert.ok(c.slice(1).every((x, i) => x - c[i] <= 12 + 1e-9), 'no bay wider than the spacing');
  assert.deepEqual(integrity(s).clashes, []);
});

test('a birdsmouth that leaves no rafter over the wall gets no eave blocks pushed into the plate', () => {
  const s = buildShed({ ...PRESETS['8x12 classic'](), pitch: 12, rafterSize: '2x4', studSize: '2x6', rafterSeat: 'birdsmouth', roofType: 'ridgeBeam' });
  assert.equal(s.members.filter((m) => m.kind === 'eave blocking').length, 0);
  assert.ok(s.warnings.some((w) => /birdsmouth/.test(w)));
  assert.deepEqual(integrity(s).clashes, []);
});

test('integrity does not treat a four-point parallelogram as a box', () => {
  // No overhang on a connector seat: the rafter profile has four points but sloping edges.
  const s = buildShed({ ...defaultDesign(), autoOverhang: false, overhang: 0, rafterSeat: 'connector', studSize: '2x6' });
  assert.deepEqual(integrity(s).clashes, []);
});

test('a ridge too low to clear the ties says so', () => {
  const s = buildShed({ ...PRESETS['8x12 classic'](), width: 48, pitch: 2, rafterSize: '2x8' });
  assert.ok(s.warnings.some((w) => w.startsWith('The ridge sits too low')));
  assert.ok(!buildShed(PRESETS['8x12 classic']()).warnings.some((w) => w.startsWith('The ridge sits too low')));
});

test('a junk header size or a null opening in a link does not throw', () => {
  const d = defaultDesign();
  d.openings = [null, 'x', [1], { ...d.openings[0], header: 'abc', id: NaN }, { ...d.openings[1], header: '2x8', id: [] }];
  const n = normalize(d);
  assert.equal(n.openings.length, 2);
  assert.equal(n.openings[0].header, undefined);
  assert.equal(n.openings[1].header, '2x8');
  assert.deepEqual(n.openings.map((o) => o.id), ['o1', 'o2'], 'a NaN or list id is replaced, so no sheet is titled "Door NaN"');
  assert.ok(estimate(buildShed(d)).total > 0);
});

test('a blank, junk or negative price falls back to the listing; zero stays zero', () => {
  assert.equal(priceOr('', 5), 5);
  assert.equal(priceOr('abc', 5), 5);
  assert.equal(priceOr(-2, 5), 5);
  assert.equal(priceOr(Infinity, 5), 5);
  assert.equal(priceOr(0, 5), 0);
  assert.equal(priceOr('7.5', 5), 7.5);
  const base = estimate(buildShed(defaultDesign()));
  const p = examplePrices();
  for (const ft of Object.keys(p.lumber['2x4'])) p.lumber['2x4'][ft] = '';
  assert.equal(estimate(buildShed(defaultDesign()), p).total, base.total);
});

test('an opening the walls cannot frame is not bought, caulked or flashed', () => {
  const d = { ...defaultDesign(), autoWall: false };
  const both = estimate(buildShed(d));
  const off = { ...d, openings: d.openings.map((o) => (o.id === 'o3' ? { ...o, offset: 500 } : o)) };
  const s = buildShed(off);
  assert.ok(s.warnings.some((w) => /runs past the end of the 12 ft wall/.test(w)));
  assert.equal(s.framedOpenings.length, 2);
  const qty = (est, re) => est.shopping.filter((r) => re.test(r.name)).reduce((t, r) => t + r.qty, 0);
  assert.equal(qty(both, /Vertical slider/), 2);
  assert.equal(qty(estimate(s), /Vertical slider/), 1);
});

test('a longer or wider shed never costs less', () => {
  for (const make of [defaultDesign, ...Object.values(PRESETS)]) {
    const b = { ...make(), autoWall: false, autoPitch: false, autoOverhang: false };
    for (const k of ['length', 'width']) {
      let prev = 0;
      for (let v = 72; v <= (k === 'length' ? 240 : 168); v += 24) {
        const t = estimate(buildShed({ ...b, [k]: v })).total;
        assert.ok(t >= prev - 0.005, `${b.name} ${k} ${v}: ${t} < ${prev}`);
        prev = t;
      }
    }
  }
});

test('DXF text is plain ASCII: other characters are written as \\U+ escapes', () => {
  assert.equal(dxfText('Café “x”'), 'Caf\\U+00E9 \\U+201Cx\\U+201D');
  assert.equal(dxfText('a\nb'), 'a b');
  const shed = buildShed({ ...defaultDesign(), name: 'Café shed' });
  assert.deepEqual(dxfProblems(sheetsDxf(buildSheets(shed))), []);
});
