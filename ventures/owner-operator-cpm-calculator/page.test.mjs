// Structural tests for the calculator page. calc.test.mjs never looks at the
// HTML, so it stays green when the page advertises a figure it does not
// render, or when a required control is renamed and the script silently
// stops updating.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const article = readFileSync(new URL('./deadhead-miles.html', import.meta.url), 'utf8');
const detention = readFileSync(new URL('./does-detention-pay-cover-the-wait.html', import.meta.url), 'utf8');
const vsAtbs = readFileSync(new URL('./vs-atbs.html', import.meta.url), 'utf8');
const vsDatRateview = readFileSync(new URL('./vs-dat-rateview.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

function parse(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = '';
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) return { markup: markup + rest, scripts, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, 'i').exec(rest.slice(contentStart));
    if (!closer) return { markup, scripts, unclosed: tag };
    if (tag === 'script') scripts.push(rest.slice(contentStart, contentStart + closer.index));
    markup += closer[0];
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

const { markup, scripts, unclosed } = parse(html);
const scriptSource = scripts.join('\n');

test('every raw-text element is closed', () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test('required inputs and result sinks exist in the markup', () => {
  const requiredIds = [
    'loadedMiles', 'emptyMiles', 'mpg', 'dieselPrice',
    'truckPayment', 'insurance', 'permits', 'otherFixed',
    'maintenancePerMile', 'tiresPerMile', 'otherVariablePerMile',
    'factoringRate', 'offeredLoadedRate', 'targetWeeklyTakeHome',
    'hero', 'heroLabel', 'allInCpm',
    'deadheadShare', 'weeklyCost', 'loadedMilesToBreakEven', 'verdict', 'copySummary', 'usageOptOut',
    'detentionHours', 'detentionPayPerHour', 'layoverPay', 'lumperPaid', 'lumperReimbursed',
    'factorAccessorials', 'accessorialTable', 'milesOnlyProfit', 'withAccessorialsProfit',
    'accessorialDelta', 'detentionHoursToCover',
  ];
  for (const id of requiredIds) {
    assert.match(markup, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test('the page script reads every input the calculator accepts', () => {
  const fields = [
    'loadedMiles', 'emptyMiles', 'mpg', 'dieselPrice',
    'truckPayment', 'insurance', 'permits', 'otherFixed',
    'maintenancePerMile', 'tiresPerMile', 'otherVariablePerMile',
    'factoringRate', 'offeredLoadedRate', 'targetWeeklyTakeHome',
    'detentionHours', 'detentionPayPerHour', 'layoverPay', 'lumperPaid', 'lumperReimbursed',
  ];
  for (const field of fields) {
    assert.match(scriptSource, new RegExp(`'${field}'`), `script no longer lists ${field}`);
  }
  assert.match(scriptSource, /calculateWeek\(/);
  assert.match(scriptSource, /result\.breakEvenLoadedRate/);
  assert.match(scriptSource, /result\.allInCpm/);
  assert.match(scriptSource, /result\.offered/);
  assert.match(scriptSource, /result\.rateForTarget/);
  assert.match(scriptSource, /result\.loadedMilesToBreakEven/);
});

test('figures named in schema.org featureList are actually rendered', () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, 'no schema.org featureList found');
  const claims = [
    ['All-in cost per mile', /result\.allInCpm/],
    ['break-even loaded rate', /result\.breakEvenLoadedRate/],
    ['factoring', /result\.offered\.effectiveLoadedRate/],
    ['weekly and annual profit', /result\.offered\.weeklyProfit/],
    ['target take-home', /result\.rateForTarget/],
    ['copyable load summary', /copySummary/],
    ['detention layover and lumper comparison', /compareAccessorials/],
  ];
  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"`,
    );
    assert.match(scriptSource, rendered, `featureList advertises "${claim}" but the page never uses ${rendered}`);
  }
});

test('null per-mile figures are rendered as a placeholder, not formatted', () => {
  assert.match(scriptSource, /value === null \? 'n\/a'/);
  assert.match(scriptSource, /result\.rateForTarget === null/);
  assert.match(scriptSource, /result\.breakEvenLoadedRate === null/);
});

test('the page carries a visible disclaimer and an off-switchable usage counter', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /not legal, tax, financial, or business advice/i);
  assert.match(markup, /usageOptOut/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('the deadhead explainer exists and points back at the calculator', () => {
  assert.match(markup, /deadhead-miles\.html/);
  assert.match(article, /href="\.\/"/);
  assert.match(article, /No warranty/);
  assert.match(article, /1,800 loaded miles and 450 empty miles/);
});

test('the detention explainer uses the same locked week as the calculator', () => {
  assert.match(markup, /does-detention-pay-cover-the-wait\.html/);
  assert.match(detention, /href="\.\/"/);
  assert.match(detention, /No warranty/);
  assert.match(detention, /loses \$32\.96/);
  assert.match(detention, /keeps \$183\.04/);
  assert.match(detention, /0\.68 hours/);
  assert.match(scriptSource, /accessorials_compared/);
});

test('index links the ATBS incumbent-comparison page and the sitemap lists it too', () => {
  assert.match(markup, /vs-atbs\.html/);
  assert.match(sitemap, /vs-atbs\.html/);
});

test('the ATBS incumbent-comparison page links back, names the incumbent honestly, and cites a checkable source instead of a number only ATBS could confirm', () => {
  assert.match(vsAtbs, /<a href="\.\/">/);
  // Names ATBS's own pricing page so a reader can check the source directly
  // -- this page must never state a dollar figure for ATBS's service that
  // only ATBS's own current pricing page could confirm.
  assert.match(vsAtbs, /atbs\.com\/pricing/);
  // Blanket, not scoped to a sentence or a month/year suffix: this page has
  // no legitimate reason to print a dollar figure at all, so the earlier,
  // narrower regexes here missed a plain "$20/week" (they only matched a
  // dollar immediately followed by month/year, or one in the same sentence
  // as the literal string "ATBS"). Same pattern cloud-egress-calculator's
  // own comparison-page test already uses.
  assert.doesNotMatch(vsAtbs, /\$\d/);
  assert.match(vsAtbs, /not affiliated with, endorsed by, or sponsored by ATBS/i);
  assert.match(vsAtbs, /No warranty/);
  assert.match(vsAtbs, /Best-effort hosting, no SLA/);
  assert.match(vsAtbs, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('index links the DAT RateView comparison page and the sitemap lists it too', () => {
  assert.match(markup, /vs-dat-rateview\.html/);
  assert.match(sitemap, /vs-dat-rateview\.html/);
});

test('the DAT RateView comparison page links back, names the incumbent honestly, and cites a checkable source', () => {
  assert.match(vsDatRateview, /<a href="\.\/">/);
  // Names DAT's own RateView page so a reader can check the source directly.
  assert.match(vsDatRateview, /dat\.com\/rateview/);
  // This page has no legitimate reason to state a dollar figure for a
  // market rate or a DAT subscription price -- only DAT's own current data
  // and pricing could confirm either.
  assert.doesNotMatch(vsDatRateview, /\$\d/);
  assert.match(vsDatRateview, /not affiliated with, endorsed by, or sponsored by DAT/i);
  assert.match(vsDatRateview, /No warranty/);
  assert.match(vsDatRateview, /Best-effort hosting, no SLA/);
  assert.match(vsDatRateview, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('the tax reserve is wired end to end and disclaims what it is not', () => {
  // Every one of these is a place the field has to appear for the reserve to
  // work: the input, the read loop, the two output rows, and the clear path
  // that blanks them on an invalid input. Missing the last one leaves a stale
  // take-home on screen next to an error message.
  assert.match(markup, /id="taxReservePercent"/);
  assert.match(scriptSource, /'taxReservePercent'/);
  assert.match(markup, /id="taxReserve"/);
  assert.match(markup, /id="weeklyTakeHome"/);
  assert.match(scriptSource, /'taxReserve', 'weeklyTakeHome'/);

  // The page must not appear to know the operator's rate. It asks for a
  // percentage and says whose job it is to supply it.
  assert.match(markup, /Nothing withholds tax for you/);
  assert.match(markup, /Ask your tax preparer/i);
});

test('the reserve input defaults to zero so the page opens on its old behaviour', () => {
  // A non-zero default would be a claim about what the operator owes, and it
  // would silently change every figure for a returning visitor.
  assert.match(markup, /id="taxReservePercent"[^>]*value="0"/);
});

test('"you keep" in the verdict means take-home once a reserve is set', () => {
  // The bug this feature fixes was a pre-tax number labelled as kept money.
  // Reintroducing it in the verdict line would undo the fix in the one place
  // the operator actually reads.
  assert.match(scriptSource, /weeklyTakeHome\)\}<\/strong> this week after setting aside/);
});
