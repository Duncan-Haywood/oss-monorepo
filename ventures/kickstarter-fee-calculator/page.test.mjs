import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateCampaign, calculatePledge, CAMPAIGN_INPUT_IDS, PLEDGE_INPUT_IDS } from './calc.mjs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const markup = page('index.html');
const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const script = /<script type="module">([\s\S]*)<\/script>/.exec(markup)[1];

test('calculator page is findable and usable without a build step', () => {
  assert.match(markup, /Kickstarter Fee Calculator/);
  assert.match(markup, /calculateCampaign/);
  assert.match(markup, /<script type="application\/ld\+json">/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /Do not keep anonymous local usage counts/);
  assert.match(markup, /href="LICENSE"/);
  assert.match(markup, /not legal, tax, financial, or crowdfunding advice/);
  assert.match(markup, /not affiliated with, endorsed by, or sponsored by kickstarter/i);
});

test('every input the arithmetic reads exists on the form', () => {
  for (const id of [...CAMPAIGN_INPUT_IDS, ...PLEDGE_INPUT_IDS]) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
});

test('every form number input is one the arithmetic knows about', () => {
  const known = new Set([...CAMPAIGN_INPUT_IDS, ...PLEDGE_INPUT_IDS, 'usageOptOut']);
  const formInputs = [...markup.matchAll(/<input id="([^"]+)"/g)].map(m => m[1]);
  for (const id of formInputs) {
    assert.ok(known.has(id), `#${id} is on the page but not read by calc.mjs`);
  }
});

test('every output slot the script writes exists in the markup', () => {
  for (const id of [
    'payoutOut', 'heroLabel', 'averagePledgeOut', 'tierOut', 'platformFeeOut',
    'processingFeeOut', 'totalFeeOut', 'effectiveRateOut', 'notes', 'errorList',
    'output', 'problems', 'exampleNote', 'pledgeResult', 'pledgeTierOut',
    'pledgePlatformOut', 'pledgeProcessingOut', 'pledgeNetOut', 'pledgeRateOut',
  ]) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
});

test('results are written as text, never as markup', () => {
  assert.doesNotMatch(script, /innerHTML/);
  assert.match(script, /textContent/);
});

test('the calculator makes no network request of its own', () => {
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|WebSocket/);
});

test('robots and sitemap let crawlers find the page', () => {
  const robots = page('robots.txt');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Sitemap: sitemap\.xml/);
  const sitemap = page('sitemap.xml');
  assert.match(sitemap, /kickstarter-fee-calculator\//);
});

test('the worked example on load matches calculateCampaign for the shipped defaults', () => {
  const result = calculateCampaign({ totalRaised: 10000, backerCount: 150 });
  assert.equal(result.ok, true);
  assert.match(markup, /value="10000"/);
  assert.match(markup, /value="150"/);
});

test('index links one hop to the patreon and merchant-of-record siblings', () => {
  for (const slug of ['patreon-fee-calculator', 'merchant-of-record-fee-calculator']) {
    assert.match(
      markup,
      new RegExp(`href="\\.\\./${slug}/"`),
      `index must link ../${slug}/ so crawlers reach that calculator in one hop`,
    );
  }
});

test('the FAQPage JSON-LD questions match the visible FAQ headings', () => {
  const blocks = [...markup.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1]),
  );
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.ok(faq, 'expected a FAQPage JSON-LD block');
  const headings = [...markup.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1].trim());
  assert.ok(headings.length >= 3);
  const names = faq.mainEntity.map((q) => q.name);
  for (const heading of headings) {
    assert.ok(names.includes(heading), `visible heading not found in FAQPage JSON-LD: ${heading}`);
  }
});

test('the how-much guide links back and is linked from index', () => {
  const guide = page('how-much-does-kickstarter-take.html');
  assert.match(markup, /how-much-does-kickstarter-take\.html/);
  assert.match(guide, /href="\.\/">/);
  assert.match(guide, /No warranty/);
  assert.match(guide, /not affiliated with, endorsed by, or sponsored by kickstarter/i);
});

test('the how-much guide worked-example figures match calc.mjs for the same inputs', () => {
  const guide = page('how-much-does-kickstarter-take.html');

  const p50 = calculatePledge({ pledgeAmount: 50 });
  assert.equal(p50.totalFee.toFixed(2), '4.20');
  assert.equal(p50.netContribution.toFixed(2), '45.80');
  assert.match(guide, /\$4\.20/);
  assert.match(guide, /\$45\.80/);

  const p5 = calculatePledge({ pledgeAmount: 5 });
  assert.equal(p5.tier, 'micro');
  assert.equal(p5.totalFee.toFixed(2), '0.55');
  assert.equal(p5.netContribution.toFixed(2), '4.45');
  assert.match(guide, /\$0\.55/);
  assert.match(guide, /\$4\.45/);

  const campaignA = calculateCampaign({ totalRaised: 10000, backerCount: 500 });
  assert.equal(campaignA.totalFee.toFixed(0), '900');
  const campaignB = calculateCampaign({ totalRaised: 10000, backerCount: 1000 });
  assert.equal(campaignB.totalFee.toFixed(0), '1000');
  assert.match(guide, /\$900/);
  assert.match(guide, /\$1,000/);
});

test('every authored FAQPage question and answer text is echoed on the how-much guide, verbatim', () => {
  const guide = page('how-much-does-kickstarter-take.html');
  const blocks = [...guide.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.ok(faq, 'no FAQPage JSON-LD block found on the how-much guide');
  for (const { name, acceptedAnswer } of faq.mainEntity) {
    assert.ok(guide.includes(name), `question not visible verbatim: ${name}`);
    assert.ok(guide.includes(acceptedAnswer.text), `answer not visible verbatim: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});
