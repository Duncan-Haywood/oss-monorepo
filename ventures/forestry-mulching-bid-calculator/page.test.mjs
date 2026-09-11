// What the unit tests on calc.mjs cannot see: whether the page actually wires
// that arithmetic to a visitor, whether the numbers printed in the prose still
// match the arithmetic that produced them, and whether the clauses this
// portfolio requires on every published surface are present.
//
// The prose checks are the ones that earn their place. A worked example baked
// into a paragraph is a copy of a computation, and a copy goes stale silently
// -- so each figure quoted on the guide page is recomputed here from calc.mjs
// and asserted to still be the number the page claims.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

import { DENSITY_CLASSES, compareDensities, money, priceJob } from './calc.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const guide = readFileSync(join(HERE, 'how-much-to-charge-for-forestry-mulching.html'), 'utf8');
const sitemap = readFileSync(join(HERE, 'sitemap.xml'), 'utf8');

function jsonLdBlocks(source) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  return [...source.matchAll(re)].map(([, body]) => body);
}

/**
 * The exact job the page ships with, read back out of the markup rather than
 * retyped -- so a shipped default that drifts from the prose fails here rather
 * than going quietly wrong on the published page.
 */
function shippedJob() {
  const values = {};
  for (const [tag] of html.matchAll(/<input type="number"[^>]*>/g)) {
    const id = /\bid="([^"]+)"/.exec(tag)?.[1];
    const value = /\bvalue="([^"]+)"/.exec(tag)?.[1];
    if (id && value !== undefined) values[id] = Number(value);
  }
  return values;
}

// ---------------------------------------------------------------------------
// Structure and discoverability.
// ---------------------------------------------------------------------------

test('both pages are structured for a reader and a crawler', () => {
  for (const [name, source] of [['index', html], ['guide', guide]]) {
    assert.match(source, /<html lang="en">/, `${name}: missing lang`);
    assert.match(source, /<meta name="viewport"/, `${name}: missing viewport`);
    assert.match(source, /<link rel="canonical"/, `${name}: missing canonical`);
    assert.match(source, /<meta name="description" content="[^"]{80,}"/, `${name}: thin description`);
    assert.equal((source.match(/<h1[ >]/g) || []).length, 1, `${name}: needs exactly one h1`);
  }
});

test('all structured data on both pages is valid JSON', () => {
  for (const [name, source] of [['index', html], ['guide', guide]]) {
    const blocks = jsonLdBlocks(source);
    assert.ok(blocks.length > 0, `${name}: no structured data`);
    for (const block of blocks) {
      assert.doesNotThrow(() => JSON.parse(block), `${name}: malformed JSON-LD`);
    }
  }
});

test('every FAQ answer in the JSON-LD is also visible, verbatim, as page copy', () => {
  const faq = jsonLdBlocks(html).map((b) => JSON.parse(b)).find((b) => b['@type'] === 'FAQPage');
  assert.ok(faq, 'no FAQPage schema on the calculator');
  assert.ok(faq.mainEntity.length >= 6);
  for (const question of faq.mainEntity) {
    assert.ok(
      html.includes(`<h3>${question.name}</h3>`),
      `FAQ question has no matching <h3>: ${question.name}`,
    );
    assert.ok(
      html.includes(question.acceptedAnswer.text),
      `FAQ answer not found verbatim on the page: ${question.acceptedAnswer.text.slice(0, 60)}...`,
    );
  }
});

test('the guide carries HowTo structured data with a step per stage of the quote', () => {
  const howTo = jsonLdBlocks(guide).map((b) => JSON.parse(b)).find((b) => b['@type'] === 'HowTo');
  assert.ok(howTo, 'missing HowTo JSON-LD on the guide');
  assert.ok(howTo.step.length >= 6, 'the guide walks six stages; the schema must not drift below them');
});

test('the two pages link to each other and both are in the sitemap', () => {
  assert.match(html, /href="\.\/how-much-to-charge-for-forestry-mulching\.html"/);
  assert.match(guide, /href="index\.html"/);
  assert.match(sitemap, /forestry-mulching-bid-calculator\/<\/loc>/);
  assert.match(sitemap, /how-much-to-charge-for-forestry-mulching\.html/);
});

