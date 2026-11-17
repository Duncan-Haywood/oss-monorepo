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
//
// Each term prints the stories whose text, title, setting or summary contains
// it, and the DONE.md entries that mention it (by their title). Exit 0 always:
// a hit is information, not a failure.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadStories } from './generate.mjs';

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "- *(Done: Title, place, date ...)* numbers" plus its continuation lines.
export function doneEntries(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('- ')) {
      const m = line.match(/^- \*\(Done: ([^,]+?)(?:,|\.\)|\)\*)/);
      out.push({ title: m ? m[1].trim() : line.slice(2, 60), text: line });
    } else if (/^\s+\S/.test(line) && out.length) {
      out[out.length - 1].text += ' ' + line.trim();
    }
  }
  return out;
}

export function overlap(terms, stories, done, shelf = null) {
  return terms.map((term) => {
    // Whole words, so "sump" does not match "assumption"; a trailing * keeps
    // the prefix match ("hydram*" finds "hydrams").
    const prefix = term.endsWith('*');
    const core = escape(prefix ? term.slice(0, -1) : term);
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${core}${prefix ? '' : '(?![\\p{L}\\p{N}])'}`, 'iu');
    const pool = shelf ? stories.filter((s) => s.shelf === shelf) : stories;
    const inStories = pool
      .filter((s) => re.test([s.title, s.setting, s.summary, s.body].join('\n')))
      .map((s) => ({ title: s.title, shelf: s.shelf, slug: s.slug }));
    const seen = new Set(inStories.map((s) => s.title.toLowerCase()));
    const inDone = done
      .filter((d) => re.test(d.text) && !seen.has(d.title.toLowerCase()))
      .map((d) => d.title);
    return { term, stories: inStories, done: inDone };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let shelf = null;
  const i = args.indexOf('--shelf');
  if (i >= 0) { shelf = args[i + 1]; args.splice(i, 2); }
  if (!args.length) {
    console.error('usage: node overlap.mjs [--shelf <id>] <term> [<term> ...]');
    process.exit(2);
  }
  const done = doneEntries(readFileSync(new URL('DONE.md', import.meta.url), 'utf8'));
  for (const r of overlap(args, loadStories(), done, shelf)) {
    const n = r.stories.length + r.done.length;
    console.log(`${r.term}: ${n ? `${n} hit(s)` : 'unused'}`);
    for (const s of r.stories.slice(0, 12)) console.log(`  ${s.title} [${s.shelf}] stories/${s.slug}.md`);
    if (r.stories.length > 12) console.log(`  ... +${r.stories.length - 12} more stories`);
    for (const t of r.done.slice(0, 6)) console.log(`  ${t} [DONE.md only]`);
  }
}
