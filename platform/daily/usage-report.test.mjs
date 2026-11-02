import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, composeDaily, composeWeekly, dayStats, daysBetween, firstKeyDay, incomeFacts, windowStats } from './usage-report.mjs';

const visits = {
  '2026-10-24': { about: 4, c: 3 },
  '2026-10-30': { c: 2, 'shed-designer': 5, 'geo:US': 6, 'dev:desktop': 6, 'bot:headless': 100, 'botpage:c': 3, 'src:other': 2 },
  '2026-10-31': { c: 1, 'geo:PL': 1, 'dev:mobile': 1 },
};
const none = incomeFacts({});

test('dayStats keeps breakdowns and crawler beacons out of the page total', () => {
  const s = dayStats(visits['2026-10-30']);
  assert.equal(s.loads, 7);
  assert.deepEqual(s.pages, { c: 2, 'shed-designer': 5 });
  assert.deepEqual(s.bots, { headless: 100 });
  assert.deepEqual(s.countries, { US: 6 });
  assert.equal(s.crawled, 1);
});

test('days before the counter started are not counted; later empty days are zero', () => {
  const w = windowStats(visits, daysBetween('2026-10-22', '2026-10-25'), '2026-10-24');
  assert.equal(w.counted, 2);
  assert.equal(w.loads, 7);
  assert.deepEqual(w.perDay.map((d) => d.loads), [null, null, 7, 0]);
  assert.equal(firstKeyDay(visits, 'bot:'), '2026-10-30');
  assert.deepEqual(w.perDay.map((d) => d.bots), [null, null, null, null]);
});

test('dates step across month ends', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(daysBetween('2026-10-30', '2026-11-01').length, 3);
});

test('income: ledger mrr_end, funding channels and dated payments', () => {
  const f = incomeFacts({
    ledger: 'entries:\n  - venture: a\n    mrr_end: 0\n  - venture: b\n    mrr_end: null\n  - venture: c\n    mrr_end: 12.5\n',
    ledgerName: 'portfolio/ledger/2026-10.yaml',
    funding: 'github: [x]\nbuy_me_a_coffee: y\n',
    income: { entries: [{ day: '2026-10-30', amount_usd: 5, channel: 'Buy Me a Coffee' }, { day: 'bad', amount_usd: 1 }] },
  });
  assert.equal(f.ledgerEntries, 3);
  assert.equal(f.ledgerRecorded, 2);
  assert.equal(f.ledgerMrr, 12.5);
  assert.deepEqual(f.channels, ['GitHub Sponsors', 'Buy Me a Coffee']);
  assert.equal(f.entries.length, 1);
  const post = composeDaily({ day: '2026-10-30', visits, income: f, firstDay: '2026-10-24' });
  assert.match(post.text, /1 payment\(s\) totalling \$5\.00/);
  assert.match(post.text, /title: "Usage and income, Friday, October 30, 2026: 7 page loads, \$5\.00 in"/);
});

test('daily post: front matter the site accepts, file named for the day it covers', () => {
  const post = composeDaily({ day: '2026-10-31', visits, income: none, firstDay: '2026-10-24' });
  assert.equal(post.name, '2026-11-01-usage-and-income-2026-10-31.md');
  assert.match(post.text, /^---\ntitle: .+\ndate: 2026-11-01\ntags: \[usage-report, daily-report, usage, monetization\]\ndescription: .+\n---\n/);
  const desc = /description: (.+)/.exec(post.text)[1];
  assert.ok(JSON.parse(desc).length <= 160);
  assert.match(post.text, /None recorded for this day/);
  assert.match(post.text, /\*\*1 page load\*\* across 1 page\./);
});

test('daily post before the counter started says so instead of a zero', () => {
  const post = composeDaily({ day: '2026-10-20', visits, income: none, firstDay: '2026-10-24' });
  assert.match(post.text, /not yet counted/);
  assert.doesNotMatch(post.text, /\*\*0 page loads/);
});

test('weekly post: refuses to compare with a partly counted week and flags late breakdowns', () => {
  const post = composeWeekly({ end: '2026-10-31', visits, income: none, firstDay: '2026-10-24' });
  assert.equal(post.name, '2026-11-01-usage-and-income-week-to-2026-10-31.md');
  assert.match(post.text, /\*\*8 page loads\*\*/);
  assert.match(post.text, /counted on only 1 of its 7 days/);
  assert.match(post.text, /\| 2026-10-25 \| 0 \| not counted \|/);
  assert.match(post.text, /recorded for 7 of the 8 loads: this split started on 2026-10-30/);
  assert.match(post.text, /First counted this week: .*shed-designer/);
});
