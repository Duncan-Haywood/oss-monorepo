// The answer-first lead's look is one shared rule (answer-lead-style.mjs), carried
// by pf-chrome.css. Until 2026-11-13 one lead page inlined its own border and the
// other 54 had no style at all (docs/reports/polish-2026-11-13-answer-lead-style.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANSWER_LEAD_CSS } from './answer-lead-style.mjs';
import { renderChromeStyle } from './build.mjs';

const VENTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ventures');

function leadTags() {
  const out = [];
  for (const slug of fs.readdirSync(VENTURES).sort()) {
    const file = path.join(VENTURES, slug, 'index.html');
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    for (const m of html.matchAll(/<[a-z]+\b[^>]*\bdata-answer-lead\b[^>]*>/gi)) out.push([slug, m[0], html]);
  }
  return out;
}

test('the lead style rides in the chrome stylesheet every tool page links', () => {
  assert.ok(renderChromeStyle().includes(ANSWER_LEAD_CSS));
  assert.match(ANSWER_LEAD_CSS, /\.answer-source\{/);
});

test('the lead never sets its own text colour (contrast stays the page\'s own)', () => {
  assert.doesNotMatch(ANSWER_LEAD_CSS, /(^|[;{])\s*color:/);
});

test('the tint stays faint enough not to cost contrast (at most 8% of the text colour)', () => {
  const tints = [...ANSWER_LEAD_CSS.matchAll(/background:var\(--lead-bg,color-mix\(in srgb,currentColor (\d+)%/g)].map((m) => Number(m[1]));
  assert.ok(tints.length > 0, 'expected a currentColor tint fallback');
  for (const t of tints) assert.ok(t <= 8, `tint ${t}% is too strong`);
});

test('every lead carries the shared class and no inline style or page copy of the rule', () => {
  const bad = [];
  const seen = new Set();
  for (const [slug, tag, html] of leadTags()) {
    if (!/class="[^"]*\banswer-source\b/.test(tag)) bad.push(`${slug}: lead without class="answer-source"`);
    if (/\sstyle="/.test(tag)) bad.push(`${slug}: inline style on the lead`);
    if (seen.has(slug)) continue;
    seen.add(slug);
    const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
    if (/\.answer-source\b[^{]*\{/.test(css)) bad.push(`${slug}: page copy of the .answer-source rule`);
  }
  assert.ok(seen.size >= 50, `expected the ~55 lead pages, found ${seen.size}`);
  assert.deepEqual(bad, [], 'Style leads through pf-chrome.css; set --lead-line / --lead-bg to change colours (answer-lead-style.mjs).');
});
