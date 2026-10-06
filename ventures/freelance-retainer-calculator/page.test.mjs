import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateCashFloat, calculateIncomeCoverage, calculatePlan, comparePaymentTerms, compareRetainerScenarios, compareRetainerUsage, compareUnusedHourRollover } from './app.js';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const termsPage = readFileSync(new URL('./retainer-payment-terms.html', import.meta.url), 'utf8');
const rolloverPage = readFileSync(new URL('./unused-hour-rollover.html', import.meta.url), 'utf8');
const goalPage = readFileSync(new URL('./will-this-retainer-hit-my-income-goal.html', import.meta.url), 'utf8');
const hoursPage = readFileSync(new URL('./how-many-retainer-hours.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

assert.match(index, /id="paymentTerms"/);
assert.match(index, /id="cashFloat"/);
assert.match(index, /id="termsLabel"/);
assert.match(index, /id="usageRows"/);
assert.match(index, /id="rolloverRows"/);
assert.match(index, /id="rolloverUnused"/);
assert.match(index, /retainer-payment-terms\.html/);
assert.match(index, /retainer-vs-hourly\.html/);
assert.match(index, /unused-hour-rollover\.html/);
assert.match(index, /Should I accept Net 30/);
assert.match(index, /Should unused retainer hours roll over/);

assert.match(termsPage, /id="floatForm"/);
assert.match(termsPage, /id="floatTarget"/);
assert.match(termsPage, /id="floatRows"/);
assert.match(termsPage, /\$15,600/);
assert.match(termsPage, /Invoice at month-end, Net 30/);
assert.match(termsPage, /No warranty/);
assert.match(termsPage, /GitHub Sponsors/);
assert.match(termsPage, /don't count my usage/);

assert.match(rolloverPage, /id="rolloverForm"/);
assert.match(rolloverPage, /id="rolloverPrice"[^>]*min="0"[^>]*step="25"[^>]*value="1725"/);
assert.match(rolloverPage, /id="rolloverMonth1"[^>]*min="0"[^>]*step="5"[^>]*value="50"/);
assert.match(rolloverPage, /id="rolloverMonth2"[^>]*min="0"[^>]*step="5"[^>]*value="100"/);
assert.match(rolloverPage, /id="pageRolloverRows"/);
assert.match(rolloverPage, /\$57\.50/);
assert.match(rolloverPage, /\$750/);
assert.match(rolloverPage, /No warranty/);
assert.match(rolloverPage, /GitHub Sponsors/);
assert.match(rolloverPage, /don't count my usage/);
assert.match(rolloverPage, /unused_hour_rollover_compared/);

assert.match(sitemap, /retainer-payment-terms\.html/);
assert.match(sitemap, /retainer-vs-hourly\.html/);
assert.match(sitemap, /unused-hour-rollover\.html/);

const plan = { rate: 75, retainer: 1725, retainerHours: 20 };
const usage = compareRetainerUsage(plan);
assert.equal(usage.breakEvenHours, 23);
const float = calculateCashFloat(7800, 'arrears30');
assert.equal(float.cashToFloat, 15600);
assert.equal(comparePaymentTerms(7800)[2].cashToFloat, 7800);
const rollover = compareUnusedHourRollover(plan);
assert.equal(rollover.unusedHours, 10);
assert.equal(rollover.clauses[2].month2Effective, 57.5);

// --- The income-goal block -------------------------------------------------
assert.match(index, /id="otherRevenue"/);
assert.match(index, /id="otherHours"/);
assert.match(index, /id="fillRate"[^>]*min="0"[^>]*max="100"[^>]*step="5"[^>]*value="100"/);
assert.match(index, /id="share"/);
assert.match(index, /id="shareResult"/);
assert.match(index, /Copy shareable link/);
assert.match(index, /id="coverageCommitted"/);
assert.match(index, /id="coverageUnsold"/);
assert.match(index, /id="coverageExpected"/);
assert.match(index, /id="coverageShortfall"/);
assert.match(index, /id="coverageRequiredFill"/);
assert.match(index, /id="coverageVerdict"/);
assert.match(index, /will-this-retainer-hit-my-income-goal\.html/);
assert.match(sitemap, /will-this-retainer-hit-my-income-goal\.html/);
assert.match(index, /id="scenarioRows"/);
assert.match(index, /id="scenarioInsight"/);
assert.match(index, /how-many-retainer-hours\.html/);
assert.match(index, /How many hours should a monthly retainer include/);
assert.match(sitemap, /how-many-retainer-hours\.html/);

assert.match(hoursPage, /No warranty/);
assert.match(hoursPage, /GitHub Sponsors/);
assert.match(hoursPage, /Best-effort hosting, no SLA/);
assert.match(hoursPage, /not financial, tax, or legal advice/);

const hourRows = compareRetainerScenarios({ income: 6000, costs: 1800, hours: 160, utilization: 65, retainerHours: 20, buffer: 15 });
const publishedHours = [
  { hours: 10, price: '$862.50', left: '94.0 hrs', share: '10%' },
  { hours: 15, price: '$1,293.75', left: '89.0 hrs', share: '14%' },
  { hours: 20, price: '$1,725', left: '84.0 hrs', share: '19%' },
  { hours: 25, price: '$2,156.25', left: '79.0 hrs', share: '24%' },
  { hours: 30, price: '$2,587.50', left: '74.0 hrs', share: '29%' },
];
for (const row of publishedHours) {
  const computed = hourRows.find((item) => item.retainerHours === row.hours);
  assert.ok(computed && computed.ok, `${row.hours}h package must price`);
  const price = computed.retainer === 1725
    ? `$${computed.retainer.toLocaleString('en-US')}`
    : `$${computed.retainer.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  assert.equal(price, row.price, `${row.hours}h price`);
  assert.equal(`${computed.remainingCapacity.toFixed(1)} hrs`, row.left, `${row.hours}h leftover`);
  assert.equal(`${Math.round(computed.shareOfCapacity * 100)}%`, row.share, `${row.hours}h share`);
  assert.ok(hoursPage.includes(row.price), `hours page missing ${row.price}`);
  assert.ok(hoursPage.includes(row.left), `hours page missing ${row.left}`);
}

assert.match(goalPage, /No warranty/);
assert.match(goalPage, /GitHub Sponsors/);
assert.match(goalPage, /not financial, tax, or legal advice/);

// A worked example on a public page is a claim about what the tool outputs.
// Recompute every published figure from `app.js` rather than trusting the
// prose, so the page cannot drift into quoting numbers the calculator has
// stopped producing.
const goalPlan = calculatePlan({ income: 6000, costs: 1800, hours: 160, utilization: 65, retainerHours: 20, buffer: 15 });
const published = [
  { fill: 100, hours: '84.0 h', reaches: '$8,025', short: 'None — $225 over' },
  { fill: 80, hours: '67.2 h', reaches: '$6,765', short: '$1,035', closes: '13.8 h' },
  { fill: 60, hours: '50.4 h', reaches: '$5,505', short: '$2,295', closes: '30.6 h' },
  { fill: 40, hours: '33.6 h', reaches: '$4,245', short: '$3,555', closes: '47.4 h' },
];
for (const row of published) {
  const coverage = calculateIncomeCoverage(goalPlan, { fillRatePercent: row.fill });
  assert.equal(`${coverage.expectedFillHours.toFixed(1)} h`, row.hours, `fill ${row.fill}%: hours billed`);
  assert.equal(`$${coverage.expectedRevenue.toLocaleString('en-US')}`, row.reaches, `fill ${row.fill}%: month reaches`);
  if (row.closes) {
    assert.equal(`${coverage.hoursToClose.toFixed(1)} h`, row.closes, `fill ${row.fill}%: hours to close`);
    assert.equal(`$${coverage.shortfall.toLocaleString('en-US')}`, row.short, `fill ${row.fill}%: shortfall`);
  } else {
    assert.equal(coverage.coversTarget, true, 'fill 100%: must cover');
    assert.equal(`$${coverage.surplus.toLocaleString('en-US')}`, '$225');
  }
  assert.ok(goalPage.includes(row.reaches), `page is missing ${row.reaches}`);
}
// The headline break-even the whole page is built around.
assert.equal(calculateIncomeCoverage(goalPlan, { fillRatePercent: 60 }).requiredFillRate, 96.43);
assert.match(goalPage, /96\.4% fill rate/);
assert.equal(calculateIncomeCoverage(goalPlan, { fillRatePercent: 60 }).retainerPriceToCloseGap, 4020);
assert.match(goalPage, /\$4,020/);
assert.equal(calculateIncomeCoverage(goalPlan).retainerShareOfTarget, 22.12);
assert.match(goalPage, /22% of \$7,800/);

// Closest sibling in the "Getting paid & job margin" subcategory: a
// construction change order rather than a recurring retainer. Without a
// crawlable link here, a crawler entering on this calculator never reaches
// the change-order tool in one hop.
assert.match(
  index,
  /href="\.\.\/change-order-margin-calculator\/"/,
  'index must link ../change-order-margin-calculator/ so crawlers reach the change order calculator in one hop',
);


// Crawlable-orphan link. Both tools answer "how do I get paid" for one person
// working for themselves; a freelancer applying for salaried roles alongside
// the client work is the same reader. `ats-resume-checker` had no inbound
// sibling link at all, so a crawler entering the catalogue anywhere else could
// not reach it in one hop -- and with sitemap enumeration unavailable on this
// origin (see platform/ci/pages_state.py's `indexing` row) a page reachable
// only from the sitemap is reachable from nothing.
assert.match(
  index,
  /href="\.\.\/ats-resume-checker\/"/,
  'index must link ../ats-resume-checker/ so crawlers reach the ATS resume checker in one hop',
);

// Crawlable-orphan link. `freelance-platform-fee-calculator` shipped with no
// inbound sibling link at all; both tools price a self-employed freelancer's
// own work, one a recurring retainer and the other a one-off Upwork/Fiverr
// job, so a reader pricing one is plausibly pricing the other.
assert.match(
  index,
  /href="\.\.\/freelance-platform-fee-calculator\/"/,
  'index must link ../freelance-platform-fee-calculator/ so crawlers reach the Upwork vs. Fiverr fee calculator in one hop',
);

// Crawlable-orphan link: `freelance-retainer-vs-hourly-calculator` prices the
// same retainer from the freelancer's own time log rather than an income goal.
assert.match(
  index,
  /href="\.\.\/freelance-retainer-vs-hourly-calculator\/"/,
  'index must link ../freelance-retainer-vs-hourly-calculator/ so crawlers reach the time-log retainer replay in one hop',
);

// Crawlable-orphan link, closed from freelance-writer-rate-calculator's
// first commit rather than shipping that new tool as an orphan to close
// later. Both tools price a self-employed writer's own work -- one an
// ongoing retainer, the other a single piece's per-word rate vs. flat fee.
assert.match(
  index,
  /href="\.\.\/freelance-writer-rate-calculator\/"/,
  'index must link ../freelance-writer-rate-calculator/ so crawlers reach the freelance writer rate calculator in one hop',
);

assert.match(
  index,
  /href="\.\.\/fractional-executive-rate-calculator\/"/,
  'index must link ../fractional-executive-rate-calculator/ so crawlers reach the fractional executive rate calculator in one hop',
);
assert.match(
  index,
  /href="\.\.\/freelance-editor-quote-calculator\/"/,
  'index must link ../freelance-editor-quote-calculator/ so crawlers reach it in one hop',
);

console.log('freelance retainer page tests passed');
