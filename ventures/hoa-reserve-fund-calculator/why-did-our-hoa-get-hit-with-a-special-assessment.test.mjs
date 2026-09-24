import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { DEFAULTS, runSchedule, perUnitImpact } from './calc.mjs';

const page = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('why-did-our-hoa-get-hit-with-a-special-assessment.html');
const index = page('index.html');
const sitemap = page('sitemap.xml');
const robots = page('robots.txt');

test('index links to the special-assessment guide', () => {
  assert.match(index, /why-did-our-hoa-get-hit-with-a-special-assessment\.html/);
});

test('robots and sitemap let crawlers find the new page', () => {
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /hoa-reserve-fund-calculator\/<\/loc>/);
  assert.match(sitemap, /why-did-our-hoa-get-hit-with-a-special-assessment\.html/);
});

test('the guide carries the required disclaimers and links back', () => {
  assert.match(html, /<title>Why Did Our HOA Get Hit With a Special Assessment/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /state-mandated reserve study/);
  assert.match(html, /GitHub Sponsors/);
});

test('has exactly one <h1> and the structural tags a crawler expects', () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<meta name="description" content="[^"]{80,}"/);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
});

test('FAQPage JSON-LD answers match the visible prose exactly (after decoding entities)', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?)<\/script>/s)[1]);
  assert.ok(ld.mainEntity.length >= 3, 'FAQPage should carry at least 3 questions');
  const visible = html.replace(/&mdash;/g, '—').replace(/&rarr;/g, '→').replace(/&larr;/g, '←');
  for (const qa of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${qa.name}</h3>`), `question not found verbatim as an <h3>: ${qa.name}`);
    assert.ok(visible.includes(qa.acceptedAnswer.text), `visible prose is missing the exact FAQ answer for "${qa.name}"`);
  }
});

// The worked scenario is the page's central claim -- recomputed here against
// the shipped calculator rather than restated, so the page cannot drift from
// what the calculator actually returns.
test('the worked scenario figures match what the shipped calculator computes', () => {
  const inputs = { ...DEFAULTS, currentBalance: 150000, annualContribution: 65000, unitCount: 120 };
  const rows = runSchedule(inputs);

  assert.equal(rows[0].balance.toFixed(2), '218000.00');
  assert.equal((rows[0].percentFunded * 100).toFixed(1), '31.6');
  assert.equal(rows[0].specialAssessmentTriggered, false);

  assert.equal(rows[1].balance.toFixed(2), '185593.63');
  assert.equal((rows[1].percentFunded * 100).toFixed(1), '27.3');
  assert.equal(rows[1].specialAssessmentTriggered, true);
  assert.deepEqual(rows[1].componentsReplacedThisYear, ['Exterior painting']);

  const impact = perUnitImpact(inputs);
  assert.equal(impact.shortfallYear, 2);
  assert.equal(impact.minimumContribution.toFixed(2), '118760.06');
  assert.equal(impact.monthlyDuesIncreasePerUnit.toFixed(2), '37.33');
  assert.equal(impact.oneTimeSpecialAssessmentPerUnit.toFixed(2), '151.28');

  for (const figure of [
    '$218,000.00', '31.6%', '$185,593.63', '27.3%',
    '$118,760.06', '$37.33 per unit per month', '$151.28 per unit',
  ]) {
    assert.ok(html.includes(figure), `guide is missing figure ${figure}`);
  }
});
