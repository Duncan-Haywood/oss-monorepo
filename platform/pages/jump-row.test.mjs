// The jump row and guide list are one shared component (jump-row.mjs), carried
// by pf-chrome.css. Ten tool pages used to carry their own copy of the CSS and
// the copies drifted (docs/reports/polish-2026-11-13-shared-jump-row.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JUMP_ROW_CSS } from './jump-row.mjs';
import { renderChromeStyle } from './build.mjs';

const VENTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ventures');

function ventureIndexes() {
  return fs.readdirSync(VENTURES).sort()
    .map((slug) => [slug, path.join(VENTURES, slug, 'index.html')])
    .filter(([, file]) => fs.existsSync(file))
    .map(([slug, file]) => [slug, fs.readFileSync(file, 'utf8')]);
}

test('the shared jump row rides in the chrome stylesheet every tool page links', () => {
  assert.ok(renderChromeStyle().includes(JUMP_ROW_CSS));
  for (const sel of ['.pf-jump{', '.pf-jump a{', '.pf-jump a:focus-visible{', '.pf-jump a.pf-jump-main{', '.pf-guide-list{', '.pf-guide-list.pf-cols{']) {
    assert.ok(JUMP_ROW_CSS.includes(sel), `missing ${sel}`);
  }
});

test('the main pill never falls back to currentColor (its own text is white: white on white)', () => {
  const rule = JUMP_ROW_CSS.match(/\.pf-jump a\.pf-jump-main\{([^}]*)\}/)[1];
  assert.doesNotMatch(rule, /currentColor/);
  assert.match(rule, /color:var\(--jump-on,#fff\)/);
});

test('every pill keeps its 34px target (32px plus borders, as the page copies had) and a visible focus ring', () => {
  assert.match(JUMP_ROW_CSS, /\.pf-jump a\{[^}]*min-height:34px/);
  assert.match(JUMP_ROW_CSS, /\.pf-jump a:focus-visible\{outline:3px solid/);
});

test('no tool page carries its own copy of the pill or guide-list CSS', () => {
  const copies = [];
  for (const [slug, html] of ventureIndexes()) {
    const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
    if (/\.jump\s+(?:nav\s+)?a\s*\{[^}]*border-radius:\s*999px/.test(css)) copies.push(`${slug}: .jump pill rule`);
    if (/\.guide-list\b[^{]*\{/.test(css)) copies.push(`${slug}: .guide-list rule`);
  }
  assert.deepEqual(copies, [], 'Use <nav class="pf-jump"> / <ul class="pf-guide-list"> and set colours with --jump-* custom properties (jump-row.mjs).');
});

test('pf-jump-main is only used inside a pf-jump row', () => {
  const bad = [];
  for (const [slug, html] of ventureIndexes()) {
    for (const m of html.matchAll(/class="[^"]*\bpf-jump-main\b/g)) {
      const before = html.slice(0, m.index);
      const open = before.lastIndexOf('class="pf-jump"');
      const close = before.lastIndexOf('</nav>');
      if (open < 0 || close > open) bad.push(slug);
    }
  }
  assert.deepEqual(bad, []);
});
