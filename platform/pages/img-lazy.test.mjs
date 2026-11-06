// Every <img> after the first in a venture page must say how it loads.
//
// WHY: the first image may be above the fold and should load eagerly; every
// later one without `loading` blocks nothing but still fetches at once. A scan
// on 2026-11-04 found two such covers on Hearth & Horizon (fixed in its
// generator, docs/reports/polish-2026-11-04-hearth-covers-lazy.md). This keeps
// the class fixed. Markup inside script/style/pre/code/template and comments
// is ignored (example text, runtime canvases).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VENTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ventures');

export function eagerLaterImages(html) {
  const text = html
    .replace(/<(script|style|pre|code|template)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const imgs = [...text.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  return imgs.filter((t, i) => i > 0 && !/\bloading\s*=/.test(t));
}

test('the scanner flags a later img without loading and spares the first', () => {
  const html = '<img src="a.png"><img src="b.png"><img src="c.png" loading="lazy"><pre><img src="d.png"></pre>';
  assert.deepEqual(eagerLaterImages(html), ['<img src="b.png">']);
});

test('no venture index.html has a later <img> without a loading attribute', () => {
  let checked = 0;
  const bad = [];
  for (const d of readdirSync(VENTURES)) {
    const f = join(VENTURES, d, 'index.html');
    if (!existsSync(f)) continue;
    checked++;
    for (const t of eagerLaterImages(readFileSync(f, 'utf8'))) bad.push(`${d}: ${t.slice(0, 90)}`);
  }
  assert.ok(checked >= 100, `scanned only ${checked} pages`);
  assert.deepEqual(bad, [], 'add loading="lazy" decoding="async" in the generator, then regenerate');
});
