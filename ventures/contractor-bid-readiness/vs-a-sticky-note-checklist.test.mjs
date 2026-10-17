import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const docsPage = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = docsPage('vs-a-sticky-note-checklist.html');
const index = docsPage('index.html');

test('index links to the sticky-note comparison page', () => {
  assert.match(index, /vs-a-sticky-note-checklist\.html/);
});

test('carries the no-warranty and best-effort hosting disclaimers', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, financial, or contracting advice/i);
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
});

test('names no vendor, competing checklist, or platform', () => {
  // This page compares against a manual tracking habit (a sticky note or
  // mental checklist), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause. Distinct from this venture's own
  // vs-jobtread.html, which names a real product.
  assert.doesNotMatch(html, /JobTread/i);
});

test('the canonical tag names this file at the real GitHub Pages origin', () => {
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/duncan-haywood\.github\.io\/monorepo-projects\/contractor-bid-readiness\/vs-a-sticky-note-checklist\.html">/,
  );
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('the FAQPage JSON-LD answers are verbatim on the visible page (word for word, not just inside the script tag)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(visible.includes(acceptedAnswer.text), `answer not found verbatim outside the JSON-LD script tag: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the worked-example figures match model.mjs on the described scenario', async () => {
  const { assessBid } = await import('./model.mjs');

  const items = [
    { name: 'Bid bond', owner: 'You', status: 'ready', note: '' },
    { name: 'Certificate of insurance', owner: 'Agent', status: 'ready', note: '' },
    { name: 'References', owner: 'You', status: 'ready', note: '' },
    { name: 'Signed proposal form', owner: 'You', status: 'ready', note: '' },
    { name: 'Subcontractor MBE certification', owner: 'Subcontractor', status: 'blocked', note: 'waiting on renewal' },
  ];
  const result = assessBid(items, '2099-01-08', new Date('2099-01-06T09:00:00'));

  assert.equal(result.ready, false);
  assert.equal(result.missing.length, 1);
  assert.equal(result.blocked.length, 1);
  assert.equal(result.blocked[0].name, 'Subcontractor MBE certification');
  assert.equal(result.daysRemaining, 2);
  assert.equal(result.urgency, 'urgent');

  const readyCount = items.filter((i) => i.status === 'ready').length;
  assert.equal(readyCount, 4);
  assert.equal(((readyCount / items.length) * 100).toFixed(0), '80');

  assert.match(html, /4 of 5/);
  assert.match(html, /80%/);
  assert.match(html, /not ready/);
  assert.match(html, /urgent/);
  assert.match(html, /2 days/);
});

test('the comparison page links back to the checklist and to the days-remaining page', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="does-a-bid-due-today-count-as-a-day-remaining\.html"/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = docsPage('robots.txt');
  const sitemap = docsPage('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /vs-a-sticky-note-checklist\.html/);
});
