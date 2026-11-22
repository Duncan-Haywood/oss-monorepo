// On a "*-to-journal" page the file picker comes straight after the first
// card's heading, and the card's note about where the file comes from and
// which columns are read sits just below the picker, tied to it with
// aria-describedby so a screen reader still hears it on focus.
//
// WHY: on 2026-11-22 that note (25 to 81 words, 4 to 8 phone lines) sat
// between the card heading and the picker, and only 7 of the 25 pages showed
// the picker on a 390x844 screen (3 of 25 at 360 px wide). With the note moved
// below the picker it is 24 of 25 (23 at 360). Nothing was hidden or cut: the
// header lede already says where to download the file, so a returning visitor
// gets the picker first and a new one reads the note right under it.
// venture-fold-baseline.json ratchets the pixel position; this test keeps the
// order. Report: docs/reports/polish-2026-11-22-journal-file-note.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VENTURES = join(ROOT, 'ventures');

/** Problems with the first card of a journal page, [] when it is in order. */
export function journalCardProblems(html) {
  const card = /<section class="card">([\s\S]*?)<\/section>/.exec(html);
  if (!card) return ['no first card'];
  const c = card[1];
  const out = [];
  const afterH2 = /<\/h2>\s*(<[a-z]+\b[^>]*>)/.exec(c);
  if (!afterH2 || !/^<label for="file"/.test(afterH2[1])) out.push('first element after the card heading is not the file label');
  if (!/<input type="file" id="file"[^>]*aria-describedby="file-note"/.test(c)) out.push('file input lacks aria-describedby="file-note"');
  if (!/<input type="file"[^>]*>\s*<p class="note file-note" id="file-note">/.test(c)) out.push('the file note does not follow the file input');
  return out;
}

test('journalCardProblems flags a note above the picker', () => {
  const bad = '<section class="card"><h2>1. X</h2><p class="note">cols</p><label for="file">F</label><input type="file" id="file"></section>';
  assert.equal(journalCardProblems(bad).length, 3);
  const good = '<section class="card"><h2>1. X</h2>\n<label for="file">F</label>\n<input type="file" id="file" aria-describedby="file-note" accept=".csv">\n<p class="note file-note" id="file-note">cols</p></section>';
  assert.deepEqual(journalCardProblems(good), []);
});

test('every *-to-journal page puts its file picker first in the card', () => {
  const slugs = readdirSync(VENTURES).filter((s) => s.endsWith('-to-journal') && existsSync(join(VENTURES, s, 'index.html')));
  assert.ok(slugs.length >= 20, `expected the journal family, found ${slugs.length}`);
  const bad = slugs.flatMap((s) => journalCardProblems(readFileSync(join(VENTURES, s, 'index.html'), 'utf8')).map((p) => `${s}: ${p}`));
  assert.deepEqual(bad, []);
});
