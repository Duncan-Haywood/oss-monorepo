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

import { SENSOR_PRESETS, money, priceJob } from './calc.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const guide = readFileSync(join(HERE, 'how-much-to-charge-for-drone-mapping.html'), 'utf8');
const sitemap = readFileSync(join(HERE, 'sitemap.xml'), 'utf8');

function jsonLdBlocks(source) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  return [...source.matchAll(re)].map(([, body]) => body);
}

/** The exact job the page ships with, read back out of the markup below. */
function shippedJob() {
  const preset = SENSOR_PRESETS['mavic-3e'];
  return {
    areaAcres: 100,
    altitudeM: 120,
    sensorWidthMm: preset.sensorWidthMm,
    focalLengthMm: preset.focalLengthMm,
    imageWidthPx: preset.imageWidthPx,
    imageHeightPx: preset.imageHeightPx,
    frontOverlapPct: 75,
    sideOverlapPct: 70,
    speedMs: 10,
    usableBatteryMin: 25,
    batteryCount: 4,
    turnSeconds: 8,
    setupMinutes: 30,
    swapMinutes: 4,
    gcpCount: 5,
    gcpMinutesEach: 6,
    travelMinutes: 60,
    travelMiles: 45,
    mileageRate: 0.7,
    fieldHourlyRate: 125,
    processingHourlyRate: 95,
    secondsPerImage: 9,
    targetMarginPct: 40,
  };
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
  assert.match(html, /href="\.\/how-much-to-charge-for-drone-mapping\.html"/);
  assert.match(guide, /href="index\.html"/);
  assert.match(sitemap, /drone-mapping-job-calculator\/<\/loc>/);
  assert.match(sitemap, /how-much-to-charge-for-drone-mapping\.html/);
});

// ---------------------------------------------------------------------------
// The prose has to keep agreeing with the arithmetic.
// ---------------------------------------------------------------------------

test('every headline figure quoted on the guide is still what calc.mjs computes', () => {
  const job = shippedJob();
  const r = priceJob(job);

  assert.ok(guide.includes('3.20 cm/px'), 'GSD figure drifted');
  assert.equal(r.gsdCmPx.toFixed(2), '3.20');

  assert.ok(guide.includes('169 &times; 127 m') || guide.includes('169 by 127 m'));
  assert.equal(r.footprintWidthM.toFixed(0), '169');
  assert.equal(r.footprintHeightM.toFixed(0), '127');

  assert.equal(r.lines, 13, 'guide says 13 flight lines');
  assert.equal(r.photosPerLine, 22, 'guide says 22 exposures per line');
  assert.equal(r.totalPhotos, 286, 'guide says 286 images');
  assert.ok(guide.includes('286 images'));

  assert.equal(r.flightMinutes.toFixed(1), '16.4');
  assert.ok(guide.includes('16.4'));

  assert.equal(money(r.totalCost), '$383.58');
  assert.ok(guide.includes('$383.58'));
  assert.equal(money(r.price), '$639.31');
  assert.ok(guide.includes('$639.31'));
  assert.equal(money(r.pricePerAcre), '$6.39');
  assert.ok(guide.includes('$6.39'));
});

test('the overlap comparison table on the guide is still the arithmetic it reports', () => {
  const job = shippedJob();
  const at70 = priceJob({ ...job, frontOverlapPct: 70, sideOverlapPct: 70 });
  const at80 = priceJob({ ...job, frontOverlapPct: 80, sideOverlapPct: 80 });

  assert.equal(at70.totalPhotos, 234);
  assert.equal(at80.totalPhotos, 513);
  assert.ok(guide.includes('>234<') && guide.includes('>513<'));

  assert.equal(money(at70.price), '$618.72');
  assert.equal(money(at80.price), '$754.03');
  assert.ok(guide.includes('$618.72') && guide.includes('$754.03'));

  assert.equal(money(at80.price - at70.price), '$135.30');
  assert.ok(guide.includes('$135.30'));
  assert.equal((at80.totalPhotos / at70.totalPhotos).toFixed(2), '2.19');
  assert.ok(guide.includes('2.19'));
});

test('the markup-versus-margin figures on the guide are correct arithmetic', () => {
  const r = priceJob(shippedJob());
  assert.equal(money(r.totalCost * 1.4), '$537.02');
  assert.ok(guide.includes('$537.02'), 'the markup counter-example drifted');
  // The generic illustration alongside it.
  assert.equal(money(1000 / 0.6), '$1,666.67');
  assert.ok(guide.includes('$1,666.67') && guide.includes('$1,400.00'));
});

