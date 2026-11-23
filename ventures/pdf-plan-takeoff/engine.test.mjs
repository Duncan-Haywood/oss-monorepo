import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSheets, pathSegments } from './geometry.mjs';
import { inflate } from './inflate-browser.mjs';
import { samplePdf, SAMPLE } from './sample.mjs';
import { parseScale, parseFeetInches, formatFeetInches, scaleNotes, assignScale, dimensionMatches, sheetVerdict, inferScale, realLength, phrases } from './scale.mjs';
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
