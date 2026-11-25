// eval/turns-vintages-tolerant.mjs: a call rule tolerating a 6-month dated-month shift, on real FRED-MD vintages
// (README "A tolerant call rule on real vintages"). Pins the pre-registered result: T1, T3, T4 pass, T2 fails.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run, placebos } from './eval/turns-vintages-tolerant.mjs';

test('T6 on vintages: the 2001 peak and 2009 trough are called on time, the 2001 trough still after 61 months', () => {
  const r = run();
  assert.deepEqual([r.T1, r.T2, r.T3, r.T4, r.pass], [true, false, true, true, false]);
  assert.deepEqual(r.V.calls.map((c) => c.delay), [2, 61, 8, 7, 7, 7]);
  assert.deepEqual(r.P.calls.map((c) => c.delay), [7, 8, 7, 8, 7, 7]);
  assert.deepEqual([r.V.before, r.P.before, r.plT6, r.plS3], [4, 5, 1, 0]);
  // the 2001 peak is called at the window's edge: dated 2000-09, six months early
  assert.deepEqual([r.V.calls[0].atCall, r.V.calls[0].maxShift], [-6, 6]);
});

test('ten placebo targets; the one T6 calls is the 2002-11 trough, through the 2003-04 soft-patch trough', () => {
  const pl = placebos();
  assert.equal(pl.length, 10);
  const r = run();
  assert.deepEqual(r.pl.filter((p) => p.T6).map((p) => `${p.kind} ${p.month}`), ['trough 2002-11']);
});

test('the 2001 trough is missed because 2004-2006 vintages end the contraction at 2003-04, 17 months on', () => {
  const { rv } = run();
  const lab = (k) => `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`;
  for (const pub of ['2004-06', '2005-06', '2006-06']) {
    const c = rv.find((x) => x.pub === pub);
    const troughs = c.turns.filter((t) => t.kind === 'trough').map((t) => lab(t.k));
    assert.ok(troughs.includes('2003-04') && !troughs.some((m) => m >= '2001-05' && m <= '2002-05'), pub);
  }
});
