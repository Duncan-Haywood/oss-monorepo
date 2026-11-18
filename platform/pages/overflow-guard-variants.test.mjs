// The hand-pasted `mobile-overflow-guard` style block (see
// docs/reports/polish-2026-11-09-overflow-guard-variants.md) exists in two
// known forms. A third form means someone hand-edited one copy; fold it into
// pf-chrome.css or one of the two instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const KNOWN = new Set([
  '<style>/* mobile-overflow-guard */table{position:relative;display:block;max-width:100%;min-width:0!important;overflow-x:auto}code{overflow-wrap:anywhere}pre{max-width:100%;overflow-x:auto}fieldset,section,form,div,main{min-width:0}input,select,textarea{max-width:100%}</style>',
  '<style>/* mobile-overflow-guard */table{position:relative;display:block;max-width:100%;overflow-x:auto}</style>',
]);

test('mobile-overflow-guard blocks in ventures/*/index.html are one of the two known forms', () => {
  const root = new URL('../../ventures/', import.meta.url).pathname;
  const odd = [];
  for (const d of readdirSync(root)) {
    const f = join(root, d, 'index.html');
    let s;
    try { if (!statSync(f).isFile()) continue; s = readFileSync(f, 'utf8'); } catch { continue; }
    for (const m of s.matchAll(/<style>\/\* mobile-overflow-guard \*\/[^<]*<\/style>/g)) {
      if (!KNOWN.has(m[0])) odd.push(f);
    }
  }
  assert.deepEqual(odd, []);
});
