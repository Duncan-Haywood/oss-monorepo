// A venture hero that folds its detail into `details.hero-more` keeps the
// visible lede short: at most 50 words in the `p.lede` before the fold.
//
// WHY: the fold exists so a phone visitor reaches the tool. On 2026-11-21 the
// 25 "*-to-journal" pages had a 62 to 100 word intro of 9 to 15 phone lines and
// their first tool card sat below a 390x844 screen on 15 of 25 (0 of 25 at
// 360x780). Each now shows its first sentence and folds the rest ("What it
// books and checks"); this test keeps a later edit from growing the lede back
// while the fold stays. flagship-hero-order.test.mjs holds flagships to the
// same 50 words. Report: docs/reports/polish-2026-11-21-eyebrow-names.md.
//
// A page with an answer-first lead (`p[data-answer-lead]`, the AEO pilot in
// answer-lead.test.mjs) may fold right after that lead instead: the lead is
// the sourced fact assistants quote and stays whole and visible, and the plain
// intro that followed it goes into the fold. 37 finance and fee calculators
// did this on 2026-11-21 (docs/reports/polish-2026-11-21-answer-lead-fold.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VENTURES = join(ROOT, 'ventures');
export const MAX_LEDE_WORDS = 50;

/** For a page whose first <header> holds a hero fold: { lede words, fold follows lede }. Else null. */
export function heroFold(html) {
  const body = html.indexOf('<body');
  if (body < 0) return null;
  const hm = /<header\b[^>]*>([\s\S]*?)<\/header>/.exec(html.slice(body));
  if (!hm || !/<details class="hero-more"/.test(hm[1])) return null;
  if (/<p\b[^>]*data-answer-lead[^>]*>(?:(?!<\/p>)[\s\S])*<\/p>\s*<details class="hero-more"/.test(hm[1])) {
    return { words: 0, adjacent: true, answerLead: true };
  }
  const lm = /<p class="lede"[^>]*>([\s\S]*?)<\/p>(\s*)(<details class="hero-more")?/.exec(hm[1]);
  if (!lm) return { words: null, adjacent: false };
  const words = lm[1].replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return { words, adjacent: Boolean(lm[3]) };
}

test('heroFold reads the lede before the fold', () => {
  const h = (inner) => `<body><header><h1>t</h1>${inner}</header><main>`;
  assert.deepEqual(heroFold(h('<p class="lede">Paste <strong>it</strong> here.</p>\n<details class="hero-more"><summary>s</summary></details>')), { words: 3, adjacent: true });
  assert.equal(heroFold(h('<p>no fold</p>')), null);
  assert.deepEqual(heroFold(h('<details class="hero-more"></details>')), { words: null, adjacent: false });
  assert.deepEqual(heroFold(h('<p class="answer-source" data-answer-lead>Fact. Source: X. As of 2026-11-21.</p>\n<details class="hero-more"><summary>s</summary></details>')), { words: 0, adjacent: true, answerLead: true });
  assert.deepEqual(heroFold(h('<p class="answer-source" data-answer-lead>Fact.</p><p>gap</p><details class="hero-more"></details>')), { words: null, adjacent: false });
});

test(`every venture hero with a fold has a lede of at most ${MAX_LEDE_WORDS} words right before it`, () => {
  const bad = [];
  let seen = 0;
  for (const slug of readdirSync(VENTURES)) {
    const p = join(VENTURES, slug, 'index.html');
    if (!existsSync(p)) continue;
    const f = heroFold(readFileSync(p, 'utf8'));
    if (!f) continue;
    seen++;
    if (f.words === null) bad.push(`${slug}: fold without a p.lede`);
    else if (f.words > MAX_LEDE_WORDS) bad.push(`${slug}: lede is ${f.words} words`);
    else if (!f.adjacent) bad.push(`${slug}: the fold does not follow the lede`);
  }
  assert.ok(seen >= 25, `expected at least the 25 journal pages, saw ${seen}`);
  assert.deepEqual(bad, []);
});
