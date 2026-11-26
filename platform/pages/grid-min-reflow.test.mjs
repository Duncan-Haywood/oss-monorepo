// A responsive card grid must not set a column minimum wider than a small
// phone's card: `repeat(auto-fit|auto-fill, minmax(Npx, 1fr))` with N of 260 or
// more is written `minmax(min(Npx, 100%), 1fr)`.
//
// WHY: `auto-fit` drops to one column when the box is narrower than two
// minimums, but never narrower than one. A 300 px minimum inside a card on a
// 320 px screen (16 px page gutters plus the card's own padding leave about
// 250 px) makes the single column 300 px wide, and the whole page scrolls
// sideways. WCAG 2.2 1.4.10 (Reflow) asks for no sideways scroll at 320 CSS px.
// On 2026-11-19 a Playwright sweep of all 1,414 built venture pages at 320 px
// found 21 that scrolled sideways; 19 were this pattern (minimums of 260 to
// 300 px, most at exactly 339 px of scrollWidth). `min(Npx, 100%)` is the same
// track wherever the box is at least N wide, so desktop and tablet layouts do
// not change. Minimums under 260 px overflowed nowhere in the sweep and are
// left alone. Report: docs/reports/polish-2026-11-19-reflow-320.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MAX_FIXED_MIN_PX = 259;

/** Every `repeat(auto-fit|auto-fill, minmax(Npx …` with N above the limit, as `{ px, line }`. */
export function wideGridMinimums(text, limit = MAX_FIXED_MIN_PX) {
  const out = [];
  const re = /repeat\(\s*auto-(?:fit|fill)\s*,\s*minmax\(\s*(\d+(?:\.\d+)?)px/g;
  let m;
  while ((m = re.exec(text))) {
    const px = Number(m[1]);
    if (px > limit) out.push({ px, line: text.slice(0, m.index).split('\n').length });
  }
  return out;
}

test('wideGridMinimums: the defect, the fix, and narrow minimums', () => {
  assert.deepEqual(wideGridMinimums('.g{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}'), [{ px: 300, line: 1 }]);
  assert.deepEqual(wideGridMinimums('.g{grid-template-columns: repeat( auto-fill , minmax( 260px , 1fr ))}'), [{ px: 260, line: 1 }]);
  assert.deepEqual(wideGridMinimums('.g{grid-template-columns:repeat(auto-fit,minmax(min(300px, 100%),1fr))}'), []);
  assert.deepEqual(wideGridMinimums('.g{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}'), []);
  // a fixed count of columns is a different layout, not this check's business
  assert.deepEqual(wideGridMinimums('.g{grid-template-columns:repeat(2,minmax(300px,1fr))}'), []);
  assert.deepEqual(wideGridMinimums('a\nb\n.g{grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}'), [{ px: 320, line: 3 }]);
});

test('no venture, research or site page sets an auto-fit grid minimum wider than a small phone', () => {
  const files = execFileSync('git', ['ls-files', '-z', '--', 'ventures', 'research', 'platform'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter((f) => /\.(html|css|mjs|js)$/.test(f) && !/(^|\/)(node_modules|dist)\//.test(f) && !f.endsWith('grid-min-reflow.test.mjs') && !f.startsWith('ventures/paid-apps/')); // paid apps: own deploy and CI, not catalogue pages
  const bad = [];
  for (const f of files) {
    let text;
    try {
      text = readFileSync(join(ROOT, f), 'utf8');
    } catch {
      continue; // listed but absent in a sparse checkout
    }
    if (!text.includes('minmax(')) continue;
    for (const { px, line } of wideGridMinimums(text)) {
      bad.push(`${f}:${line}: minmax(${px}px, …) in an auto-fit grid; write minmax(min(${px}px, 100%), …) so one column fits a 320 px phone`);
    }
  }
  assert.deepEqual(bad, []);
});
