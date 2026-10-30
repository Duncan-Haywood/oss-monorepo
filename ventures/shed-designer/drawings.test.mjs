import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign, PRESETS } from './model.mjs';
import { buildSheets, sheetSvg, sheetsDxf } from './drawings.mjs';

const classic = () => PRESETS['8x12 classic']();

const sheets = buildSheets(buildShed(classic()));

test('a full set: cover, foundation, floor, four walls, roof, section, rafter and corner details', () => {
  assert.deepEqual(sheets.map((s) => s.id), ['cover', 'foundation', 'floor', 'wall-front', 'wall-right', 'wall-back', 'wall-left', 'roof', 'section', 'exterior-front-back', 'exterior-left-right', 'sheathing', 'cutting', 'details', 'rafter', 'corner']);
  for (const s of sheets) assert.ok(s.items.length > 5, s.id);
});

test('SVG sheets are self-contained and scoped', () => {
  for (const [i, s] of sheets.entries()) {
    const svg = sheetSvg(s, { name: '8x12', number: i + 1, of: sheets.length });
    assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" class="sds"/);
    assert.ok(svg.endsWith('</svg>'));
    assert.ok(!/NaN|undefined|Infinity/.test(svg), s.id);
    // Styles only reach inside the sheet, so an inline sheet cannot restyle the page.
    for (const rule of svg.match(/<style>([^<]*)<\/style>/)[1].split('\n').filter((l) => l.startsWith('.'))) assert.ok(rule.startsWith('.sds '), rule);
  }
  assert.match(sheetSvg(sheets.find((x) => x.id === 'wall-right')), /VENT/);
  assert.match(sheetSvg(sheets[0]), /DOORS, WINDOWS AND VENTS/);
});

test('DXF is R12 ASCII with layers and balanced sections', () => {
  const dxf = sheetsDxf(sheets);
  assert.ok(dxf.startsWith('0\nSECTION\n2\nHEADER'));
  assert.ok(dxf.trimEnd().endsWith('0\nEOF'));
  const lines = dxf.split('\n');
  assert.equal(lines.filter((l, i) => l === 'SECTION' && lines[i - 1] === '0').length, 3);
  assert.equal(lines.filter((l, i) => l === 'ENDSEC' && lines[i - 1] === '0').length, 3);
  for (const l of ['FRAMING', 'DIMS', 'OPENINGS', 'TEXT']) assert.ok(dxf.includes(`\n2\n${l}\n`), l);
  assert.ok(!/NaN|undefined/.test(dxf));
  // Group codes and values alternate: an even number of lines.
  assert.equal(dxf.trimEnd().split('\n').length % 2, 0);
});
