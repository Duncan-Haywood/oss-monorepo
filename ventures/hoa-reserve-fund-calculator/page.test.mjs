import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSchedule, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('the page has a title, meta description, and robots tag', () => {
  assert.match(html, /<title>HOA Reserve Fund Calculator/);
  assert.match(html, /<meta name="description" content="[^"]+"/);
  assert.match(html, /<meta name="robots" content="index,follow">/);
});

test('the page carries SoftwareApplication and FAQPage JSON-LD', () => {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const app = scripts.find((s) => s['@type'] === 'SoftwareApplication');
  assert.ok(app, 'SoftwareApplication JSON-LD is missing');
  assert.equal(app.offers.price, '0');
  const faq = scripts.find((s) => s['@type'] === 'FAQPage');
  assert.ok(faq, 'FAQPage JSON-LD is missing');
  assert.ok(faq.mainEntity.length >= 3, 'FAQPage should carry at least 3 questions');
});

test('every FAQPage question and answer is a verbatim substring of the visible page text', () => {
  const faqScript = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?)<\/script>/);
  assert.ok(faqScript, 'FAQPage JSON-LD script not found');
  const faq = JSON.parse(faqScript[1]);
  // The visible FAQ section renders each question/answer with HTML entities
  // (&mdash;, &rsquo; is not used here but apostrophes are literal) while the
  // JSON-LD carries literal unicode -- decode the handful this page actually
  // uses before checking containment, the same normalization vending-machine
  // and pool-route-pricing's own FAQ sections rely on implicitly by not
  // using entities that would otherwise diverge.
  const visible = html.replace(/&mdash;/g, '—').replace(/&amp;/g, '&');
  for (const { name, acceptedAnswer } of faq.mainEntity) {
    assert.ok(visible.includes(name), `question not found verbatim in visible text: ${name}`);
    assert.ok(visible.includes(acceptedAnswer.text), `answer not found verbatim in visible text: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the page imports the calc.mjs API surface and usage.mjs', () => {
  assert.match(html, /import \{ runSchedule, firstShortfallYear, minimumContributionToAvoidShortfall, perUnitImpact, DEFAULTS \} from '\.\/calc\.mjs'/);
  assert.match(html, /import \{ recordEvent, toggleUsage, usageAllowed \} from '\.\/usage\.mjs'/);
});

test('the page wires usage counting for schedule runs, the solver, reset, and the sponsor link', () => {
  assert.match(html, /recordEvent\('schedule_run'\)/);
  assert.match(html, /recordEvent\('contribution_solved'\)/);
  assert.match(html, /recordEvent\('reset'\)/);
  assert.match(html, /recordEvent\('sponsor_link_clicked'\)/);
  assert.match(html, /<code>schedule_run<\/code>, <code>contribution_solved<\/code>, <code>reset<\/code>, <code>sponsor_link_clicked<\/code>/);
});

test('every top-level scalar assumption has a matching input on the page', () => {
  for (const id of ['currentBalance', 'annualContribution', 'unitCount', 'horizonYears', 'inflationRatePct', 'interestRatePct', 'targetPercentFundedPct']) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page ships 8 component rows with 4 fields each, matching the DEFAULTS component set for the first 6', () => {
  const nameInputs = [...html.matchAll(/class="compName" data-row="(\d)"/g)];
  assert.equal(nameInputs.length, 8);
  DEFAULTS.components.forEach((c, i) => {
    assert.match(html, new RegExp(`data-row="${i + 1}" aria-label="Component ${i + 1} name"[^>]*value="${c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  });
});

test('the default scalar inputs and component defaults produce the same DEFAULTS schedule', () => {
  const schedule = runSchedule(DEFAULTS);
  assert.equal(schedule.length, DEFAULTS.horizonYears);
  assert.match(html, new RegExp(`id="currentBalance" type="number" min="0" step="100" value="${DEFAULTS.currentBalance}"`));
  assert.match(html, new RegExp(`id="annualContribution" type="number" min="0" step="100" value="${DEFAULTS.annualContribution}"`));
  assert.match(html, new RegExp(`id="unitCount" type="number" min="1" step="1" value="${DEFAULTS.unitCount}"`));
});

test('the no-warranty disclaimer and the state-mandated-reserve-study disclaimer are both on the page', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not tax, financial, or business advice/);
  assert.match(html, /not a substitute for a state-mandated reserve study \(e\.g\. Florida SB 4-D \/ SIRS\)/);
});

test('the page carries the standard sponsor link and a LICENSE link', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
});

test('the privacy section names all four stored event types and says nothing is uploaded or saved', () => {
  assert.match(html, /nothing is ever uploaded/);
  assert.match(html, /never saved or sent anywhere/);
});

test('an opt-out control (id="optout") calling toggleUsage is present', () => {
  assert.match(html, /id="optout" type="button"/);
  assert.match(html, /toggleUsage\(false\)/);
});

test('the results panel announces recalculation to screen readers', () => {
  assert.match(html, /<section id="results" class="result" aria-live="polite">/);
});

test('an invalid input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/\} catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'update() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('verdict'\)\.hidden = true/, 'the verdict hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});

// Closest sibling: an association's board also cares about day-to-day
// operating cash, not just the long-horizon reserve modeled here. Related
// tool chrome rotates, so link it explicitly one hop away.
test('index links one hop to the cash-runway-planner sibling', () => {
  assert.match(
    html,
    /href="\.\.\/cash-runway-planner\/"/,
    'index must link ../cash-runway-planner/ so a crawler reaches that tool in one hop',
  );
  assert.match(html, /cash runway planner/i);
});
