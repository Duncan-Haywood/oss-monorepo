// The two content pages carry worked figures and factual claims about a
// named third-party product. Both are the kind of thing that goes quietly
// wrong: an arithmetic example drifts from the calculator it illustrates, or
// a comparison page loses the trademark disclaimer in an edit. Both are
// cheap to pin, and neither is checked by the calculator's own tests.

import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEvent, DEFAULTS } from './calc.mjs';

const guide = readFileSync(new URL('./how-much-do-you-need-to-sell-at-a-craft-fair.html', import.meta.url), 'utf8');
const versus = readFileSync(new URL('./vs-craftybase.html', import.meta.url), 'utf8');

test('the guide worked example is the calculator default event, figure for figure', () => {
  const r = calculateEvent(DEFAULTS);
  const money = (n) => `$${n.toFixed(2)}`;
  assert.ok(guide.includes(money(DEFAULTS.boothFee)), 'booth fee row does not match DEFAULTS');
  assert.ok(guide.includes(money(r.mileageCost)), `mileage row should read ${money(r.mileageCost)}`);
  assert.ok(guide.includes(money(r.fixedEventCost)), `fixed-cost total should read ${money(r.fixedEventCost)}`);
  assert.ok(guide.includes(money(r.breakEvenRevenue)), `break-even should read ${money(r.breakEvenRevenue)}`);
  assert.ok(guide.includes(`${(r.contributionRate * 100).toFixed(1)}c`), 'kept-per-dollar row does not match');
  assert.ok(guide.includes(`${r.breakEvenOrders} orders`), `break-even orders should read ${r.breakEvenOrders}`);
});

test('the guide break-even-with-your-time figure matches the arithmetic', () => {
  const r = calculateEvent(DEFAULTS);
  // Stated rounded to the dollar in prose: "about $1,507".
  const rounded = Math.round(r.breakEvenRevenueWithPay).toLocaleString('en-US');
  assert.ok(guide.includes(rounded), `break-even with pay should read about $${rounded}`);
  assert.ok(guide.includes(`${r.committedHours} hours at $${DEFAULTS.targetHourlyRate}`.replace('26 hours', 'Twenty-six hours')));
});

test('the guide card-cost rows decompose the same contribution rate the calculator uses', () => {
  const r = calculateEvent(DEFAULTS);
  assert.ok(guide.includes(`${(r.materialRate * 100).toFixed(1)}c`), 'materials row does not match');
  assert.ok(guide.includes(`${(r.cardPercentRate * 100).toFixed(1)}c`), 'card percentage row does not match');
  assert.ok(guide.includes(`${(r.cardFixedRate * 100).toFixed(1)}c`), 'card fixed-fee row does not match');
});

test('both content pages carry the no-warranty clause', () => {
  for (const [name, html] of [['guide', guide], ['vs-craftybase', versus]]) {
    assert.match(html, /No warranty\.<\/strong> This (tool|guide) is provided free and as-is/, `${name} is missing the no-warranty clause`);
  }
});

test('the comparison page carries the nominative-fair-use trademark disclaimer', () => {
  assert.match(
    versus,
    /Not affiliated with, endorsed by, or sponsored by/,
    'a vs- page naming a trademark must say plainly that it is not that product\'s page',
  );
  assert.match(versus, /is a trademark of its owner/);
});

test('the comparison page frames the difference as a different job, never as a fault', () => {
  // The playbook's rule: comparative and factual, never derogatory. A page
  // that reads as an attack is a defamation exposure for no product gain.
  assert.match(versus, /different job|different questions/i);
  assert.match(versus, /Nothing here says or implies that Craftybase is worse/);
  for (const word of ['scam', 'ripoff', 'rip-off', 'overpriced', 'useless', 'broken']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(versus), `the comparison page uses "${word}"`);
  }
});

test('the comparison page says its claims come from the vendor own public pages', () => {
  assert.match(versus, /drawn from its own public product and pricing pages/);
});

test('both content pages route the reader back to the calculator', () => {
  for (const [name, html] of [['guide', guide], ['vs-craftybase', versus]]) {
    assert.match(html, /href="\.\/"/, `${name} has no link back to the calculator`);
  }
});

test('the guide links the sibling tools for the same seller', () => {
  for (const slug of ['etsy-profit-calculator', 'where-to-sell-calculator']) {
    assert.match(guide, new RegExp(`href="\\.\\./${slug}/"`), `the guide should reach ../${slug}/ in one hop`);
  }
});

test('both content pages are indexable and describe themselves for a crawler', () => {
  for (const [name, html] of [['guide', guide], ['vs-craftybase', versus]]) {
    assert.match(html, /<meta name="robots" content="index,follow">/, `${name} is not marked indexable`);
    assert.match(html, /<meta name="description" content="[^"]{80,}">/, `${name} has no usable meta description`);
    assert.match(html, /<title>[^<]+<\/title>/, `${name} has no title`);
  }
});
