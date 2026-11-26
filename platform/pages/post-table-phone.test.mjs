// Post tables on a phone: tighter cell padding and hyphenation, phone-only.
// Why and the measurements: the comment on PHONE_TABLE_CSS in writing.mjs and
// docs/reports/polish-2026-11-19-phone-table-cells.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildWriting, PHONE_TABLE_CSS, WRITING_PATH, WRITING_STYLE_FILE } from './writing.mjs';

const POST = '---\ntitle: "T"\ndate: 2026-11-19\ndescription: "D."\ntags: [notes]\n---\n\n# T\n\n| a | b | c | d |\n|---|---|---|---|\n| 1 | 2 | 3 | 4 |\n';

async function builtPost() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ptp-'));
  mkdirSync(path.join(root, 'docs/posts'), { recursive: true });
  writeFileSync(path.join(root, 'docs/posts/2026-11-19-t.md'), POST);
  const out = mkdtempSync(path.join(os.tmpdir(), 'ptp-out-'));
  await buildWriting(out, 'https://example.test/', { root });
  const html = readFileSync(path.join(out, WRITING_PATH, 't/index.html'), 'utf8');
  // The blog's rules live in one stylesheet at the site root since 2026-11-26;
  // follow the page's own link to it, as a browser would.
  const href = html.match(new RegExp(`<link rel="stylesheet" href="([^"]*${WRITING_STYLE_FILE})">`))?.[1];
  assert.ok(href, `the post links ${WRITING_STYLE_FILE}`);
  const css = readFileSync(path.resolve(path.join(out, WRITING_PATH, 't'), href), 'utf8');
  return { html, css };
}

test('the rule is phone-only, so desktop tables keep their layout', () => {
  const m = PHONE_TABLE_CSS.match(/^@media \(max-width:(\d+)px\) \{(.*)\}$/);
  assert.ok(m, 'one max-width media query wraps every declaration');
  assert.ok(Number(m[1]) <= 480, 'no wider than a large phone');
  assert.match(m[2], /\bth, td \{[^}]*padding:6px/);
  assert.match(m[2], /\bhyphens:auto/);
  // Breaking anywhere splits figures like $2,853.20 across lines.
  assert.doesNotMatch(PHONE_TABLE_CSS, /overflow-wrap:anywhere|word-break/);
});

test('a built post carries the rule after the base cell padding, with lang="en" for hyphenation', async () => {
  const { html, css } = await builtPost();
  assert.match(html, /<html lang="en"/);
  const base = css.indexOf('th, td { text-align:left; padding:7px 10px');
  const phone = css.indexOf(PHONE_TABLE_CSS);
  assert.ok(base > 0 && phone > base, 'the phone rule follows (and so overrides) the base rule');
  assert.match(html, /<table/);
});
