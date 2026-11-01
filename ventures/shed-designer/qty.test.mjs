import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign } from './model.mjs';
import { estimate, shoppingCsv } from './estimate.mjs';
import { applyQty, cleanQty, cleanQtys, lineKey } from './qty.mjs';

const est0 = () => estimate(buildShed(defaultDesign()));

test('a typed quantity reprices its line and the total, keeping the listed count', () => {
  const est = est0();
  const r = est.shopping.find((x) => x.section === 'Lumber');
  const out = applyQty(est, { [lineKey(r)]: r.qty + 1 }, 5);
  const n = out.shopping.find((x) => lineKey(x) === lineKey(r));
  assert.equal(n.qty, r.qty + 1);
  assert.equal(n.listQty, r.qty);
  assert.equal(n.total, Math.round((r.qty + 1) * r.price * 100) / 100);
  assert.ok(Math.abs(out.total - (est.total + r.price)) < 0.011);
  assert.equal(out.tax, Math.round(out.total * 5) / 100);
  assert.equal(out.adjusted, 1);
  assert.match(shoppingCsv(out), new RegExp(`,${r.qty + 1},board,`));
});

test('0 marks the line off and leaves its total for the page to strike through', () => {
  const est = est0();
  const r = est.shopping[3];
  const out = applyQty(est, { [lineKey(r)]: 0 });
  const n = out.shopping[3];
  assert.equal(n.off, true);
  assert.equal(n.total, r.total);
  assert.equal(out.total, est.total);
});

test('the listed quantity, unknown keys and empty input change nothing; old name keys still match', () => {
  const est = est0();
  const r = est.shopping[0];
  assert.equal(applyQty(est, { [lineKey(r)]: r.qty }).adjusted, 0);
  assert.equal(applyQty(est, { nope: 3 }).total, est.total);
  assert.equal(applyQty(est, {}).adjusted, 0);
  assert.equal(applyQty(est, { [r.name]: 0 }).shopping[0].off, true);
  assert.equal(cleanQty(''), null);
  assert.equal(cleanQty('-1'), null);
  assert.equal(cleanQty('2'), 2);
  assert.deepEqual(cleanQtys({ a: 1, b: 'x', c: -2, d: 0 }), { a: 1, d: 0 });
});
