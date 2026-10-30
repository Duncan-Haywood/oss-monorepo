import test from 'node:test';
import assert from 'node:assert/strict';
import { budget } from './simplify.mjs';
import { budgetPath, budgetPathHtml, OPT_IN } from './budgetpath.mjs';
import { GALLERY_DESIGNS } from './gallery-data.mjs';
import { buildShed, normalize } from './model.mjs';
import { estimate } from './estimate.mjs';
import { structuralChecks } from './checks.mjs';

// The owner's case: painted lap siding and shingles, fixed, toward $2,000.
const lap = { ...GALLERY_DESIGNS.find((g) => g.id === 'house-cheapest').design, locked: ['siding', 'roofing'] };
const cheaper = budget(lap);

test('the steps carry a running materials total that ends at the cheaper build', () => {
  const p = budgetPath(lap, 2000, cheaper);
  assert.equal(p.start, cheaper.base.total);
  if (p.steps.length) assert.ok(Math.abs(p.steps[p.steps.length - 1].total - cheaper.best.total) < 0.05);
  for (let i = 1; i < p.steps.length; i++) assert.ok(p.steps[i].total < p.steps[i - 1].total);
});

test('a budget the steps reach names the first step that reaches it', () => {
  if (!cheaper.best.steps.length) return;
  const after1 = cheaper.base.total - (cheaper.best.steps[0].materials ?? cheaper.best.steps[0].saving);
  const p = budgetPath(lap, after1 + 0.001, cheaper);
  assert.equal(p.reachedAt, 0);
  assert.match(budgetPathHtml(p), /Step 1 brings it within your budget/);
  assert.equal(budgetPath(lap, cheaper.base.total + 1, cheaper).reachedAt, -1);
  assert.match(budgetPathHtml(budgetPath(lap, cheaper.base.total + 1, cheaper)), /already within it/);
});

test('opt-in savings are priced on the cheaper build and say what they give up', () => {
  const p = budgetPath(lap, 2000, cheaper);
  assert.ok(p.extras.length >= 1);
  for (const x of p.extras) {
    assert.ok(x.saves > 0 && x.gives.length > 20, x.label);
    const o = OPT_IN.find((y) => y.key === x.key);
    const alone = estimate(buildShed(normalize({ ...cheaper.best.design, ...o.change(cheaper.best.design) }))).total;
    assert.ok(Math.abs(cheaper.best.total - alone - x.saves) < 0.01, x.label);
  }
  assert.ok(p.withExtras < p.cheapest);
});

test('the smaller shed that fits the budget is the same design, passes its checks and is within the budget', () => {
  const p = budgetPath(lap, 2000, cheaper);
  assert.ok(p.shrink, 'the lap-sided shed is over $2,000 at full size');
  const s = p.shrink;
  const shed = buildShed(normalize(s.design));
  assert.ok(structuralChecks(shed).ok);
  assert.ok(Math.abs(estimate(shed).total - s.total) < 0.01);
  assert.equal(s.fits, s.total <= 2000);
  assert.equal(shed.design.sidingType, lap.sidingType);
  assert.equal(shed.design.roofCover, lap.roofCover);
  assert.ok(Math.min(s.design.length, s.design.width) >= 72);
  const html = budgetPathHtml(p);
  assert.match(html, s.fits ? /What fits \$2,000 in this design/ : /Smaller does not get there either/);
  assert.match(html, /not engineered or code-checked/);
});
