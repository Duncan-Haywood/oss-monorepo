import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { calculateSurveyBid, naivePerAcreQuote, DEFAULTS } from './calc.mjs';

const page = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('how-much-does-a-land-survey-cost.html');
const index = page('index.html');
const readme = page('README.md');

test('index and README link to the cost guide', () => {
  assert.match(index, /how-much-does-a-land-survey-cost\.html/);
  assert.match(readme, /how-much-does-a-land-survey-cost\.html/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /land-survey-bid-calculator\/<\/loc>/);
  assert.match(sitemap, /how-much-does-a-land-survey-cost\.html/);
});

test('the guide carries the required disclaimers and links back', () => {
  assert.match(html, /<title>How Much Does a Land Survey Cost/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /GitHub Sponsors/);
});

test('the page never calls a flat per-acre rate a bad-faith practice', () => {
  for (const word of ['scam', 'ripoff', 'rip-off', 'overpriced', 'useless']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(html), `the guide uses "${word}"`);
  }
});

test('the page names no specific competitor, so it needs no trademark-affiliation clause', () => {
  assert.ok(!/\btrademark/i.test(html));
});

test('the worked figures match the calculator\'s own verified defaults', () => {
  const defaultBid = calculateSurveyBid(DEFAULTS);
  const easy = calculateSurveyBid({ ...DEFAULTS, cornersToLocate: 4, cornersToSet: 0, terrain: 'open' });
  const hard = calculateSurveyBid({ ...DEFAULTS, cornersToLocate: 0, cornersToSet: 4, terrain: 'heavy' });
  const bigClean = calculateSurveyBid({
    ...DEFAULTS, parcelAcres: 40, cornersToLocate: 4, cornersToSet: 0, terrain: 'open', recordResearchHours: 1,
  });
  const naiveDefault = naivePerAcreQuote(DEFAULTS);
  const naiveBig = naivePerAcreQuote({ ...DEFAULTS, parcelAcres: 40 });

  assert.equal(defaultBid.finalPrice.toFixed(2), '1274.05');
  assert.equal(easy.finalPrice.toFixed(2), '1084.82');
  assert.equal(hard.finalPrice.toFixed(2), '1970.97');
  assert.equal(bigClean.finalPrice.toFixed(2), '850.00');
  assert.equal(bigClean.minimumApplied, true);
  assert.equal(naiveDefault.toFixed(2), '600.00');
  assert.equal(naiveBig.toFixed(2), '4800.00');
  assert.equal(easy.fieldHours.toFixed(2), '1.67');
  assert.equal(hard.fieldHours.toFixed(2), '8.07');

  for (const figure of ['$1,274.05', '$1,084.82', '$1,970.97', '$850.00', '$600.00', '$4,800.00', '1.67', '8.07']) {
    assert.ok(html.includes(figure), `guide is missing figure ${figure}`);
  }
});

test('FAQPage JSON-LD answers match the visible prose exactly', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?)<\/script>/s)[1]);
  const visible = html.replace(/&mdash;/g, '—').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”');
  for (const qa of ld.mainEntity) {
    assert.ok(visible.includes(qa.name), `visible prose is missing the exact FAQ question "${qa.name}"`);
    assert.ok(visible.includes(qa.acceptedAnswer.text), `visible prose is missing the exact FAQ answer for "${qa.name}"`);
  }
});
