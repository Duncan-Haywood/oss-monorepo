// The shared footer's page-view counter disclosure. Until 2026-11-14 it was
// one 110-word sentence with semicolons inside parentheses, most of the
// Privacy section's height on a phone; it is now one short sentence and a
// two-item list (what is counted, what is never stored), with every fact
// kept. polish-2026-11-14-counter-list.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { disclaimerHtml } from './build.mjs';

const words = (html) => html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

test('with the counter on, the footer lists what is counted and what is never stored', () => {
  const html = disclaimerHtml('./', [], { counter: true });
  const [, list] = html.match(/<ul class="pfs-counted">([\s\S]*?)<\/ul>/) ?? [];
  assert.ok(list, 'no counted/never-stored list');
  const items = [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => text(m[1]));
  assert.equal(items.length, 2);
  for (const fact of ['which page', 'which day', 'channel', 'never its address', 'two-letter code', 'phone, tablet or desktop']) {
    assert.ok(items[0].includes(fact), `counted item lost "${fact}"`);
  }
  for (const fact of ['anything you type', 'cookie', 'IP address', 'any web server']) {
    assert.ok(items[1].includes(fact), `never-stored item lost "${fact}"`);
  }
  for (const item of items) assert.ok(words(item) <= 50, `list item is ${words(item)} words: ${item}`);
  const all = text(html);
  assert.match(all, /daily per-page total on our own open-source counter/);
  assert.match(all, /totals are published in the repository/);
  // Since 2026-11-24 the anonymous total includes DNT/GPC browsers; the copy
  // must say so rather than keep the old "not counted at all" promise.
  assert.doesNotMatch(all, /not counted at all/);
  assert.match(all, /includes browsers sending Do Not Track or Global Privacy Control/);
  assert.match(all, /opt-out at the foot of the tool list stops it/);
  // No paragraph in the Privacy section runs past ~60 words again.
  const privacy = html.slice(html.indexOf('<h2>Privacy</h2>'));
  for (const [, p] of privacy.matchAll(/<p>([\s\S]*?)<\/p>/g)) {
    assert.ok(words(p) < 70, `a Privacy paragraph is ${words(p)} words: ${text(p).slice(0, 80)}…`);
  }
});

test('with the counter off, the footer has no counter list but keeps the Do Not Track line', () => {
  const html = disclaimerHtml('./', [], { counter: false });
  assert.doesNotMatch(html, /pfs-counted|per-page total/);
  assert.match(text(html), /Do Not Track or Global Privacy Control are not counted at all/);
  assert.equal((html.match(/<p>/g) ?? []).length, (html.match(/<\/p>/g) ?? []).length, 'unbalanced <p>');
});
