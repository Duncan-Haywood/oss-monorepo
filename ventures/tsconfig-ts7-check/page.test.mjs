import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseJsonc, checkConfig, REMOVED_IN_7, REMOVED_IN_55 } from './tsconfig7.mjs';

// Strip markup until stable, case-insensitive, tolerant of attributes in closing tags.
const stripTags = (s, sub = '') => { let p; do { p = s; s = s.replace(/<[^>]*>/g, sub); } while (s !== p); return s; };

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const html = read('./index.html');
const ld = (src) => [...src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const unhtml = (s) => stripTags(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

test('JSON-LD parses: SoftwareApplication (free) and FAQPage', () => {
  const blocks = ld(html);
  assert.equal(blocks.find((b) => b['@type'] === 'SoftwareApplication').offers.price, '0');
  assert.ok(blocks.find((b) => b['@type'] === 'FAQPage').mainEntity.length >= 4);
});

test('every FAQ answer in the schema is also visible on the page, word for word', () => {
  for (const q of ld(html).find((b) => b['@type'] === 'FAQPage').mainEntity) {
    const h = `<h3>${q.name}</h3>`;
    assert.ok(html.includes(h), q.name);
    assert.equal(unhtml(html.split(h)[1].split('</p>')[0]).trim(), q.acceptedAnswer.text, q.name);
  }
});

test('the FAQ list of removed options names every option the rules remove', () => {
  const faq = ld(html).find((b) => b['@type'] === 'FAQPage').mainEntity[0].acceptedAnswer.text.toLowerCase();
  for (const r of REMOVED_IN_7) assert.ok(faq.includes(r.option.toLowerCase()), r.option);
  for (const w of ['es5', 'node10', 'classic', 'amd', 'umd', 'system', 'none', 'ts5023', 'ts6046']) assert.ok(faq.includes(w), w);
});

test('no-warranty clause, sponsor link, licence, privacy line and opt-out', () => {
  assert.match(html, /provided free and as-is, without warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /MIT licence/);
  assert.match(html, /never uploaded/);
  assert.match(html, /id="usageOptOut"/);
});

test("the page's example is the bundled legacy fixture, and TypeScript 7 rejects five of its options", () => {
  const example = html.match(/const EXAMPLE = `([\s\S]*?)`;/)[1];
  const fixture = read('./eval/corpus/synthetic/node-commonjs-legacy.jsonc');
  assert.deepEqual(parseJsonc(example).value, parseJsonc(fixture).value);
  assert.equal(checkConfig(parseJsonc(example).value).summary.errors, 5);
  const row = JSON.parse(read('./eval/results.json')).rows.find((r) => r.id === 'synthetic/node-commonjs-legacy.jsonc');
  assert.equal(row.tsc7Removed.length, 5);
});

test('the page states the eval numbers that results.json holds', () => {
  const { summary, rows } = JSON.parse(read('./eval/results.json'));
  assert.match(html, new RegExp(`Checked against ${summary.configs} real and hand-written configs`));
  const bases = rows.filter((r) => r.id.startsWith('tsconfig-bases/'));
  const pkgs = new Set(bases.map((r) => r.id.replace(/^tsconfig-bases\/(.*)-\d[\d.]*\.jsonc$/, '$1')));
  assert.match(html, new RegExp(`${bases.length} versions of the ${pkgs.size} <code>@tsconfig/bases</code> packages`));
  assert.equal(summary.agree, summary.configs);
  assert.equal(summary.suggestionsClean, summary.configs);
});

test('the table lists every 5.5-removed option', () => {
  for (const r of REMOVED_IN_55) if (r.option !== 'target') assert.ok(html.includes(`<code>${r.option}</code>`), r.option);
});

test('the footer links its siblings one hop away (cyclehound links back)', () => {
  assert.match(html, /href="\.\.\/cyclehound\/"/);
  assert.match(html, /href="\.\.\/package-exports-drift-check\/"/);
});