test('the headline claim on the calculator matches the ratio calc.mjs produces', () => {
  assert.match(html, /2\.25&times; the photographs/, 'the index headline states the theoretical ratio');
  // The formula, with the HTML entities the markup actually uses between terms.
  assert.match(
    html,
    /1(&nbsp;|\s)*\/(&nbsp;|\s)*\(\(1&minus;front\)(&nbsp;|\s)*&times;(&nbsp;|\s)*\(1&minus;side\)\)/,
    'and states the formula it comes from',
  );
});

// ---------------------------------------------------------------------------
// Every numeric input must be bounded exactly as calc.mjs bounds it, or a
// visitor gets a thrown message with nothing highlighted. platform/ci
// enforces this from the other direction; this is the venture's own copy.
// ---------------------------------------------------------------------------

test('every number input declares min, max and step', () => {
  const inputs = [...html.matchAll(/<input type="number"[^>]*>/g)].map(([tag]) => tag);
  assert.ok(inputs.length >= 20, `expected the full form, found ${inputs.length} number inputs`);
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

test('the overlap inputs stop below 100%, which is where spacing would go to zero', () => {
  for (const id of ['frontOverlapPct', 'sideOverlapPct']) {
    const tag = new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(html)[0];
    assert.equal(/\bmax="([^"]+)"/.exec(tag)[1], '95', `${id} must cap where calc.mjs caps it`);
  }
});

test('the margin input stops below 100%, which is where price would be infinite', () => {
  const tag = /<input[^>]*id="targetMarginPct"[^>]*>/.exec(html)[0];
  assert.equal(/\bmax="([^"]+)"/.exec(tag)[1], '95');
});

// ---------------------------------------------------------------------------
// Wiring, privacy and the clauses the playbook requires.
// ---------------------------------------------------------------------------

test('the page imports its own arithmetic rather than restating it', () => {
  assert.match(html, /from '\.\/calc\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
  // No second copy of the formula in the markup.
  assert.doesNotMatch(html, /sensorWidthMm \* .* \* 100/);
});

test('the page makes no network request of any kind', () => {
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|navigator\.sendBeacon|<script src="http/);
  assert.doesNotMatch(guide, /fetch\(|XMLHttpRequest|navigator\.sendBeacon|<script src=/);
});

test('the usage counter is opt-out from the page and never records a figure', () => {
  assert.match(html, /id="optout"/);
  assert.match(html, /recordUsage\(globalThis\.localStorage, \$\('optout'\)\.checked/);
  assert.match(html, /Do&nbsp;Not&nbsp;Track/);
});

test('both pages carry the no-warranty clause the playbook requires', () => {
  for (const [name, source] of [['index', html], ['guide', guide]]) {
    assert.match(source, /No warranty/, `${name}`);
    assert.match(source, /without warranty of any kind/, `${name}`);
    assert.match(source, /responsible for reviewing and verifying its output/, `${name}`);
  }
});

test('both pages say plainly that this is not a flight plan or an authorisation', () => {
  for (const [name, source] of [['index', html], ['guide', guide]]) {
    assert.match(source, /not a flight plan/i, `${name}`);
    assert.match(source, /grants no airspace authorisation/i, `${name}`);
    assert.match(source, /Part 107/, `${name}`);
  }
});

test('the square-site assumption is disclosed on both pages rather than buried', () => {
  assert.match(html, /square/i);
  assert.match(guide, /least perimeter|least-perimeter/i);
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

test('every sensor preset offered in the markup exists in calc.mjs', () => {
  const options = [...html.matchAll(/<option value="([^"]+)"/g)].map(([, v]) => v);
  for (const value of options) {
    if (value === 'custom') continue;
    assert.ok(SENSOR_PRESETS[value], `markup offers a preset calc.mjs does not define: ${value}`);
  }
  // And the default sensor fields match the default preset, or the page opens
  // showing one camera's name above another camera's geometry.
  const preset = SENSOR_PRESETS['mavic-3e'];
  assert.match(html, new RegExp(`id="sensorWidthMm" value="${preset.sensorWidthMm}"`));
  assert.match(html, new RegExp(`id="focalLengthMm" value="${preset.focalLengthMm}"`));
  assert.match(html, new RegExp(`id="imageWidthPx" value="${preset.imageWidthPx}"`));
  assert.match(html, new RegExp(`id="imageHeightPx" value="${preset.imageHeightPx}"`));
});

// The reciprocal of the assertion in
// ventures/commercial-photo-license-calculator/test/page.test.mjs. Pricing the
// flight and licensing what it captures are two halves of one quote for an
// aerial photographer, and the pair is what keeps either page off the
// crawlable-orphan list — see platform/pages/siblings-budget.json.
test('the calculator links one hop to its commercial-photo-license sibling', () => {
  assert.match(
    html,
    /href="\.\.\/commercial-photo-license-calculator\/"/,
    'index must link ../commercial-photo-license-calculator/ so crawlers reach it in one hop',
  );
});
