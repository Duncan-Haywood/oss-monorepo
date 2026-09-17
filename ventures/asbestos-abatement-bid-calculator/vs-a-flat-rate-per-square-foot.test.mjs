import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const page = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('vs-a-flat-rate-per-square-foot.html');
const index = page('index.html');
const readme = page('README.md');

test('index and README link to the flat-rate comparison page', () => {
  assert.match(index, /vs-a-flat-rate-per-square-foot\.html/);
  assert.match(readme, /vs-a-flat-rate-per-square-foot\.html/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /asbestos-abatement-bid-calculator\/<\/loc>/);
  assert.match(sitemap, /vs-a-flat-rate-per-square-foot\.html/);
});

test('the comparison page carries the required disclaimers and links back', () => {
  assert.match(html, /<title>This calculator vs\. a flat rate per square foot/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /GitHub Sponsors/);
});

test('the page frames the difference as a different job, never as a fault', () => {
  assert.match(html, /Nothing here says or implies that quoting a flat rate per square foot is a bad-faith practice/);
  for (const word of ['scam', 'ripoff', 'rip-off', 'overpriced', 'useless']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(html), `the comparison page uses "${word}"`);
  }
});

test('the page names no specific competitor, so it needs no trademark-affiliation clause', () => {
  assert.ok(!/\btrademark/i.test(html));
});

test('the worked-example figures match the calculator\'s own verified defaults', () => {
  assert.match(html, /\$850/);
  assert.match(html, /\$650 \(the calculator's minimum job fee\)/);
  assert.match(html, /\$10,200/);
  assert.match(html, /\$13,233\.33/);
  assert.match(html, /about 24% too high/);
  assert.match(html, /about 30% too low/);
});

test('FAQPage JSON-LD answers match the visible prose exactly', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?)<\/script>/s)[1]);
  for (const qa of ld.mainEntity) {
    const answer = qa.acceptedAnswer.text;
    assert.ok(html.includes(answer), `visible prose is missing the exact FAQ answer for "${qa.name}"`);
  }
});
