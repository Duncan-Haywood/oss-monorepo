import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { statutoryLateInterest, statutoryNote, fixedCompensation } from './statutory.mjs';

const base = { amount: 5000, baseRatePct: 4, dueDate: '2026-01-01', asOfDate: '2026-01-31' };

test('interest is principal x (reference + 8%) x days / 365', () => {
  const r = statutoryLateInterest(base);
  assert.equal(r.daysLate, 30);
  assert.equal(r.annualRatePct, 12);
  assert.ok(Math.abs(r.interest - 5000 * 0.12 * 30 / 365) < 1e-9);
  assert.equal(r.compensation, 70);
  assert.ok(Math.abs(r.total - (5000 + r.interest + 70)) < 1e-9);
});

test('fixed compensation bands are 40 / 70 / 100 at the boundaries', () => {
  assert.equal(fixedCompensation(999.99), 40);
  assert.equal(fixedCompensation(1000), 70);
  assert.equal(fixedCompensation(9999.99), 70);
  assert.equal(fixedCompensation(10000), 100);
});

test('nothing accrues before or on the due date', () => {
  const r = statutoryLateInterest({ ...base, asOfDate: '2026-01-01' });
  assert.equal(r.daysLate, 0);
  assert.equal(r.interest, 0);
  assert.equal(r.compensation, 0);
  assert.match(statutoryNote(r), /Not late yet/);
  assert.equal(statutoryLateInterest({ ...base, asOfDate: '2025-12-01' }).daysLate, 0);
});

test('rejects bad input', () => {
  assert.throws(() => statutoryLateInterest({ ...base, amount: 0 }), /greater than zero/);
  assert.throws(() => statutoryLateInterest({ ...base, baseRatePct: -1 }), /zero or more/);
  assert.throws(() => statutoryLateInterest({ ...base, baseRatePct: 60 }), /below 50/);
  assert.throws(() => statutoryLateInterest({ ...base, dueDate: '2026-02-30' }), /valid due date/);
  assert.throws(() => statutoryLateInterest(null), /invoice details/);
});

test('note reports the claimable amount', () => {
  assert.match(statutoryNote(statutoryLateInterest(base)), /£70\.00 fixed compensation/);
});

const html = fs.readFileSync(new URL('./uk-late-payment-interest.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('page carries the disclaimer, canonical, and is linked and in the sitemap', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or business advice/i);
  assert.match(html, /<link rel="canonical" href="uk-late-payment-interest\.html">/);
  assert.match(indexHtml, /href="uk-late-payment-interest\.html"/);
  assert.match(sitemap, /uk-late-payment-interest\.html/);
});

test('FAQPage schema matches the visible headings', () => {
  const m = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(m);
  for (const q of JSON.parse(m[1]).mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});
