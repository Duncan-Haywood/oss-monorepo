// One parser for a Sed Contra episode script, shared by the site generator,
// the quote checker, the tests and the media renderer (`render.py` reads
// `node generate.mjs --segments <slug>`).
//
// Script format (episodes/NNN-<slug>.md):
//   ---\n{ JSON front matter }\n---
//   ## Chapter title {#id}          a chapter of the long-form episode
//   ## Short: Title {#short-id}     a vertical short, kept out of the long form
//   SPEAKER: text                   one spoken paragraph; SPEAKER is a key of `cast`
//   READER [I-q2-a3]: text          a verbatim quote, checked against sources/I-q2-a3.txt;
//                                   " … " marks a cut, each piece must appear in order
import { readFileSync } from 'node:fs';
import path from 'node:path';

const LINE = /^([A-Z][A-Z ]*?)(?: \[([A-Za-z0-9-]+)\])?: (.+)$/;
const HEAD = /^## (Short: )?(.+?) \{#([a-z0-9-]+)\}$/;

export function parseEpisode(text, file = 'episode') {
  const m = text.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing --- front matter ---`);
  const meta = JSON.parse(m[1]);
  const chapters = [];
  const shorts = [];
  let current = null;
  m[2].split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const h = line.match(HEAD);
    if (h) {
      current = { id: h[3], title: h[2], segments: [] };
      (h[1] ? shorts : chapters).push(current);
      return;
    }
    const l = line.match(LINE);
    if (!l || !current) throw new Error(`${file}:${i + 1}: expected "SPEAKER: text" under a ## heading, got: ${line.slice(0, 60)}`);
    current.segments.push({ speaker: l[1], source: l[2] || null, text: l[3] });
  });
  return { ...meta, chapters, shorts };
}

/** Text as compared for quotes: one space, no Gutenberg _italic_ marks, straight quotes. */
export function normalise(s) {
  return s.replace(/_/g, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/--/g, '—').replace(/\s+/g, ' ').trim();
}

export function sourceText(root, id) {
  const raw = readFileSync(path.join(root, 'sources', `${id}.txt`), 'utf8');
  return normalise(raw.split('\n---\n').slice(1).join('\n---\n'));
}

/** Problems with an episode: unknown speakers, quotes not found verbatim, shorts too long. */
export function checkEpisode(ep, root) {
  const problems = [];
  const all = [...ep.chapters, ...ep.shorts];
  for (const ch of all) {
    for (const s of ch.segments) {
      if (!ep.cast[s.speaker]) problems.push(`${ch.id}: unknown speaker ${s.speaker}`);
      if (s.speaker === 'READER' && !s.source) problems.push(`${ch.id}: READER line without a [source]`);
      if (!s.source) continue;
      let hay;
      try { hay = sourceText(root, s.source); } catch { problems.push(`${ch.id}: no sources/${s.source}.txt`); continue; }
      let from = 0;
      for (const piece of normalise(s.text).replace(/^… | …$/g, '').split(' … ')) {
        const at = hay.indexOf(piece, from);
        if (at < 0) { problems.push(`${ch.id}: not verbatim in ${s.source}: "${piece.slice(0, 70)}"`); break; }
        from = at + piece.length;
      }
    }
  }
  // About 2.6 spoken words a second at the voices' speed; a short must fit a 60 s slot.
  for (const sh of ep.shorts) {
    const words = sh.segments.reduce((n, s) => n + wordCount(s.text), 0);
    if (words > 150) problems.push(`${sh.id}: ${words} words, too long for a 60 s short (150 max)`);
  }
  if (!ep.fiction) problems.push('front matter: "fiction" note (what is invented, what is quoted) is required');
  return problems;
}

export function wordCount(s) {
  return s.split(/\s+/).filter(Boolean).length;
}

/** What render.py voices: speaker voice, the text to say, and what to put on screen. */
export function segments(ep) {
  const out = (list, kind) => list.map((ch) => ({
    id: ch.id, title: ch.title, kind,
    segments: ch.segments.map((s) => ({
      speaker: s.speaker,
      name: ep.cast[s.speaker].name,
      voice: ep.cast[s.speaker].voice,
      source: s.source,
      text: s.text,
    })),
  }));
  return { slug: ep.slug, title: ep.title, article: ep.article, chapters: out(ep.chapters, 'chapter'), shorts: out(ep.shorts, 'short') };
}

/** "I-q2-a3" -> "Summa Theologiae I, q. 2, a. 3". */
export function citation(id) {
  const m = id.match(/^(I|I-II|II-II|III)-q(\d+)-a(\d+)$/);
  return m ? `Summa Theologiae ${m[1]}, q. ${m[2]}, a. ${m[3]}` : id;
}
