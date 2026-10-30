import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDesign, PRESETS, buildShed, normalize } from './model.mjs';
import { estimate } from './estimate.mjs';
import { leverOptions, leverTableHtml, DOOR_WIDTHS } from './costlevers.mjs';

const r = leverOptions(defaultDesign());
const group = (t) => r.groups.find((g) => g.title === t || g.title.startsWith(t));

test('every group leads with your choice, and each other row is your design with one change, priced', () => {
  for (const t of ['Foundation', 'Floor', 'Door', 'Windows']) assert.ok(group(t), t);
  for (const g of r.groups) {
    assert.equal(g.rows.filter((x) => x.current).length, 1, g.title);
    assert.ok(g.rows[0].current, `${g.title}: yours first`);
    for (const x of g.rows.filter((y) => !y.current)) {
      const total = estimate(buildShed(normalize({ ...defaultDesign(), ...x.change }))).total;
      assert.ok(Math.abs(x.total - total) < 0.005, x.label);
      assert.ok(Math.abs(x.delta - (total - r.base.total)) < 0.006, x.label);
    }
  }
});

test('no windows saves money and says what it costs in light', () => {
  const x = group('Windows').rows.find((y) => y.label === 'No windows');
  assert.ok(x.delta < 0 && x.ok);
  assert.match(x.note, /No daylight/);
  assert.ok(!normalize({ ...defaultDesign(), ...x.change }).openings.some((o) => o.kind === 'window'));
});

test('site-built doors come in every width, centred where the door was, and over 48" as a pair that builds', () => {
  const rows = group('Door').rows;
  for (const w of DOOR_WIDTHS) if (w !== 38.5) assert.ok(rows.some((x) => x.label.startsWith(`Built on site, ${w}"`)), `${w}"`);
  const pair = rows.find((x) => x.label.startsWith('Built on site, 72"'));
  assert.ok(pair.ok, 'a 72" pair fits the 12 ft wall and passes');
  const shed = buildShed(normalize({ ...defaultDesign(), ...pair.change }));
  assert.equal(shed.doors[0].leaves, 2);
  const door = shed.design.openings.find((o) => o.kind === 'door');
  const was = defaultDesign().openings.find((o) => o.kind === 'door');
  assert.ok(Math.abs(door.offset + door.width / 2 - (was.offset + was.width / 2)) <= 1, 'kept centred');
});

test('foundation rows cover a gravel pad and each block on each kind of gravel, with the site prep', () => {
  const rows = group('Foundation').rows;
  assert.equal(rows.length, 1 + 3 * 3);
  for (const x of rows) assert.ok(x.note.length > 40, x.label);
  assert.ok(rows.some((x) => /full gravel pad/.test(x.label) && /cu yd/.test(x.note)));
});

test('a 12x16 also prices, and the table shows fails without a button', () => {
  const big = leverOptions(PRESETS['12x16']());
  assert.ok(big.groups.length >= 4);
  const html = leverTableHtml({ base: big.base, groups: [{ title: 'T', rows: [
    { label: 'yours', current: true, total: 100, delta: 0, hours: 1, dHours: 0, dPeak: 0, ok: true, failing: [], unbuilt: [], note: '' },
    { label: 'bad <b>', current: false, total: 90, delta: -10, hours: 1, dHours: 0, dPeak: 0, ok: false, failing: ['Floor joists'], unbuilt: [], note: 'x' },
    { label: 'good', current: false, total: 95, delta: -5, hours: 1, dHours: 0.5, dPeak: 2, ok: true, failing: [], unbuilt: [], note: 'y' },
  ] }] });
  assert.equal((html.match(/data-lever=/g) || []).length, 1);
  assert.match(html, /fails<\/strong>: Floor joists/);
  assert.match(html, /bad &lt;b&gt;/);
  assert.match(html, /saves \$10\.00/);
});
