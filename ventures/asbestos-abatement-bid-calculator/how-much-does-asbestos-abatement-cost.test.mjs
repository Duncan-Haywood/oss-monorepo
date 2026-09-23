import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { calculateAbatementBid, DEFAULTS } from './calc.mjs';

const page = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('how-much-does-asbestos-abatement-cost.html');
const index = page('index.html');
const readme = page('README.md');

test('index and README link to the cost guide', () => {
  assert.match(index, /how-much-does-asbestos-abatement-cost\.html/);
  assert.match(readme, /how-much-does-asbestos-abatement-cost\.html/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /asbestos-abatement-bid-calculator\/<\/loc>/);
  assert.match(sitemap, /how-much-does-asbestos-abatement-cost\.html/);
});

test('the guide carries the required disclaimers and links back', () => {
  assert.match(html, /<title>How Much Does Asbestos Abatement Cost/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /"@type":"HowTo"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /GitHub Sponsors/);
});

test('the page never calls a flat rate a bad-faith practice', () => {
  for (const word of ['scam', 'ripoff', 'rip-off', 'overpriced', 'useless']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(html), `the guide uses "${word}"`);
  }
});

test('the page names no specific competitor, so it needs no trademark-affiliation clause', () => {
  assert.ok(!/\btrademark/i.test(html));
});

test('the worked figures match the calculator\'s own verified defaults, isolating containment class', () => {
  const classIII = calculateAbatementBid({ ...DEFAULTS, containmentClass: 'classIII' });
  const classII = calculateAbatementBid({ ...DEFAULTS, containmentClass: 'classII' });
  const classI = calculateAbatementBid(DEFAULTS);
  const bigger = calculateAbatementBid({
    ...DEFAULTS, squareFootage: 1000, containmentAreas: 2, airMonitoringSamples: 10, wasteVolumeCubicYards: 6,
  });

  assert.equal(classIII.finalPrice.toFixed(2), '1997.84');
  assert.equal(classII.finalPrice.toFixed(2), '2709.96');
  assert.equal(classI.finalPrice.toFixed(2), '4748.68');
  assert.equal(bigger.finalPrice.toFixed(2), '9828.84');

  assert.match(html, /\$1,997\.84/);
  assert.match(html, /\$2,709\.96/);
  assert.match(html, /\$4,748\.68/);
  assert.match(html, /\$9,828\.84/);
  assert.match(html, /\$4\.99/);
  assert.match(html, /\$6\.77/);
  assert.match(html, /\$11\.87/);
  assert.match(html, /\$9\.83/);
});

test('FAQPage JSON-LD answers match the visible prose exactly', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?)<\/script>/s)[1]);
  const visible = html.replace(/&mdash;/g, '—').replace(/&sup3;/g, '³');
  for (const qa of ld.mainEntity) {
    assert.ok(visible.includes(qa.name), `visible prose is missing the exact FAQ question "${qa.name}"`);
    const answer = qa.acceptedAnswer.text.replace(/--/g, '—');
    assert.ok(visible.includes(answer), `visible prose is missing the exact FAQ answer for "${qa.name}"`);
  }
});

test('the HowTo JSON-LD parses and names at least three steps', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"HowTo".*?)<\/script>/s)[1]);
  assert.ok(ld.step.length >= 3);
});
