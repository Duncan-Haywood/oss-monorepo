import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { computeSchedule } from './calc.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guide = readFileSync(new URL('./what-happens-if-i-miss-a-quarterly-estimated-tax-payment.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the calculator links to the missed-payment guide, and it is in the sitemap', () => {
  assert.match(index, /what-happens-if-i-miss-a-quarterly-estimated-tax-payment\.html/);
  assert.match(sitemap, /what-happens-if-i-miss-a-quarterly-estimated-tax-payment\.html/);
});

// The tool's own "Load an example" button (index.html's #load-example handler).
const WORKED_EXAMPLE = { taxYear: 2026, priorYearTax: 9500, priorYearAGI: 85000, withholding: 0 };

test("the guide's flat quarterly share matches computeSchedule on the tool's own worked example", () => {
  const schedule = computeSchedule({
    ...WORKED_EXAMPLE,
    asOfDate: '2026-01-01',
    paidByQuarter: { q1: 0, q2: 0, q3: 0, q4: 0 },
  });
  assert.equal(schedule.required, 9500);
  assert.equal(schedule.perQuarter, 2375);
  assert.match(guide, /\$2,375/);
});

test("the guide's 'catch up before the next due date' figure matches computeSchedule when only Q1 is overdue", () => {
  // Between Q1's 2026-04-15 due date and Q2's 2026-06-15 due date, Q1 unpaid.
  const schedule = computeSchedule({
    ...WORKED_EXAMPLE,
    asOfDate: '2026-05-01',
    paidByQuarter: { q1: 0, q2: 0, q3: 0, q4: 0 },
  });
  assert.equal(schedule.pace.requiredToDate, 2375);
  assert.equal(schedule.pace.paidToDate, 0);
  assert.equal(schedule.pace.nextQuarterCatchUp, 2375);
});

test("the guide's 'let the next due date pass too' figure matches computeSchedule when Q1 and Q2 are both overdue", () => {
  // After Q2's 2026-06-15 due date, both Q1 and Q2 still unpaid.
  const schedule = computeSchedule({
    ...WORKED_EXAMPLE,
    asOfDate: '2026-07-01',
    paidByQuarter: { q1: 0, q2: 0, q3: 0, q4: 0 },
  });
  assert.equal(schedule.pace.requiredToDate, 4750);
  assert.equal(schedule.pace.paidToDate, 0);
  assert.equal(schedule.pace.nextQuarterCatchUp, 4750);
  assert.match(guide, /\$4,750/);
});

test("the guide's 'paying the usual amount after a miss still leaves you short' figure matches computeSchedule", () => {
  // Missed Q1, then paid the flat $2,375 share for Q2 on time.
  const schedule = computeSchedule({
    ...WORKED_EXAMPLE,
    asOfDate: '2026-06-15',
    paidByQuarter: { q1: 0, q2: 2375, q3: 0, q4: 0 },
  });
  assert.equal(schedule.pace.requiredToDate, 4750);
  assert.equal(schedule.pace.paidToDate, 2375);
  assert.equal(schedule.pace.delta, -2375);
  assert.match(guide, /\$2,375 short/i);
});

test('the guide carries a working FAQPage block whose questions are also rendered as visible copy', () => {
  const match = guide.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?)<\/script>/s);
  assert.ok(match, 'expected a FAQPage JSON-LD block');
  const ld = JSON.parse(match[1]);
  assert.ok(ld.mainEntity.length >= 4);
  for (const entry of ld.mainEntity) {
    assert.ok(guide.includes(entry.name), `question not rendered as visible copy: ${entry.name}`);
    assert.ok(guide.includes(entry.acceptedAnswer.text), `answer not rendered as visible copy: ${entry.name}`);
  }
});

test('the guide never claims a network call, matching every other page on this static site', () => {
  assert.doesNotMatch(guide, /fetch\(|XMLHttpRequest|<script src=/);
});

test('the guide carries the standard no-warranty and best-effort-hosting disclaimers', () => {
  assert.match(guide, /No warranty/);
  assert.match(guide, /Best-effort hosting, no SLA/);
});

test('the guide links back to the calculator', () => {
  assert.match(guide, /href="\.\/">/);
});
