import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSheets, pathSegments } from './geometry.mjs';
import { inflate } from './inflate-browser.mjs';
import { samplePdf, SAMPLE } from './sample.mjs';
import { parseScale, parseFeetInches, formatFeetInches, scaleNotes, assignScale, dimensionMatches, sheetVerdict, inferScale, realLength, phrases, STANDARD_IMPERIAL } from './scale.mjs';
import { SnapIndex, valueOf, takeoffCsv, polygonArea } from './measure.mjs';
import { roomAt } from './rooms.mjs';

const sheets = await readSheets(samplePdf(), inflate);
const [full, half] = sheets.pages;

test('scale notes in every form', () => {
  assert.equal(parseScale('1/4" = 1\'-0"').ratio, 48);
  assert.equal(parseScale('SCALE: 1/8" = 1\'-0"').ratio, 96);
  assert.equal(parseScale('3/32" = 1\'-0"').ratio, 128);
  assert.equal(parseScale('1 1/2" = 1\'-0"').ratio, 8);
  assert.equal(parseScale('1-1/2" = 1\'-0"').ratio, 8);
  assert.equal(parseScale('12" = 1\'-0"').ratio, 1);
  assert.equal(parseScale('1" = 20\'').ratio, 240);
  assert.equal(parseScale('1" = 20\'-0"').ratio, 240);
  assert.deepEqual([parseScale('1:100').ratio, parseScale('1:100').system], [100, 'metric']);
  assert.equal(parseScale('1 : 50').ratio, 50);
  assert.ok(parseScale('NTS').nts);
  assert.ok(parseScale('NOT TO SCALE').nts);
  assert.equal(parseScale('1/4" = 1′-0″').ratio, 48);
  assert.equal(parseScale('FLOOR PLAN'), null);
});

test('feet and inches read and written', () => {
  assert.equal(parseFeetInches('12\' - 6"'), 150);
  assert.equal(parseFeetInches('12\'-6 1/2"'), 150.5);
  assert.equal(parseFeetInches('6"'), 6);
  assert.equal(parseFeetInches('3/4"'), 0.75);
  assert.equal(parseFeetInches('12\''), 144);
  assert.equal(parseFeetInches('0\' - 13"'), null);
  assert.equal(parseFeetInches('A-101'), null);
  assert.equal(formatFeetInches(150.5), '12\' - 6 1/2"');
  assert.equal(formatFeetInches(144), '12\' - 0"');
});

test('runs on one baseline join into phrases, at any angle', () => {
  const runs = [{ text: '1/4"', x: 10, y: 10, size: 8, width: 14 }, { text: '=', x: 26, y: 10, size: 8, width: 5 }, { text: "1'-0\"", x: 33, y: 10, size: 8, width: 18 },
    { text: "24'", x: 100, y: 10, size: 8, angle: 90, width: 10 }, { text: '- 0"', x: 100, y: 22, size: 8, angle: 90, width: 14 }];
  assert.deepEqual(phrases(runs).map((p) => p.text).sort(), ['1/4" = 1\'-0"', '24\' - 0"'].sort());
});

test('the sample sheet: line work, text, two scale notes', () => {
  assert.ok(full.segs.length / 4 > 50);
  assert.deepEqual(scaleNotes(full.runs).map((n) => n.ratio), [48, 24]);
});

test('each view takes its own note', () => {
  const notes = scaleNotes(full.runs);
  assert.equal(assignScale(notes, [SAMPLE.office]).ratio, 48);
  assert.equal(assignScale(notes, [{ x: 830, y: 300 }]).ratio, 24);
  assert.equal(assignScale(notes, [{ x: 830, y: 300 }], 'nearest').ratio, 24);
});

test('dimension spans run between witness lines, not to the line ends', () => {
  const d = dimensionMatches(full);
  const overall = d.find((x) => x.text === '36\' - 0"');
  assert.ok(overall.witnessed);
  assert.equal(overall.segLen, 36 * 18);
  assert.ok(overall.lineLen > overall.segLen);
  assert.equal(overall.implied, 48);
  const vertical = d.find((x) => x.text === '24\' - 0"');
  assert.equal(vertical.implied, 48);
});

test('verdicts: confirmed as drawn, half size when shrunk', () => {
  assert.equal(sheetVerdict(full).verdict, 'confirmed');
  const h = sheetVerdict(half);
  assert.equal(h.verdict, 'half size');
  assert.equal(h.ratio, 96);
  assert.equal(h.noteRatio, 48);
});

