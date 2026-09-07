import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guideHtml = readFileSync(new URL('./how-much-should-a-locksmith-charge-for-a-service-call.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports calculateQuote, dailyIncomeGap, and DEFAULTS from calc.mjs', () => {
  assert.match(html, /import \{ calculateQuote, dailyIncomeGap, DEFAULTS \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for both the quote and the daily-goal calculators', () => {
  assert.match(html, /recordEvent\('call-priced'\)/);
  assert.match(html, /recordEvent\('daily-goal-check'\)/);
  assert.match(html, /<code>call-priced<\/code>, <code>daily-goal-check<\/code>/);
});

test('the default call inputs match calc.mjs DEFAULTS and produce a positive price', () => {
  const result = calculateQuote(DEFAULTS);
  assert.match(html, new RegExp(`id="laborMinutes" type="number" min="0" step="1" value="${DEFAULTS.laborMinutes}"`));
  assert.ok(result.finalPrice > 0);
});

test('the emergency-call checkbox is present and unchecked by default', () => {
  assert.match(html, /id="emergencyCall" type="checkbox"/);
  assert.doesNotMatch(html, /id="emergencyCall" type="checkbox" checked/);
});

test('the no-warranty disclaimer is on the page', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not legal, licensing, or business advice/);
});

test('the page carries the standard sponsor link and a LICENSE link, and counts a sponsor click', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /recordEvent\('sponsor_link_clicked'\)/);
});

test('the privacy line names both stored event types and says nothing is uploaded or saved', () => {
  assert.match(html, /never uploaded/);
  assert.match(html, /nothing is saved when you close the tab/);
});

test('the price result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
});

test('an invalid input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/function updateQuote[\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'updateQuote() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('price'\)\.hidden = true/, 'the price hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});

test('the tool links to the service-call pricing guide page', () => {
  assert.match(html, /href="how-much-should-a-locksmith-charge-for-a-service-call\.html"/);
});

// Closest windows/doors/garage sibling: same property access job, but an
// automatic driveway gate rather than a locksmith service call. Related-tool
// chrome rotates inside the subcategory, so without an explicit one-hop a
// crawler on this page may never land on that tool.
test('index links one hop to the automatic-driveway-gate-bid-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/automatic-driveway-gate-bid-calculator\/"/,
    'index must link ../automatic-driveway-gate-bid-calculator/ so crawlers reach the gate calculator in one hop',
  );
  assert.match(html, /automatic driveway gate bid calculator/i);
});

test('the guide page links back to the calculator and carries the no-warranty clause', () => {
  assert.match(guideHtml, /<a href="\.\/">/);
  assert.match(guideHtml, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(guideHtml, /not legal, licensing, or business advice/);
});

test('the guide page worked example matches calc.mjs exactly', () => {
  const r = calculateQuote({
    laborMinutes: 15,
    travelMinutes: 25,
    hourlyRate: 85,
    emergencyCall: true,
    emergencyPct: 50,
    tripFee: 45,
    partsCost: 0,
    partsMarkupPct: 40,
    callbackReservePct: 4,
    overheadRate: 15,
    targetMargin: 30,
    minimumServiceCharge: 89,
  });
  assert.ok(r.finalPrice > DEFAULTS.minimumServiceCharge, 'the worked example should price above the minimum');
  assert.match(guideHtml, /\$56\.67/);
  assert.match(guideHtml, /\$28\.33/);
  assert.match(guideHtml, /\$85\.00/);
  assert.match(guideHtml, /\$45\.00/);
  assert.match(guideHtml, /\$5\.20/);
  assert.match(guideHtml, /\$20\.28/);
  assert.match(guideHtml, /\$155\.48/);
  assert.match(guideHtml, /\$222\.11/);
  assert.match(guideHtml, /\$66\.63/);

  const noEmergency = calculateQuote({
    laborMinutes: 15, travelMinutes: 25, hourlyRate: 85,
    emergencyCall: false, emergencyPct: 50, tripFee: 45, partsCost: 0,
    partsMarkupPct: 40, callbackReservePct: 4, overheadRate: 15,
    targetMargin: 30, minimumServiceCharge: 89,
  });
  assert.match(guideHtml, /\$173\.70/);
  assert.ok(Math.abs((r.finalPrice - noEmergency.finalPrice) - 48.41) < 0.02);
});

test('every visible FAQ question and answer on the guide page also appears in its FAQPage block', () => {
  const questions = [...guideHtml.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
  assert.ok(questions.length >= 4, `expected at least 4 visible questions, saw ${questions.length}`);
  const schema = guideHtml.slice(guideHtml.indexOf('"@type":"FAQPage"'));
  for (const question of questions) {
    assert.ok(schema.includes(JSON.stringify(question).slice(1, -1)), `visible question is missing from the FAQPage block: ${question}`);
  }
});

test('every .html file in the venture is reachable from the sitemap', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  const dir = new URL('./', import.meta.url);
  const htmlFiles = readdirSync(dir).filter((name) => name.endsWith('.html'));
  for (const name of htmlFiles) {
    if (name === 'index.html') continue;
    assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')), `${name} is missing from sitemap.xml`);
  }
});
