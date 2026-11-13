---
title: "A breakdown before the last drop: giving a six-verse chant hymn a shape"
seo_title: "Adding a breakdown and riser to a generated chant dance track"
date: 2026-11-13
tags: [music, gregorian-chant, midi, open-source]
description: "Chant Forge now drops the drums for the verse before a long hymn's last drop and adds a riser to each build; the breakdown renders 8 to 12 dB under the verses."
---

Chant Forge turns public-domain Gregorian chant into MIDI and audio for men's-choir
dance and rock tracks. This morning it learned song sections: the chant's own double
bars mark where each verse of a hymn ends, so the backing can sit back in a verse and
hit harder in a drop. On the six-verse *Pange lingua* that gave Verse, Drop, Verse,
Drop, Verse, Drop. Correct, but flat: the sixth verse arrived the same way as the
second and the fourth.

Dance tracks solve that with a breakdown. Before the last drop the beat goes away, the
melody is left almost alone, and the drop that follows lands harder because of the
gap. Chant suits it well, because a choir singing alone is where this music started.

## What changed

- **Breakdown.** A piece with four or more chant sections (a strophic hymn, or any
  piece run with `--repeat`) turns the verse before the last drop into a breakdown:
  no drums, no bass, one soft held chord a bar under the choir. It still ends on the
  build bar, so the last drop comes in after a snare roll. Pieces with two or three
  sections are unchanged.
- **Riser.** The build bar used to hold one chord under the roll. Now the bass and
  chords turn on beat 3 to the chord a fifth above the chant's final, the mode's own
  pull back home, and seven eighth notes climb the mode above them, getting louder,
  before the empty last eighth where the drop lands. Every note stays in the mode.

```
sections: Intro bar 1-2; Verse 1 bar 3-11 (build); Drop 1 bar 12-20; Verse 2 bar 21-29 (build);
          Drop 2 bar 30-38; Breakdown bar 39-47 (build); Drop 3 bar 48-56; Outro bar 57-58
```

## How much quieter

Through the preview renderer, backing only, mean power per section on the six-verse
hymn:

| genre | verse | breakdown | drop |
|---|---|---|---|
| deep house, 124 BPM | -21.0 dB | -30.5 dB | -19.3 dB |
| EDM, 140 BPM | -22.2 dB | -33.5 dB | -20.5 dB |
| hard rock, 140 BPM | -21.0 dB | -29.0 dB | -17.4 dB |
| metal, 170 BPM | -19.3 dB | -31.7 dB | -16.9 dB |

The breakdown is 8 to 12 dB under the verses and 12 to 15 dB under the drop after it,
the biggest step anywhere in the arrangement. Before this change the biggest step
between chant sections was the 1.7 to 3.5 dB from verse to drop.

## What nobody knows yet

These are measurements of the arrangement, not of how it sounds. Whether a pad that
quiet still carries a choir, and whether seven rising eighths read as a lift or as a
scale exercise, need someone to listen. The next steps are a melodic hook taken from
the chant's own opening phrase, so drops differ from verses by more than drums, and a
key lift for the last drop.

Try it on the [Chant Forge studio page](/ventures/chant-forge/) (switch on "Song
sections" and pick the six-verse Pange lingua), or from the command line:

```
node ventures/chant-forge/cli.mjs ventures/chant-forge/corpus/pange-lingua-full.gabc \
  --final 52 --fit 8 --stretch --genre edm --sections --intro 2 --outro 2 -o pange.mid
```

The code is MIT licensed, in `ventures/chant-forge/` (`sections.mjs` and `genre.mjs`).
