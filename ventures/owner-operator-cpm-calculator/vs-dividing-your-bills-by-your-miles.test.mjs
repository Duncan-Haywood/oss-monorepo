import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { calculateWeek } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-dividing-your-bills-by-your-miles.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

// The inputs the page states in prose, so the test and the page cannot drift
// apart without one of them being edited.
const WEEK = {
  loadedMiles: 2000,
  emptyMiles: 500,
  mpg: 6.5,
  dieselPrice: 3.9,
  truckPayment: 2200,
  insurance: 1100,
  permits: 200,
  otherFixed: 600,
  maintenancePerMile: 0.18,
  tiresPerMile: 0.04,
  otherVariablePerMile: 0.03,
  offeredLoadedRate: 1.65,
};

// Two decimals, with a thousands separator once the figure needs one -- the
// page writes $3,071.15 and $1.54, so a plain toFixed(2) would miss the first.
const money = (n) =>
  n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d)(?=\.))/g, ',');

test('every figure in the page is what calc.mjs actually produces', () => {
  // This is the test worth having on this page. Its whole argument is a set of
  // dollar amounts, and a comparison page whose numbers have quietly drifted
  // from the calculator it is promoting is worse than no page: it is a
  // specific, checkable, wrong claim about the tool's own arithmetic. So the
  // figures are recomputed from the shipped model rather than pinned to a
  // literal someone typed once.
  const week = calculateWeek({ ...WEEK, factoringRate: 0 });

  assert.equal(week.totalMiles, 2500);
  assert.equal(week.deadheadShare, 20);
  assert.ok(html.includes(`$${money(week.weeklyCost)}`),
    `weekly cost ${money(week.weeklyCost)} not on the page`);
  assert.ok(html.includes(`$${money(week.allInCpm)}`), 'all-in cost per total mile missing');
  assert.ok(html.includes(`$${money(week.breakEvenLoadedRate)}`), 'break-even loaded rate missing');
  assert.ok(html.includes(`$${money(week.fixedCpm)}`), 'fixed cost per mile missing');

  // The headline gap: what the offer looks like against cost-per-total-mile
  // versus what it is against the rate actually being offered.
  const apparent = Math.round((WEEK.offeredLoadedRate - week.allInCpm) * 100);
  const real = Math.round((WEEK.offeredLoadedRate - week.breakEvenLoadedRate) * 100);
  assert.equal(apparent, 42);
  assert.equal(real, 11);
  assert.ok(html.includes(`${apparent}&cent;`), `apparent margin ${apparent}c missing`);
  assert.ok(html.includes(`${real}&cent;`), `real margin ${real}c missing`);

  // ...and the gap between the two divisions, quoted in the FAQ.
  const gap = Math.round((week.breakEvenLoadedRate - week.allInCpm) * 100);
  assert.equal(gap, 31);
  assert.ok(html.includes(`${gap} cent per mile gap`), `stated gap is not ${gap}c`);
});

test('the weekly cost is written with its thousands separator', () => {
  // The formatter above is the only thing standing between "the page agrees
  // with the model" and "the page agrees with the model modulo punctuation",
  // so it gets its own assertion rather than being trusted silently.
  const week = calculateWeek({ ...WEEK, factoringRate: 0 });
  assert.equal(money(week.weeklyCost), '3,071.15');
  assert.ok(html.includes('$3,071.15'), 'weekly cost is not rendered as $3,071.15');
});

test('the short-week comparison is the same bills over fewer miles', () => {
  const full = calculateWeek({ ...WEEK, factoringRate: 0 });
  const short = calculateWeek({ ...WEEK, loadedMiles: 1200, emptyMiles: 300, factoringRate: 0 });

  // Same empty share, so the effect the page attributes to the short week
  // cannot be deadhead wearing a different hat.
  assert.equal(short.deadheadShare, full.deadheadShare);
  assert.equal(short.monthlyFixed, full.monthlyFixed);

  assert.ok(short.fixedCpm > full.fixedCpm);
  for (const figure of [short.fixedCpm, short.allInCpm, short.breakEvenLoadedRate]) {
    assert.ok(html.includes(`$${money(figure)}`), `short-week figure ${money(figure)} missing`);
  }
});

test('the factoring comparison matches the model', () => {
  const plain = calculateWeek({ ...WEEK, factoringRate: 0 });
  const factored = calculateWeek({ ...WEEK, factoringRate: 3 });

  assert.ok(html.includes(`$${money(factored.offered.effectiveLoadedRate)}`),
    'effective loaded rate under factoring missing');
  assert.ok(html.includes(`$${money(plain.offered.weeklyProfit)}`), 'unfactored profit missing');
  assert.ok(html.includes(`$${money(factored.offered.weeklyProfit)}`), 'factored profit missing');

  const shareLost = Math.round(
    (1 - factored.offered.weeklyProfit / plain.offered.weeklyProfit) * 100,
  );
  assert.equal(shareLost, 43);
  assert.ok(html.includes(`${shareLost}% of the profit`), `stated profit share is not ${shareLost}%`);
});

test('the unreimbursed lumper figure matches the model', () => {
  const plain = calculateWeek({ ...WEEK, factoringRate: 0 });
  const withLumper = calculateWeek({ ...WEEK, factoringRate: 0, lumperPaid: 150, lumperReimbursed: 0 });

  assert.equal(withLumper.lumperUnreimbursed, 150);
  assert.ok(html.includes(`$${money(withLumper.breakEvenLoadedRate)}`),
    'break-even loaded rate with the lumper missing');
  const delta = Math.round((withLumper.breakEvenLoadedRate - plain.breakEvenLoadedRate) * 100);
  assert.equal(delta, 7);
  assert.ok(/seven cents, on one receipt/.test(html), 'the lumper delta is not stated as seven cents');
});

test('says plainly that the figures are illustrative, not a claim about costs', () => {
  // A page full of dollar amounts about a real trade is exactly the shape that
  // gets quoted back as if it were market data.
  assert.match(html, /<strong>Illustrative figures only\.<\/strong>/);
  assert.match(html, /not a claim about what fuel, insurance, factoring, lumpers or freight cost/);
  assert.match(html, /your numbers will differ/i);
});

test('concedes what dividing bills by miles does better', () => {
  // The honest half. Without it this is an advert, and the claim it makes --
  // that your own statements are the better cost measurement -- is true.
  assert.match(html, /What dividing your bills by your miles does better/);
  assert.match(html, /It is a measurement; this page is an estimate/);
  assert.match(html, /<h3>Should I stop working out my cost per mile from my own statements\?<\/h3>/);
});

test('carries the venture disclaimers and the sponsor line', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or business advice/);
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
  assert.match(html, /Free and open source/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-dividing-your-bills-by-your-miles\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(
      html.includes(`<h3>${question.name}</h3>`),
      `FAQ schema question has no matching visible <h3>: ${question.name}`,
    );
  }
});

test('the calculator links out to this page, so it is reachable without the sitemap', () => {
  // This catalogue's sitemap is not auto-discovered from its Pages subpath
  // (platform/ci/pages_state.py, `indexing` row), so an inbound link is the
  // discovery route that does not depend on that being fixed.
  assert.match(indexHtml, /href="vs-dividing-your-bills-by-your-miles\.html"/);
});

test('links back to the calculator and to both sibling guides', () => {
  assert.match(html, /href="\.\/"/);
  assert.match(html, /href="deadhead-miles\.html"/);
  assert.match(html, /href="does-detention-pay-cover-the-wait\.html"/);
});

test('the sitemap lists this page', () => {
  assert.match(sitemap, /vs-dividing-your-bills-by-your-miles\.html/);
});
