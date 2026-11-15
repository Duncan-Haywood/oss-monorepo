// Moves finished entries ("- *(Done: episode N, ...)*" lines) out of
// PRODUCTION.md's "The episode list" into DONE.md, so the list shows only what
// is still proposed. By 2026-11-15 the list held 112 Done lines above one open
// "Next up, suggestions" line; three run records (2026-11-13 to 11-15) said
// finding the open items took a grep. Hearth & Horizon's bible_done.mjs does
// the same for BIBLE.md.
//
//   node list_done.mjs           move every Done entry, print how many
//   node list_done.mjs --check   exit 1 if PRODUCTION.md still holds one
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = new URL('./', import.meta.url);
const PRODUCTION = new URL('PRODUCTION.md', HERE);
const DONE = new URL('DONE.md', HERE);

export const DONE_HEAD = `# Finished episodes

Entries from [PRODUCTION.md](PRODUCTION.md)'s episode list that became
episodes, in the order they were finished, each with the sources it used and
what it left for another night. Read them before proposing, so a new episode
does not retell a story or miss a sequel it promised. \`node list_done.mjs\`
moves new Done entries here.
`;

const DONE_RE = /^- \*\(Done: /;

// Take every Done entry (a "- " line plus its indented continuation lines) out
// of the markdown. Only entries whose first line starts "- *(Done: " move: the
// marker quoted mid-sentence (as in the list's own instructions) stays.
export function split(text) {
  const lines = text.split('\n');
  const kept = [];
  const moved = [];
  for (let i = 0; i < lines.length; i++) {
    if (!DONE_RE.test(lines[i])) {
      kept.push(lines[i]);
      continue;
    }
    const entry = [lines[i]];
    while (i + 1 < lines.length && /^ {2}\S/.test(lines[i + 1])) entry.push(lines[++i]);
    moved.push(entry);
  }
  return { production: kept.join('\n').replace(/\n{3,}/g, '\n\n'), moved };
}

// Append entries to the end of DONE.md (creating it with its heading).
export function appendDone(done, moved) {
  const text = (done || DONE_HEAD).trimEnd();
  if (!moved.length) return `${text}\n`;
  const sep = /^(- | {2}\S)/.test(text.split('\n').pop()) ? '\n' : '\n\n'; // inside a list or after the heading
  return `${text}${sep}${moved.map((e) => e.join('\n')).join('\n')}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { production, moved } = split(readFileSync(PRODUCTION, 'utf8'));
  const n = `${moved.length} Done entr${moved.length === 1 ? 'y' : 'ies'}`;
  if (process.argv.includes('--check')) {
    if (moved.length) {
      console.error(`PRODUCTION.md holds ${n}: run node ventures/saints-by-candlelight/list_done.mjs`);
      process.exit(1);
    }
    console.log('ok: no Done entries in PRODUCTION.md');
  } else {
    writeFileSync(DONE, appendDone(existsSync(DONE) ? readFileSync(DONE, 'utf8') : '', moved));
    writeFileSync(PRODUCTION, production);
    console.log(`moved ${n} to DONE.md`);
  }
}
