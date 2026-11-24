// eval/turns-usphci.mjs: the shipped one-column `--turns` default on the Philadelphia Fed's US coincident index,
// a second maker's composite, against NBER (README "A second make"). Pins the pre-registered result: U1 fails,
// U2 and U3 pass, nothing in the CLI changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from './eval/turns-usphci.mjs';

const r = run({ draws: 500 });

test('USPHCI: 8 of 12 NBER turns within 3 months, no false turn; U1 fails, U2 and U3 pass', () => {
  assert.equal(r.main.turns.length, 12);
  assert.deepEqual([r.S.matched, r.S.falses, r.S.U1, r.S.U2, r.U3], [8, 0, false, true, true]);
  assert.equal(r.decision, 'nothing changes');
  assert.deepEqual(r.S.found.map((f) => `${f.label}${f.kind[0]}`),
    ['1981-07p', '1982-11t', '1990-10p', '1991-05t', '2001-05p', '2001-12t', '2008-04p', '2009-10t', '2020-02p', '2020-04t']);
});

test('the misses: 1980 is not dated at all, the Great Recession is dated 4 months late at both ends', () => {
  const off = Object.fromEntries(r.S.per.map((p) => [`${p.month}${p.kind[0]}`, p.off]));
  assert.deepEqual([off['1980-01p'], off['1980-07t'], off['2007-12p'], off['2009-06t']], [18, 28, 4, 4]);
  // the jobless-recovery troughs are on time on this make
  assert.deepEqual([off['1991-03t'], off['2001-11t']], [2, 1]);
});

test('five copies date the same months but the 1981 peak (1981-07 to 1981-09)', () => {
  for (const v of r.vint) assert.deepEqual([v.matched, v.falses], [8, 0], v.file);
  const u = Object.fromEntries(r.u3rows.map((x) => [x.month, x.spread]));
  assert.equal(u['1981-07'], 2);
  assert.ok(r.u3rows.filter((x) => x.month !== '1981-07').every((x) => x.spread === 0));
});

test('printed, no bar: 3-month phases date 1980 (10 of 12); California shows a 1991-92 double dip', () => {
  assert.deepEqual([r.side.phase3.matched, r.side.phase3.falses], [10, 0]);
  assert.deepEqual([r.side.bigMoveOff.matched, r.side.bigMoveOff.falses], [6, 0]);
  assert.deepEqual(r.state.falseLabels, ['1991-10p', '1992-06t']);
});