// ---------------------------------------------------------------------------
// The prose has to keep agreeing with the arithmetic.
// ---------------------------------------------------------------------------

test('the shipped defaults are the medium-brush class, not a fourth set of numbers', () => {
  const job = shippedJob();
  assert.equal(job.advanceFtPerMin, DENSITY_CLASSES['medium-brush'].advanceFtPerMin);
  assert.equal(job.passes, DENSITY_CLASSES['medium-brush'].passes);
  assert.match(html, /<option value="medium-brush" selected>/);
});

test('every headline figure quoted on the guide is still what calc.mjs computes', () => {
  const job = shippedJob();
  const r = priceJob(job);

  assert.equal(r.acresPerHour.toFixed(3), '0.236');
  assert.ok(guide.includes('0.236 acres an hour'), 'the production rate drifted');

  assert.equal(r.machineHours.toFixed(1), '12.7');
  assert.ok(guide.includes('12.7 machine hours'));
  assert.equal(r.daysOnSite.toFixed(1), '1.6');
  assert.ok(guide.includes('1.6 days on site'));

  assert.equal(money(r.ratePerHour.operator), '$45.00');
  assert.equal(money(r.ratePerHour.fuel), '$19.50');
  assert.equal(money(r.ratePerHour.teeth), '$7.20');
  assert.equal(money(r.ratePerHour.maintenance), '$12.00');
  assert.equal(money(r.ratePerHour.ownership), '$40.00');
  assert.equal(money(r.ratePerHour.total), '$123.70');
  for (const figure of ['$45.00', '$19.50', '$7.20', '$12.00', '$40.00', '$123.70']) {
    assert.ok(guide.includes(figure), `hourly cost line missing from the guide: ${figure}`);
  }
  // The claim about the two lines a hand-written quote leaves out.
  assert.equal(money(r.ratePerHour.teeth + r.ratePerHour.ownership), '$47.20');
  assert.ok(guide.includes('$47.20'));

  assert.equal(money(r.mobilizationLabor), '$112.50');
  assert.equal(money(r.mobilizationTravel), '$94.50');
  assert.equal(money(r.mobilizationCost), '$207.00');
  for (const figure of ['$112.50', '$94.50', '$207.00']) {
    assert.ok(guide.includes(figure), `mobilization line missing from the guide: ${figure}`);
  }

  assert.equal(money(r.machineCost), '$1,572.24');
  assert.equal(money(r.totalCost), '$1,779.24');
  assert.equal(money(r.price), '$2,737.29');
  assert.equal(money(r.pricePerAcre), '$912.43');
  assert.equal(money(r.breakEvenPerAcre), '$593.08');
  assert.equal(money(r.profit), '$958.05');
  for (const figure of ['$1,572.24', '$1,779.24', '$2,737.29', '$912.43', '$593.08', '$958.05']) {
    assert.ok(guide.includes(figure), `quote figure missing from the guide: ${figure}`);
  }
});

test('the density comparison table on the guide is still the arithmetic it reports', () => {
  const job = shippedJob();
  const rows = compareDensities(job, job.quotedPerAcre);
  assert.equal(job.quotedPerAcre, 1000, 'the guide is written against a $1,000/acre quote');

  const expected = [
    ['0.506', '5.9', '$940.71', '$313.57', '$2,059.29'],
    ['0.236', '12.7', '$1,779.24', '$593.08', '$1,220.76'],
    ['0.112', '26.7', '$3,508.70', '$1,169.57', '-$508.70'],
    ['0.056', '53.4', '$6,810.40', '$2,270.13', '-$3,810.40'],
  ];
  rows.forEach((row, index) => {
    const [rate, hours, cost, breakEven, profit] = expected[index];
    assert.equal(row.acresPerHour.toFixed(3), rate, `${row.id} rate`);
    assert.equal(row.machineHours.toFixed(1), hours, `${row.id} hours`);
    assert.equal(money(row.totalCost), cost, `${row.id} cost`);
    assert.equal(money(row.breakEvenPerAcre), breakEven, `${row.id} break-even`);
    assert.equal(money(row.profit), profit, `${row.id} profit`);
    for (const figure of [rate, cost, breakEven, profit]) {
      assert.ok(guide.includes(figure), `comparison figure missing from the guide: ${figure}`);
    }
  });
});

