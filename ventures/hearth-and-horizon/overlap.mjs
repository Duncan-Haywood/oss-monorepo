// Which finished stories already use a subject, a calculation or a name?
// One call instead of a dozen greps over DONE.md (413 lines of long entries)
// and stories/ (406 files). Run records on 2026-11-13/14 reported the same
// cost again and again: checking a new proposal against finished work, and
// checking a character name is not already taken (Halina twice, Kowalczyk
// three times; doc friction, ventures/hearth-and-horizon/BIBLE.md).
//
//   node overlap.mjs peukert "heat index" WBGT     whole words, any case
//   node overlap.mjs hydram*                       a trailing * matches a prefix
//   node overlap.mjs --shelf for-other-minds Berkson
//   node overlap.mjs --titles leak                 title, setting, summary and
//                                                  DONE.md only, not story text
//   node overlap.mjs --unused [--shelf <id>] [--n 6]
//       draws subjects from subjects.txt that no finished story, DONE.md
//       entry or Next up proposal uses yet: the start of a new proposal when
//       a shelf runs empty (eight run records, 2026-11-14..17, each spent
//       several probes finding one).
//
// Each term prints the stories whose text, title, setting or summary contains
// it, and the DONE.md entries that mention it (by their title). Exit 0 always:
// a hit is information, not a failure.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadStories } from './generate.mjs';

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "- *(Done: Title, place, date ...)* numbers" plus its continuation lines.
// Each entry carries the shelf of the "## <shelf title>" section it sits in.
const SECTION_SHELF = { 'hearth & horizon': 'hearth-and-horizon', 'for other minds': 'for-other-minds', 'little lamps': 'little-lamps' };

export function doneEntries(text) {
  const out = [];
  let shelf = null;
  for (const line of text.split('\n')) {
    const h = line.match(/^## (.+)$/);
    if (h) { shelf = SECTION_SHELF[h[1].trim().toLowerCase()] ?? null; continue; }
    if (line.startsWith('- ')) {
      const m = line.match(/^- \*\(Done: ([^,]+?)(?:,|\.\)|\)\*)/);
      out.push({ title: m ? m[1].trim() : line.slice(2, 60), text: line, shelf });
    } else if (/^\s+\S/.test(line) && out.length) {
      out[out.length - 1].text += ' ' + line.trim();
    }
  }
  return out;
}

// Whole words, so "sump" does not match "assumption"; a trailing * keeps
// the prefix match ("hydram*" finds "hydrams").
export function termRe(term) {
  const prefix = term.endsWith('*');
  const core = escape(prefix ? term.slice(0, -1) : term);
  return new RegExp(`(?<![\\p{L}\\p{N}])${core}${prefix ? '' : '(?![\\p{L}\\p{N}])'}`, 'iu');
}

// titles: match title, setting and summary only. A common word ('leak',
// 'stair') hits twenty stories in passing; the summaries say which turn on it.
export function overlap(terms, stories, done, shelf = null, { titles = false } = {}) {
  return terms.map((term) => {
    const re = termRe(term);
    const pool = shelf ? stories.filter((s) => s.shelf === shelf) : stories;
    const inStories = pool
      .filter((s) => re.test([s.title, s.setting, s.summary, titles ? '' : s.body].join('\n')))
      .map((s) => ({ title: s.title, shelf: s.shelf, slug: s.slug }));
    const seen = new Set(inStories.map((s) => s.title.toLowerCase()));
    const inDone = done
      .filter((d) => (!shelf || !d.shelf || d.shelf === shelf))
      .filter((d) => re.test(d.text) && !seen.has(d.title.toLowerCase()))
      .map((d) => d.title);
    return { term, stories: inStories, done: inDone };
  });
}

// subjects.txt: "shelf | term, synonym, ... | angle". A candidate is free
// when none of its terms appears in a finished story or DONE.md entry (of
// its own shelf for Little Lamps, where a saint's name shared with a science
// fiction character is no overlap; of any shelf otherwise) or in the Next up
// section of BIBLE.md, where another run has already proposed it.
export function parseSubjects(text) {
  return text.split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [shelf, terms, angle = ''] = l.split('|').map((x) => x.trim());
      return { shelf, terms: terms.split(',').map((t) => t.trim()).filter(Boolean), angle };
    });
}

export function nextUpText(bible) {
  const parts = bible.split(/^## Next up$/m);
  return parts.length > 1 ? parts[1].split(/^## /m)[0] : '';
}

export function unusedSubjects(subjects, stories, done, nextUp, shelf = null) {
  return subjects
    .filter((c) => !shelf || c.shelf === shelf)
    .filter((c) => {
      const scope = c.shelf === 'little-lamps' ? c.shelf : null;
      const hits = overlap(c.terms, stories, done, scope);
      return hits.every((h) => !h.stories.length && !h.done.length) &&
        c.terms.every((t) => !termRe(t).test(nextUp));
    });
}

// A shuffled draw, so parallel runs reading the same pool rarely pick alike.
function draw(list, n) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const take = (flag, value) => {
    const i = args.indexOf(flag);
    if (i < 0) return null;
    const v = value ? args[i + 1] : true;
    args.splice(i, value ? 2 : 1);
    return v;
  };
  const shelf = take('--shelf', true);
  const unused = take('--unused', false);
  const titles = take('--titles', false);
  const n = Number(take('--n', true) ?? 6);
  const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  const done = doneEntries(read('DONE.md'));
  if (unused) {
    const pool = parseSubjects(read('subjects.txt'));
    const free = unusedSubjects(pool, loadStories(), done, nextUpText(read('BIBLE.md')), shelf);
    const shelves = [...new Set(pool.map((c) => c.shelf))].filter((x) => !shelf || x === shelf);
    for (const sh of shelves) {
      const mine = free.filter((c) => c.shelf === sh);
      console.log(`${sh}: ${mine.length} of ${pool.filter((c) => c.shelf === sh).length} candidates in subjects.txt still unused${mine.length < 5 ? ' (running low: add some, checked with this tool)' : ''}`);
      for (const c of draw(mine, n)) console.log(`  ${c.terms.join(', ')}: ${c.angle}`);
    }
    console.log('A candidate is a start, not a proposal: check its angle with node overlap.mjs --titles, work the numbers or sources, then write it under Next up.');
    process.exit(0);
  }
  if (!args.length) {
    console.error('usage: node overlap.mjs [--shelf <id>] [--titles] <term> [<term> ...]\n       node overlap.mjs --unused [--shelf <id>] [--n 6]');
    process.exit(2);
  }
  for (const r of overlap(args, loadStories(), done, shelf, { titles })) {
    const n = r.stories.length + r.done.length;
    console.log(`${r.term}: ${n ? `${n} hit(s)` : 'unused'}`);
    for (const s of r.stories.slice(0, 12)) console.log(`  ${s.title} [${s.shelf}] stories/${s.slug}.md`);
    if (r.stories.length > 12) console.log(`  ... +${r.stories.length - 12} more stories`);
    for (const t of r.done.slice(0, 6)) console.log(`  ${t} [DONE.md only]`);
  }
}
