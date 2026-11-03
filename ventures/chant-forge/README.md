# Chant Forge

Gregorian chant and traditional Catholic hymns, arranged for the gym: all-male
choir lines over deep house, EDM, hard rock and metal. This is a long-term
production project (owner, 2026-11-03: "very masculine stuff for the gym. all
male choirs. would be fun to make as a long term project. also being able to
publish to spotify etc."). The plan is in [`ROADMAP.md`](ROADMAP.md).

The code is open source (MIT). The pipeline goes from public-domain chant to a
released track:

1. **Source:** chant in GABC (the notation Gregorio typesets), each piece
   transcribed from a cited public-domain edition ([`corpus/`](corpus/README.md)).
2. **Convert** (this slice): GABC to a MIDI choir line with Latin lyrics,
   transposed for men's voices and fitted to a grid.
3. **Arrange:** genre templates (drums, bass, synths, guitars) built around
   the line. Not built.
4. **Voice:** a real men's choir (recorded) or a singing synthesiser. Not built.
5. **Release:** loudness, metadata, credits and AI-disclosure checks before a
   distributor upload. Not built.

## What works now

```sh
node ventures/chant-forge/cli.mjs ventures/chant-forge/examples/dies-irae-incipit.gabc \
  --bpm 124 --fit 8 --final 50 --drone -o dies-irae.mid
```

```
Dies irae (first line only): 8 notes, C3-F3 (ambitus 5 semitones), final D3
mode 1
2.00 bars, 3.9 s at 124 BPM
wrote dies-irae.mid
```

- `gabc.mjs` reads the following:
  - c and f clefs on lines 1–4, plus the `cb` flat clef;
  - pitches `a`–`m`;
  - flats, naturals and sharps (`x y #`), which last to the end of the word or the next bar;
  - the punctum mora (`.`) and the episema (`_`);
  - custodes (`g+`), which are not sung;
  - the four bars `, ; : ::`.

  Neume shapes (virga, quilisma, liquescents and so on) are treated as plain
  notes. A note before any clef is assumed to be in c4, with a warning.
- `fitToBars` pads the rest after each full bar so the next phrase starts on a
  downbeat. Chant has no metre, and this is the simplest way to put it on a grid
  without changing any note's length.
- `summarize` reports range, ambitus and final. It also checks the final
  against the `mode:` header (modes 1–2 end on re, 3–4 on mi, 5–6 on fa, 7–8 on
  sol), which catches a transcription that is off by a step.
- `midi.mjs` writes a format-1 MIDI file with no dependencies:
  - a conductor track with tempo, 4/4 and the title;
  - the choir line (GM Choir Aahs) with one lyric event per syllable;
  - an optional drone on the final, an octave down (GM Church Organ).

Tests: `node --test ventures/chant-forge/chant-forge.test.mjs` (8 tests,
passing 2026-11-03). On 2026-11-03 the example's output was also read back with
an independent parser (Python `mido` 1.x): 3 tracks, 3.87 s, lyrics in order.

## Not checked yet

- `examples/dies-irae-incipit.gabc` is the widely quoted opening motif
  (F E F D E C D D), typed from memory. It has not been transcribed from a scan.
  It is a demo input, not a corpus entry.
- The converter has only run on the small inputs in the tests. It has not been
  tried on a real GregoBase or Gregorio file.
- Nothing has been arranged, sung, mixed or published.

## Rules this project keeps

- **Sources must be public domain and cited.** The melodies and Latin texts in
  the 1908 Vatican edition and other pre-1929 printings are public domain in the
  US. Modern editions, translations and recordings can still be under
  copyright. **Never sample an existing recording.**
- **Publishing needs the owner.** A distributor account (DistroKid or similar)
  needs the owner's card, name and choice of artist name. Agents prepare
  releases; they don't upload them.
- **Honest credits:**
  - say which parts are synthesised and use the distributor's AI-disclosure
    fields;
  - never imply a real monastery or choir sang it;
  - no bought streams or fake listener numbers.
- **Treat the texts with respect.** These are liturgical texts. Use them whole
  and in their sense, not as jokes.

## Check a mix before release

`node mastercheck.mjs track.wav [--json]` reads a 16, 24 or 32-bit WAV (mono or
stereo) and reports integrated loudness (BS.1770-4 K-weighting with the R128
gates), true peak (4x oversampled), clipped samples, and stereo correlation
with the mono fold-down loss. It compares them with the common streaming
guidance of about -14 LUFS and -1 dBTP. It runs locally and costs nothing.
Checked on synthetic tones only so far (`mastercheck.test.mjs`).
