import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { assessBid, daysUntilDue, deadlineSentence } from './model.mjs';

const docsPage = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = docsPage('does-a-bid-due-today-count-as-a-day-remaining.html');
const index = docsPage('index.html');

test('index links to the days-remaining SEO/AI-discovery page', () => {
  assert.match(index, /does-a-bid-due-today-count-as-a-day-remaining\.html/);
});

test('the docs page answers the search question with the disclaimers intact', () => {
  assert.match(html, /Does a Bid Due Today Count as a Day Remaining/i);
  assert.match(html, /FAQPage/);
  assert.match(html, /"@type":"Question"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /not contracting or legal advice/i);
});

const items = [{ name: 'Scope', owner: '', status: 'ready', note: '' }];
const at = (when) => new Date(when);

test('the worked table matches daysUntilDue/deadlineSentence/urgency output, not hand-typed figures', () => {
  const rows = [
    ['2099-01-01', at('2099-01-01T09:00:00'), 0, 'The deadline is today.', 'urgent'],
    ['2099-01-02', at('2099-01-01T09:00:00'), 1, '1 day remains.', 'urgent'],
    ['2099-01-08', at('2099-01-01T09:00:00'), 7, '7 days remain.', 'normal'],
    ['2098-12-31', at('2099-01-01T09:00:00'), -1, 'The deadline passed 1 day ago.', 'past-due'],
  ];
  for (const [due, today, expectedDays, expectedSentence, expectedUrgency] of rows) {
    const days = daysUntilDue(due, today);
    assert.equal(days, expectedDays, `${due} from ${today.toISOString()}`);
    assert.equal(deadlineSentence(days), expectedSentence);
    assert.equal(assessBid(items, due, today).urgency, expectedUrgency);
    assert.ok(html.includes(expectedSentence), `expected the page to show "${expectedSentence}"`);
  }
});

test('checking at a different time of the same day does not change the count', () => {
  assert.equal(daysUntilDue('2099-01-01', at('2099-01-01T23:30:00')), 0);
  assert.equal(daysUntilDue('2099-01-01', at('2099-01-01T09:00:00')), 0);
});

test('a deadline that passed overnight is past-due immediately, not after a full day', () => {
  const yesterday = assessBid(items, '2099-01-01', at('2099-01-02T09:00:00'));
  assert.equal(yesterday.daysRemaining, -1);
  assert.equal(yesterday.urgency, 'past-due');
  assert.equal(assessBid(items, '2099-01-01', at('2099-01-02T23:45:00')).urgency, 'past-due');
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = docsPage('robots.txt');
  const sitemap = docsPage('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /contractor-bid-readiness\/<\/loc>/);
  assert.match(sitemap, /does-a-bid-due-today-count-as-a-day-remaining\.html/);
});