test('the headline spread claimed on both pages is the spread calc.mjs produces', () => {
  const job = shippedJob();
  const rows = compareDensities(job, job.quotedPerAcre);
  const best = rows.reduce((a, b) => (b.profit > a.profit ? b : a));
  const worst = rows.reduce((a, b) => (b.profit < a.profit ? b : a));

  assert.equal(money(best.profit), '$2,059.29');
  assert.equal(money(worst.profit), '-$3,810.40');
  assert.equal(money(best.profit - worst.profit), '$5,869.69');
  for (const source of [html, guide]) {
    assert.ok(source.includes('$2,059.29'));
    assert.ok(source.includes('$3,810.40'));
    assert.ok(source.includes('$5,869.69'));
  }

  // And the "nine times the machine time" claim both pages make.
  assert.equal((worst.machineHours / best.machineHours).toFixed(0), '9');
  assert.ok(guide.includes('nine times the machine time'));
});

test('the markup-versus-margin figures are correct arithmetic on both pages', () => {
  const r = priceJob(shippedJob());
  assert.equal(money(r.totalCost * 1.35), '$2,401.97');
  assert.equal(money(r.price - r.totalCost * 1.35), '$335.32');
  const markupMargin = ((r.totalCost * 1.35 - r.totalCost) / (r.totalCost * 1.35)) * 100;
  assert.equal(markupMargin.toFixed(1), '25.9');
  for (const source of [html, guide]) {
    assert.ok(source.includes('$2,401.97'), 'the markup counter-example drifted');
    assert.ok(source.includes('$335.32'));
    assert.ok(source.includes('25.9% margin'));
  }
});

test('the mobilization-by-lot-size table on the guide is still correct', () => {
  const job = shippedJob();
  const cases = [
    [0.5, '$721.60', '$1,443.20', '29%'],
    [3, '$2,737.29', '$912.43', '8%'],
    [10, '$8,381.22', '$838.12', '2%'],
  ];
  for (const [acres, price, perAcre, share] of cases) {
    const r = priceJob({ ...job, acres });
    assert.equal(money(r.price), price, `${acres} acres price`);
    assert.equal(money(r.pricePerAcre), perAcre, `${acres} acres per-acre`);
    assert.equal(`${(r.mobilizationShareOfPrice * 100).toFixed(0)}%`, share, `${acres} acres share`);
    for (const figure of [price, perAcre]) {
      assert.ok(guide.includes(figure), `lot-size figure missing from the guide: ${figure}`);
    }
  }
});

test('the utilisation counter-example on the guide is still correct', () => {
  const job = shippedJob();
  const busy = priceJob({ ...job, billableHoursPerMonth: 160 });
  assert.equal(money(busy.ratePerHour.ownership), '$17.50');
  assert.equal(money(busy.ratePerHour.total), '$101.20');
  assert.equal(money(busy.price), '$2,297.32');
  const r = priceJob(job);
  assert.equal(((r.ratePerHour.ownership / r.ratePerHour.total) * 100).toFixed(1), '32.3');
  for (const figure of ['$17.50', '$101.20', '$2,297.32', '32.3%']) {
    assert.ok(guide.includes(figure), `utilisation figure missing from the guide: ${figure}`);
  }
});

// ---------------------------------------------------------------------------
// Every numeric input must be bounded exactly as calc.mjs bounds it, or a
// visitor gets a thrown message with nothing highlighted. platform/ci
// enforces this from the other direction; this is the venture's own copy.
// ---------------------------------------------------------------------------

