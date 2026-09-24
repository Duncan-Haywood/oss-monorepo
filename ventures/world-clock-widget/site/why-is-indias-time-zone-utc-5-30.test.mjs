import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guide = readFileSync(new URL('./why-is-indias-time-zone-utc-5-30.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the world clock links to the India time zone guide, and it is in the sitemap', () => {
  assert.match(index, /why-is-indias-time-zone-utc-5-30\.html/);
  assert.match(sitemap, /why-is-indias-time-zone-utc-5-30\.html/);
});

test('the guide states the core facts: the UTC+5:30 offset, the anchor meridian, and the 1906 unification', () => {
  assert.match(guide, /UTC\+5:30/);
  assert.match(guide, /82\.5.?°?E/);
  assert.match(guide, /1906/);
  assert.match(guide, /Asia\/Kolkata/);
});

test('the guide names Nepal\'s 45-minute offset as the comparison point for "not the only unusual zone"', () => {
  assert.match(guide, /Nepal/);
  assert.match(guide, /5:45/);
});

test('the guide carries a working FAQPage block whose questions are also rendered as visible copy', () => {
  const match = guide.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?)<\/script>/s);
  assert.ok(match, 'expected a FAQPage JSON-LD block');
  const ld = JSON.parse(match[1]);
  assert.ok(ld.mainEntity.length >= 3);
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

test('the guide links back to the tool, including a share link that opens Mumbai and New Delhi', () => {
  assert.match(guide, /href="\.\/"/);
  assert.match(guide, /href="\.\/\?cities=mumbai%2Cnew-delhi"/);
});
