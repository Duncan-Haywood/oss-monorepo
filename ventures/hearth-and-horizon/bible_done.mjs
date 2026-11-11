// Moves finished proposals ("- *(Done: ...)*" entries) out of BIBLE.md's
// "Next up" list into DONE.md, under the same shelf headings, so "Next up"
// shows only what is still proposed. By 2026-11-11 the list held 291 Done
// entries and three open ones; three run records that day said finding an
// open proposal took grepping (doc friction, ventures/hearth-and-horizon/BIBLE.md).
//
//   node bible_done.mjs           move every Done entry, print how many
//   node bible_done.mjs --check   exit 1 if BIBLE.md still holds one
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadStories } from './generate.mjs';
import { SHELVES } from './stories.mjs';

const HERE = new URL('./', import.meta.url);
const BIBLE = new URL('BIBLE.md', HERE);
const DONE = new URL('DONE.md', HERE);

const DONE_HEAD = `# Finished proposals

Proposals from [BIBLE.md](BIBLE.md)'s "Next up" list that became stories,
oldest first within each shelf, with the numbers each story was built on.
Read them before proposing, so a new story does not repeat a setting or a
calculation. \`node bible_done.mjs\` moves new Done entries here.
`;

// Take every Done entry out of BIBLE.md. Most sit in "Next up", but runs have
// also appended them under "The three shelves" and "What not to do". An entry is a "- " line plus
// its indented continuation lines. Its shelf is the shelf of the story whose
// title it starts with (shelfOf gets the text after "Done: "), else the "**Shelf**" heading above it.
export function split(bible, shelfOf = () => undefined) {
  const lines = bible.split('\n');
  const kept = [];
  const moved = []; // { shelf, lines }
  let shelf = 'Hearth & Horizon';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = line.match(/^\*\*([^*]+)\*\*/);
    if (heading) shelf = heading[1];
    if (line.startsWith('- ')) {
      const entry = [line];
      while (i + 1 < lines.length && /^ {2}\S/.test(lines[i + 1])) entry.push(lines[++i]);
      const done = line.match(/^- \*\(Done: (.*)/);
      if (done) moved.push({ shelf: shelfOf(done[1]) || shelf, lines: entry });
      else kept.push(...entry);
      continue;
    }
    kept.push(line);
  }
  const rest = kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+(\n## )/g, '\n$1');
  return { bible: rest, moved };
}

// Append entries to DONE.md under "## <shelf>", creating the heading if needed.
export function appendDone(done, moved) {
  let text = done || DONE_HEAD;
  for (const { shelf, lines } of moved) {
    const head = `## ${shelf}`;
    const at = text.split('\n').indexOf(head);
    if (at < 0) {
      text = `${text.trimEnd()}\n\n${head}\n\n${lines.join('\n')}\n`;
      continue;
    }
    const all = text.split('\n');
    let end = all.findIndex((l, i) => i > at && l.startsWith('## '));
    if (end < 0) end = all.length;
    while (end > at + 1 && all[end - 1] === '') end--;
    all.splice(end, 0, ...lines);
    text = all.join('\n');
  }
  return text.endsWith('\n') ? text : `${text}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const stories = loadStories().sort((a, b) => b.title.length - a.title.length); // longest title first
  const shelfOf = (text) => {
    const story = stories.find((st) => text.toLowerCase().startsWith(st.title.toLowerCase()));
    return story && SHELVES.find((sh) => sh.id === story.shelf)?.title;
  };
  const { bible, moved } = split(readFileSync(BIBLE, 'utf8'), shelfOf);
  if (process.argv.includes('--check')) {
    if (moved.length) {
      console.error(`BIBLE.md holds ${moved.length} Done entr${moved.length === 1 ? 'y' : 'ies'}: run node ventures/hearth-and-horizon/bible_done.mjs`);
      process.exit(1);
    }
    console.log('ok: no Done entries in BIBLE.md');
  } else {
    writeFileSync(DONE, appendDone(existsSync(DONE) ? readFileSync(DONE, 'utf8') : '', moved));
    writeFileSync(BIBLE, bible);
    console.log(`moved ${moved.length} Done entr${moved.length === 1 ? 'y' : 'ies'} to DONE.md`);
  }
}