test('every number input declares min, max and step', () => {
  const inputs = [...html.matchAll(/<input type="number"[^>]*>/g)].map(([tag]) => tag);
  assert.ok(inputs.length >= 24, `expected the full form, found ${inputs.length} number inputs`);
  for (const tag of inputs) {
    assert.match(tag, /\bmin="/, `input without min: ${tag}`);
    assert.match(tag, /\bmax="/, `input without max: ${tag}`);
    assert.match(tag, /\bstep="/, `input without step: ${tag}`);
    assert.match(tag, /\bvalue="/, `input without a shipped example value: ${tag}`);
  }
});

test("each input's shipped value sits on its own step grid, so the form can be submitted", () => {
  // min is also the step base: a value is valid when it differs from min by a
  // whole number of steps. This is the rule that silently broke two shipped
  // products before platform/ci/check_form_defaults.py existed.
  for (const [tag] of html.matchAll(/<input type="number"[^>]*>/g)) {
    const min = Number(/\bmin="([^"]+)"/.exec(tag)[1]);
    const step = Number(/\bstep="([^"]+)"/.exec(tag)[1]);
    const max = Number(/\bmax="([^"]+)"/.exec(tag)[1]);
    const value = Number(/\bvalue="([^"]+)"/.exec(tag)[1]);
    assert.ok(value >= min && value <= max, `value out of range: ${tag}`);
    const steps = (value - min) / step;
    assert.ok(
      Math.abs(steps - Math.round(steps)) < 1e-6,
      `shipped value is off the step grid, so the browser will refuse submit: ${tag}`,
    );
  }
});

test("each input's step grid contains a whole number, so ordinary typing is accepted", () => {
  for (const [tag] of html.matchAll(/<input type="number"[^>]*>/g)) {
    const min = Number(/\bmin="([^"]+)"/.exec(tag)[1]);
    const step = Number(/\bstep="([^"]+)"/.exec(tag)[1]);
    const max = Number(/\bmax="([^"]+)"/.exec(tag)[1]);
    let found = false;
    for (let n = Math.ceil(min); n <= Math.min(max, Math.ceil(min) + 100); n += 1) {
      const steps = (n - min) / step;
      if (Math.abs(steps - Math.round(steps)) < 1e-9) {
        found = true;
        break;
      }
    }
    assert.ok(found, `no whole number is valid on this input's grid: ${tag}`);
  }
});

test('the margin input stops below 100%, which is where price would be infinite', () => {
  const tag = /<input[^>]*id="targetMarginPct"[^>]*>/.exec(html)[0];
  assert.equal(/\bmax="([^"]+)"/.exec(tag)[1], '95');
});

test('the rate-shaping inputs cannot be set to values calc.mjs refuses', () => {
  // Where a bound exists in both places it has to agree, or the browser lets a
  // value through that the arithmetic then throws on -- a thrown message with
  // no highlighted field, which is the failure the highlighter exists to stop.
  const bounds = {
    acres: ['0.05', '5000'],
    headWidthFt: ['1', '20'],
    advanceFtPerMin: ['1', '400'],
    passes: ['1', '6'],
    cuttingEfficiencyPct: ['5', '100'],
    terrainFactorPct: ['10', '100'],
    workHoursPerDay: ['1', '24'],
    billableHoursPerMonth: ['1', '730'],
    toothSetLifeHours: ['1', '5000'],
  };
  for (const [id, [min, max]] of Object.entries(bounds)) {
    const tag = new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(html)[0];
    assert.equal(/\bmin="([^"]+)"/.exec(tag)[1], min, `${id} min`);
    assert.equal(/\bmax="([^"]+)"/.exec(tag)[1], max, `${id} max`);
  }
});

// ---------------------------------------------------------------------------
// Wiring, privacy and the clauses the playbook requires.
// ---------------------------------------------------------------------------

