import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { calculateJobBid, DEFAULTS } from './calc.mjs';

const page = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('how-much-does-biohazard-cleanup-cost.html');
const index = page('index.html');
const readme = page('README.md');

test('index and README link to the cost guide', () => {
  assert.match(index, /how-much-does-biohazard-cleanup-cost\.html/);
  assert.match(readme, /how-much-does-biohazard-cleanup-cost\.html/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /biohazard-cleanup-bid-calculator\/<\/loc>/);
  assert.match(sitemap, /how-much-does-biohazard-cleanup-cost\.html/);
});

test('the guide carries the required disclaimers and links back', () => {
  assert.match(html, /<title>How Much Does Biohazard Cleanup Cost/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /GitHub Sponsors/);
});

test('the page never calls the naive method a bad-faith practice', () => {
  for (const word of ['scam', 'ripoff', 'rip-off', 'overpriced', 'useless']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(html), `the guide uses "${word}"`);
  }
});

test('the page names no specific competitor, so it needs no trademark-affiliation clause', () => {
  assert.ok(!/\btrademark\b/i.test(html));
});

test('the worked figures match the calculator\'s own verified defaults', () => {
  const base = calculateJobBid(DEFAULTS);
  const twoCycles = calculateJobBid({ ...DEFAULTS, deconCyclesPerTechnician: 2 });
  const bigWaste = calculateJobBid({ ...DEFAULTS, biohazardWastePounds: 155 });
  const smallScene = calculateJobBid({ ...DEFAULTS, technicianCount: 1, hoursOnSitePerTechnician: 2, biohazardWastePounds: 15 });

  assert.equal(base.price.toFixed(2), '1374.67');
  assert.equal(base.directCost.toFixed(2), '1031.00');
  assert.equal(twoCycles.ppeCost.toFixed(2), '152.00');
  assert.equal(base.ppeCost.toFixed(2), '76.00');
  assert.equal(bigWaste.disposalCost.toFixed(2), '440.00');
  assert.equal(base.disposalCost.toFixed(2), '220.00');
  assert.equal(smallScene.disposalCost.toFixed(2), '110.00');
  assert.equal(smallScene.naiveDisposalCost.toFixed(2), '41.25');
  assert.equal(smallScene.price.toFixed(2), '697.33');

  assert.match(html, /\$1,374\.67/);
  assert.match(html, /\$1,031\.00/);
  assert.match(html, /\$697\.33/);
  assert.match(html, /\$110\.00/);
  assert.match(html, /\$41\.25/);
  assert.match(html, /\$76\.00/);
  assert.match(html, /\$152\.00/);
  assert.match(html, /\$220\.00/);
  assert.match(html, /\$440\.00/);
});

test('FAQPage JSON-LD answers match the visible prose exactly', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?)<\/script>/s)[1]);
  const visible = html.replace(/&mdash;/g, '—').replace(/&times;/g, '×');
  for (const qa of ld.mainEntity) {
    assert.ok(visible.includes(qa.name), `visible prose is missing the exact FAQ question "${qa.name}"`);
    assert.ok(visible.includes(qa.acceptedAnswer.text), `visible prose is missing the exact FAQ answer for "${qa.name}"`);
  }
});
