# Sed Contra: series bible and production guide

Read this before writing or rendering an episode. It is the brief an AI writer
works from, the honesty rules every episode keeps, and the next-up list.

## The idea

Every article of Thomas Aquinas's *Summa Theologiae* has the same shape:
objections at full strength, *sed contra* ("on the contrary"), Thomas's answer,
and a reply to each objection. That shape is already drama: someone has a
reason not to believe, someone else answers, and the answer has to survive the
reason. Each episode takes **one article** and stages it as a story in an
ordinary room, with Thomas's own words read aloud at the points where the
article itself speaks.

One script, rendered by software into every format a person might meet it in:

| Format | Where it goes | Made by |
|---|---|---|
| Long-form video, 1920x1080, chapters and captions | YouTube, classrooms, parish screens | `render.py` (Pillow cards, ffmpeg) |
| Podcast episode, chapters, transcript | `feed.xml`, any podcast app | `render.py` (Kokoro voices) |
| Vertical shorts under 60 s | YouTube Shorts, Reels, TikTok | `render.py`, from `## Short:` sections |
| Web page with full cited transcript | search, sharing, `llms.txt` | `generate.mjs` |

The writing is done by an AI agent working from this file; everything after the
script is code, so a new episode costs a session's writing and some CPU minutes,
never a per-viewer bill.

## Honesty rules (these are the product)

1. **Thomas's words are his words.** Every `READER [source]:` line must appear
   verbatim in `sources/<source>.txt` (the public-domain 1920 English Dominican
   translation, copied from Project Gutenberg with its eBook number and line
   range in the header). `node generate.mjs --check` fails on any changed word,
   added full stop or reordered cut. Cuts are ` … `. Never paraphrase inside a
   READER line; paraphrase belongs to a character.
2. **The objections get their full strength.** Thomas put them first; so do we.
   A character who holds the objection must be someone a listener could be, and
   must not be stupid, cruel or converted by the end.
3. **Say what the article does not do.** The Five Ways do not prove the God of
   Abraham, and Thomas knew it; a reply to an objection that answers the logic
   does not answer a grief. Characters say so.
4. **A "fair to the other side" passage in every episode's notes**, naming the
   strongest modern critics by name and work, with no straw men.
5. **Label the fiction.** The front matter's `fiction` field says what is
   invented and what is quoted; the page and feed print it.
6. **Catholic, not official.** Written from inside the tradition, warmly; never
   presented as magisterial teaching. Where Thomists disagree among themselves
   (the Fifth Way and Darwin, for one), say that they do.
7. **No cheap consolation.** Nobody is told why their particular suffering
   happened. Nobody converts in twenty minutes.

## Tone and craft

- Fifteen to twenty minutes of audio (about 2,300 to 2,800 words) for the long
  form. Chapters follow the article: objections, *sed contra*, the answer, the
  replies, then a short ending in the story and the notes.
- Ordinary settings, the present day, real work with real texture (dough
  proving, a night shift, a tide). One concrete image carries the argument
  (Episode 1: the dent in the dough, the hand and the stick).
- **The recurring frame:** Hollin's Bakery on Quay Street, Saltmarsh Staithe
  (invented, Humber estuary), where Teodor Hollin has read a Dominican's
  abandoned copy of the Summa during the first proof every night since 1979.
  Different visitors come in with different questions; Maren Ashby, an ICU
  night nurse, may come back. An episode may leave the bakery when the article
  needs another room.
- Shorts are written, not cut: each `## Short:` section is its own script, 150
  words at most, built around one objection or one image, ending with the
  citation and "Full episode: Sed Contra."

## Script format

`episodes/NNN-<slug>.md`: JSON front matter (`number`, `slug`, `title`,
`subtitle`, `article`, `articleTitle`, `date`, `description`, `setting`,
`cast` mapping each SPEAKER to a display name and a Kokoro voice, `fiction`),
then `## Chapter {#id}` sections of `SPEAKER: text` lines. Details at the top
of `script.mjs`.

Voices in use: Narrator `bf_emma`, Maren `af_bella`, Teodor `bm_george`,
Thomas (read) `am_michael`. Keep Thomas on one voice across the series.

## Pipeline

```bash
python3 -m venv tts && tts/bin/pip install kokoro-onnx soundfile pillow
node generate.mjs --check                         # quotes verbatim, shorts short
tts/bin/python render.py <slug>                   # audio, chapters, captions, video, shorts
node generate.mjs                                  # pages, feed, sitemap
node --test '*.test.mjs'
```

Adding a source: download the Gutenberg text, copy one article (from its
`[I, Q. n, Art. m]` heading to the next rule) into `sources/<Part>-q<n>-a<m>.txt`
under the same three-line header (eBook number, line range, fetch date).

## Next up (one article per episode)

A season is about ten episodes; a long arc runs through the Summa's own order.

1. ~~I q.2 a.3, Whether God exists? (The First Mover)~~ shipped 2026-11-03.
2. I q.2 a.2, Whether it can be demonstrated that God exists. Teodor's promise
   to Maren at the end of Episode 1; faith and reason, and the man who can't
   follow the proof.
3. I q.3 a.7, Whether God is altogether simple. A physicist (Maren's brother?)
   comes to the bakery.
4. I q.19 a.9, Whether God wills evils.
5. I q.75 a.6, Whether the human soul is incorruptible. A hospice.
6. I q.83 a.1, Whether man has free choice. A courtroom or an addiction meeting.
7. I-II q.2 a.1, Whether man's happiness consists in wealth.
8. II-II q.110 a.3, Whether every lie is a sin. Maren and the tide, the
   callback the first episode set up. Thomas's answer is strict; let it be.
9. II-II q.17 a.1, Whether hope is a virtue.
10. III q.1 a.1, Whether it was fitting that God should become incarnate. A
    Christmas episode.

Later seasons: the Eucharist (III q.75), the virtues, law (I-II q.90 to 97),
the angels, the passions. Parts I-II, II-II and III are separate Gutenberg
eBooks; record each one's number in the source header.

## Open production work (the programme, many sessions)

- **Better pictures without a per-image bill.** Cards are typeset; a later
  session can add drawn scene plates per chapter (a local, openly licensed
  image model on the owner's hardware, or hand-made SVG), keeping the cards'
  rule that nothing on screen claims to be a photograph.
- **Music and room tone.** A public-domain chant line under the cold open, and
  a quiet bakery bed, both with recorded provenance.
- **Word-level captions for shorts** (a forced aligner over the voiced audio).
- **Translation.** Kokoro has Spanish, French, Italian and Portuguese voices;
  the Dominican English would need a public-domain translation per language.
- **Distribution.** YouTube, Spotify and Apple Podcasts accounts under the
  portfolio's public name are the owner's call; until then the MP4s and the
  feed are free for anyone (a parish, a teacher, a Catholic creator) to post.