test('the page imports its own arithmetic rather than restating it', () => {
  assert.match(html, /from '\.\/calc\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
  // No second copy of the production-rate formula in the markup.
  assert.doesNotMatch(html, /43560|43,560/);
});

test('every density offered in the markup exists in calc.mjs', () => {
  const options = [...html.matchAll(/<option value="([^"]+)"/g)].map(([, v]) => v);
  assert.ok(options.length >= 5, 'the density select lost its options');
  for (const value of options) {
    if (value === 'custom') continue;
    assert.ok(DENSITY_CLASSES[value], `markup offers a density calc.mjs does not define: ${value}`);
  }
  // And each option's visible text is the label calc.mjs carries, or the page
  // names one thing while the select writes another one's numbers.
  for (const [id, density] of Object.entries(DENSITY_CLASSES)) {
    assert.ok(
      html.includes(`>${density.label}</option>`),
      `option text drifted from calc.mjs for ${id}: ${density.label}`,
    );
  }
});

// Caught a live defect rather than guarding a hypothetical one. The page was
// first written with `const $ = (id) => document.getElementById(id)` and
// renamed to `el` when it adopted platform/proposal, which spells the helper
// `el` and generates calls to it. Four `$(id)` call sites survived the rename,
// so every path through the form threw `$ is not defined` -- and the page's own
// try/catch turned that into a tidy message in the result panel, which is why
// nothing in 1,238 static assertions or in six of the seven browser checks
// noticed. Only platform/proposal/verify.mjs, which clicks print and waits for
// a document, went red.
test('every element lookup goes through the one el() helper', () => {
  const script = /<script type="module">([\s\S]*)<\/script>/.exec(html)[1];
  assert.doesNotMatch(script, /\$\(/, 'a call to the old $() accessor survived');
  assert.equal(
    (script.match(/document\.getElementById\(/g) || []).length,
    1,
    'exactly one definition of the accessor, and nothing else reaching past it',
  );
});

test('the page makes no network request of any kind', () => {
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|navigator\.sendBeacon|<script src="http/);
  assert.doesNotMatch(guide, /fetch\(|XMLHttpRequest|navigator\.sendBeacon|<script src=/);
});

test('the usage counter is opt-out from the page and never records a figure', () => {
  assert.match(html, /id="optout"/);
  // One counting path, `count()`, reading the checkbox every call rather than
  // capturing it once -- so unticking it mid-session stops the next tally.
  // The name is also what platform/proposal/adopt.mjs generates a call to.
  assert.match(
    html,
    /function count\(event\) \{ recordUsage\(globalThis\.localStorage, el\('optout'\)\.checked, event\); \}/,
  );
  assert.equal((html.match(/recordUsage\(/g) || []).length, 1, 'a second counting path appeared');
  assert.match(html, /Do&nbsp;Not&nbsp;Track/);
});

test('both pages carry the no-warranty clause the playbook requires', () => {
  for (const [name, source] of [['index', html], ['guide', guide]]) {
    assert.match(source, /No warranty/, `${name}`);
    assert.match(source, /without warranty of any kind/, `${name}`);
    assert.match(source, /responsible for reviewing and verifying its output/, `${name}`);
    assert.match(source, /not forestry, engineering, environmental, legal, tax or financial advice/, `${name}`);
  }
});

test('both pages say plainly that permits and site conditions are not in the tool', () => {
  for (const [name, source] of [['index', html], ['guide', guide]]) {
    assert.match(source, /permits/i, `${name}`);
    assert.match(source, /erosion control/i, `${name}`);
    assert.match(source, /protected species/i, `${name}`);
  }
});

test('the density presets are disclosed as starting points rather than survey data', () => {
  assert.match(html, /starting points/i);
  assert.match(guide, /not survey data/i);
});

test('both pages keep the MIT licence and the optional sponsor link', () => {
  for (const [name, source] of [['index', html], ['guide', guide]]) {
    assert.match(source, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/, `${name}`);
    assert.match(source, /href="LICENSE"/, `${name}`);
    assert.match(source, /MIT licen[cs]e/, `${name}`);
    assert.match(source, /entirely\s+optional and never changes what the tool does/, `${name}`);
  }
});

test('the page never renders money with the sign inside the symbol', () => {
  // The vendored money() is tested in calc.test.mjs; this catches a hand-rolled
  // second copy appearing in the markup later.
  assert.doesNotMatch(html, /\$-/);
  assert.doesNotMatch(guide, /\$-/);
});

// The reciprocal of the assertion in
// ventures/tree-service-bid-calculator/page.test.mjs. A lot being cleared has
// two kinds of material on it -- understory a mulching head eats, and standing
// stems it is not rated for -- and an operator quoting one is regularly asked
// about the other. The pair is what keeps either page off the
// crawlable-orphan list; see platform/pages/siblings-budget.json.
test('the calculator links one hop to its tree-service sibling', () => {
  assert.match(
    html,
    /href="\.\.\/tree-service-bid-calculator\/"/,
    'index must link ../tree-service-bid-calculator/ so crawlers reach it in one hop',
  );
});

// platform/pages/invalid.mjs injects the real highlighter into any page that
// prints this sentence verbatim, and skips any page that does not. Spelling it
// differently means the page promises a highlight, no injection happens, and
// nothing is marked -- which is precisely the defect that module was written to
// remove from 103 tools. Asserted literally, because a near-miss is silent.
test('the page prints the family promise sentence exactly, so the highlighter is injected', () => {
  assert.ok(
    html.includes('check the highlighted input'),
    'the error label must be the literal string platform/pages/invalid.mjs looks for',
  );
});

test('every message calc.mjs can throw names a field label the page actually renders', () => {
  // The injected highlighter matches the thrown message against the page's own
  // labels. A bound whose label text drifted from its <label> would leave the
  // message unmatchable and the promise unkept.
  const labels = [...html.matchAll(/<label>([^<]+)</g)].map(([, t]) => t.trim());
  for (const name of [
    'Acres to clear',
    'Mulching head width',
    'Advance speed',
    'Passes over the ground',
    'Share of the hour cutting',
    'Terrain factor',
    'Machine hours a day',
    'Operator cost',
    'Fuel burn',
    'Fuel price',
    'Cost of a set of teeth',
    'Hours a set of teeth lasts',
    'Service and repair reserve',
    'Machine payment',
    'Insurance',
    'Billable hours a month',
    'Mobilization trips',
    'Hours per mobilization',
    'Miles per mobilization',
    'Truck and trailer cost',
    'Other job costs',
    'Target margin',
    'Quoted price per acre',
  ]) {
    assert.ok(
      labels.some((l) => l.startsWith(name)),
      `calc.mjs throws about "${name}" but no <label> on the page starts with it`,
    );
  }
});

test('index links the Aspire incumbent-comparison page and the sitemap lists it too', () => {
  const sitemap = readFileSync(join(HERE, 'sitemap.xml'), 'utf8');
  assert.match(html, /vs-aspire\.html/);
  assert.match(sitemap, /vs-aspire\.html/);
});

test('the Aspire comparison page links back, names the incumbent honestly, and states no unverifiable price', () => {
  const vsAspire = readFileSync(join(HERE, 'vs-aspire.html'), 'utf8');
  assert.match(vsAspire, /<a href="index\.html">/);
  assert.match(vsAspire, /not affiliated with, endorsed by, or sponsored by Aspire Software or ServiceTitan, Inc\./);
  // Aspire's own pricing page is not reachable from this session (see the
  // other vs-aspire.html pages in this repo for the same discipline), so no
  // dollar figure for it may appear on the page.
  assert.doesNotMatch(vsAspire, /\$\d/);
  assert.match(vsAspire, /No warranty/);
  assert.match(vsAspire, /Best-effort hosting, no SLA/);
  assert.match(vsAspire, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('the Aspire comparison page FAQPage JSON-LD matches the visible copy verbatim', () => {
  const vsAspire = readFileSync(join(HERE, 'vs-aspire.html'), 'utf8');
  const match = vsAspire.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found on vs-aspire.html');
  const schema = JSON.parse(match[1]);
  assert.ok(schema.mainEntity.length > 0);
  for (const { name, acceptedAnswer } of schema.mainEntity) {
    assert.ok(vsAspire.includes(`<h3>${name}</h3>`), `FAQ question "${name}" has no matching <h3>`);
    assert.ok(vsAspire.includes(acceptedAnswer.text), `answer not found verbatim: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});