test('with no note, the dimensions name the scale', () => {
  const noNotes = { ...full, runs: full.runs.filter((r) => !/= 1'-0"/.test(r.text)) };
  const v = sheetVerdict(noNotes, []);
  assert.equal(v.verdict, 'inferred');
  assert.equal(v.ratio, 48);
  assert.equal(inferScale([]), null);
});

test('snapping prefers corners, then midpoints, then the line', () => {
  const s = new SnapIndex([0, 0, 100, 0, 100, 0, 100, 50]);
  assert.deepEqual(s.snap(98, 2, 5), { x: 100, y: 0, kind: 'end' });
  assert.deepEqual(s.snap(50, 1, 5), { x: 50, y: 0, kind: 'mid' });
  assert.equal(s.snap(30, 1, 5).kind, 'on');
  assert.equal(s.snap(30, 30, 5), null);
});

test('values: length in feet-inches, area in SF, metric in m', () => {
  const sc = { ratio: 48, system: 'imperial' };
  const pts = SAMPLE.outsideCorners.map(([x, y]) => ({ x, y }));
  assert.equal(valueOf({ type: 'length', pts: pts.slice(0, 2), scale: sc }).value, 36);
  const a = valueOf({ type: 'area', pts, scale: sc });
  assert.equal(a.value, 36 * 24);
  assert.equal(a.perimeter, 120);
  assert.equal(valueOf({ type: 'count', pts }).value, 4);
  assert.equal(valueOf({ type: 'length', pts: pts.slice(0, 2), scale: null }).value, null);
  const m = valueOf({ type: 'length', pts: [{ x: 0, y: 0 }, { x: 72, y: 0 }], scale: { ratio: 100, system: 'metric' } });
  assert.ok(Math.abs(m.value - 2.54) < 1e-9);
  assert.ok(Math.abs(realLength(72, { ratio: 96, system: 'imperial' }) - 96) < 1e-9);
  assert.equal(polygonArea([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]), 50);
});

test('fill area finds the office, its door swing ignored', () => {
  const r = roomAt(full, SAMPLE.office);
  assert.ok(r.ok, r.reason);
  const sf = valueOf({ type: 'fill', pts: [], areaPt2: r.areaPt2, scale: { ratio: 48, system: 'imperial' } }).value;
  assert.ok(Math.abs(sf - SAMPLE.office.sf) < 1.5, String(sf)); // the door's half partition adds a little
  const withSwing = roomAt(full, SAMPLE.office, { keepCurves: true });
  const sf2 = withSwing.areaPt2 * (48 / 72) ** 2 / 144;
  assert.ok(sf2 < sf - 5, 'the swing cuts a quarter circle out when curves count');
});

test('fill area refuses an open region and a click on a line', () => {
  assert.equal(roomAt(full, { x: 60, y: 120 }, { window: 200 }).ok, false);
  assert.match(roomAt(full, { x: 120, y: 300 }).reason, /on a line/);
});

test('CSV: one row a measurement, totals by label, no formula injection', () => {
  const sc = { ratio: 48, system: 'imperial', label: '1/4" = 1\'-0"' };
  const csv = takeoffCsv([
    { type: 'length', page: 1, label: 'Ext wall', pts: [{ x: 0, y: 0 }, { x: 180, y: 0 }], scale: sc, scaleFrom: "view's note" },
    { type: 'length', page: 1, label: 'Ext wall', pts: [{ x: 0, y: 0 }, { x: 0, y: 90 }], scale: sc },
    { type: 'count', page: 1, label: '=HYPERLINK("x")', pts: [{ x: 1, y: 1 }] },
  ]);
  const lines = csv.trim().split('\n');
  assert.match(lines[0], /^#,Sheet page,Label,Type,Quantity,Unit/);
  assert.match(lines[1], /,Ext wall,length,10,LF,/);
  assert.ok(lines.some((l) => /,Ext wall,total,15,LF/.test(l)));
  assert.ok(lines[3].includes(`"'=HYPERLINK(""x"")"`));
});

test('path reader: curves flattened and flagged, forms entered, clips not painted', () => {
  const g = pathSegments('0 0 m 10 0 l S 0 0 m 0 10 10 10 10 0 c S 0 0 5 5 re W n');
  assert.equal(g.curve.filter(Boolean).length, g.curve.length - 1);
  assert.equal(g.paint.length, g.curve.length);
  const forms = new Map([['Fm0', { content: '0 0 m 1 0 l S', forms: new Map(), matrix: [2, 0, 0, 2, 100, 100] }]]);
  const h = pathSegments('q 1 0 0 1 10 0 cm /Fm0 Do Q', forms);
  assert.deepEqual([...h.segs], [110, 100, 112, 100]);
});

test('not a PDF, said plainly', async () => {
  const r = await readSheets(new TextEncoder().encode('hello'), inflate);
  assert.ok(r.flags.notPdf);
});

// redteam 2026-11-27: real defects and escaped mutants in scale.mjs and measure.mjs
test('metric scales with a thousands separator read as the whole number', () => {
  assert.equal(parseScale('1:1,000').ratio, 1000);
  assert.equal(parseScale('1:2,500').ratio, 2500);
  assert.equal(parseScale('1:1.000').ratio, 1000);
  assert.equal(parseScale('SCALE 1:1,250').ratio, 1250);
  assert.equal(parseScale('1:12.5').ratio, 12.5);
  assert.equal(parseScale('1:7,5').ratio, 7.5);
});

test('a negative feet-inches dimension is negative as a whole', () => {
  assert.equal(parseFeetInches('-3\' 6"'), -42);
  assert.equal(parseFeetInches('-3\'-6"'), -42);
  assert.equal(parseFeetInches('-3\''), -36);
  assert.equal(parseFeetInches('-0\' 6"'), -6);
});

test('a zero denominator is no number, not zero or infinity', () => {
  assert.equal(parseScale('1 1/0" = 1\'-0"'), null);
  assert.equal(parseScale('1-1/0" = 1\'-0"'), null);
  assert.equal(parseFeetInches('1/0"'), null);
  assert.equal(parseFeetInches('5\' 1/0"'), null);
});

test('inch-to-inch scales: enlargements read, a zero side is refused', () => {
  assert.equal(parseScale('3" = 1"').ratio, 1 / 3);
  assert.equal(parseScale('1" = 1"').ratio, 1);
  assert.equal(parseScale('1" = 0"'), null);
  assert.equal(parseScale('0" = 1"'), null);
});

test('the standard imperial scales are the ones printed on US sheets', () => {
  const byLabel = Object.fromEntries(STANDARD_IMPERIAL.map((s) => [s.label, s.ratio]));
  assert.deepEqual(byLabel, {
    '1/32" = 1\'-0"': 384, '1/16" = 1\'-0"': 192, '3/32" = 1\'-0"': 128, '1/8" = 1\'-0"': 96, '3/16" = 1\'-0"': 64,
    '1/4" = 1\'-0"': 48, '3/8" = 1\'-0"': 32, '1/2" = 1\'-0"': 24, '3/4" = 1\'-0"': 16, '1" = 1\'-0"': 12,
    '1 1/2" = 1\'-0"': 8, '3" = 1\'-0"': 4, '6" = 1\'-0"': 2, '12" = 1\'-0"': 1,
    '1" = 10\'': 120, '1" = 20\'': 240, '1" = 30\'': 360, '1" = 40\'': 480, '1" = 50\'': 600, '1" = 60\'': 720, '1" = 100\'': 1200, '1" = 200\'': 2400,
  });
});

test('three agreeing dimensions are enough to confirm a note', () => {
  const page = { ...full, runs: full.runs.filter((r) => r.text !== '12\' - 0"' && !/^12'/.test(r.text)) };
  const dims = dimensionMatches(page);
  assert.equal(dims.filter((d) => d.implied === 48).length, 3, 'fixture: exactly three dimensions at 1/4"');
  const v = sheetVerdict(page);
  assert.equal(v.verdict, 'confirmed');
  assert.equal(v.support, 3);
});

test('a segment spanning exactly 2500 snap cells is still snapped to', () => {
  const end = 49 * 24 + 1; // cells 0..49 on each axis: 50 x 50 = 2500
  const s = new SnapIndex([0, 0, end, end]);
  assert.deepEqual(s.snap(1, 1, 3), { x: 0, y: 0, kind: 'end' });
  const big = new SnapIndex([0, 0, 50 * 24 + 1, 50 * 24 + 1]); // 51 x 51: a sheet border, skipped
  assert.equal(big.snap(1, 1, 3), null);
});

test('property: any scale read is finite and positive, any length finite or null', () => {
  const nums = ['0', '1', '3', '12', '1/0', '0/0', '3/16', '1 1/0', '1-1/2', '1,000', '2.500', '.5', '007', '99999999999999999999'];
  const forms = [(a, b) => `${a}" = 1'-0"`, (a, b) => `1" = ${a}'`, (a, b) => `${a}" = ${b}"`, (a) => `1:${a}`, (a) => `SCALE: 1 : ${a}`];
  for (const f of forms) for (const a of nums) for (const b of nums) {
    const r = parseScale(f(a, b));
    if (r && 'ratio' in r) assert.ok(Number.isFinite(r.ratio) && r.ratio > 0, `${f(a, b)} -> ${r.ratio}`);
  }
  for (const ft of ['', '0\'', '-3\'', '12\'', '-0\'']) for (const inch of ['', '0"', '6"', '1/0"', '6 1/0"', '11.5"', '3/4"']) {
    const t = `${ft} ${inch}`.trim();
    if (!t) continue;
    const v = parseFeetInches(t);
    assert.ok(v === null || Number.isFinite(v), `${t} -> ${v}`);
  }
});
