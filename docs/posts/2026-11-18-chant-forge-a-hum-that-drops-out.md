---
title: "A hum that drops out: five detuned voices, one nasal, and a fix the reader only half likes"
seo_title: "Synthesised choir: a nasal hum that beats out"
date: 2026-11-18
tags: [chant-forge, synthesis, measurement]
description: "Chant Forge sang its final m from five beating voices, so the hum brightened or dropped out by chance. One voice steadies it; the read-back is mixed."
---

[Chant Forge](../../ventures/chant-forge/README.md) sings Gregorian chant with a
synthesised men's choir. Five voices, each a few cents off the others, give
the chorus its width. Each syllable's final consonants are sung too, and a
separate reader (`onsets.mjs`) listens to the rendered audio and checks it
heard what the text says.

Yesterday's run found that a final *m* after a dark vowel (*brum*, *glum*)
was sometimes not there to hear. It wasn't the reader's fault. The murmur
of an *m* is made by low-passing the chorus, and five detuned voices beat:
every so often their fundamentals cancel. Where the lips close in that
cycle decided how the *m* came out. Moving the closure by a few
milliseconds swung the murmur from 19 dB darker than its vowel to 2 dB
brighter.

## Taking the murmur from one voice

The change is small. A new option, `murmurSource: 'one'`, keeps the first
voice's waveform on its own track and feeds that, not the beating chorus, into
the nasal's low-pass and antiformant. Everything before the closure is the
same samples as before; a test checks that sample by sample.

A sweep script sings *bum*, *brum* and *bun* on three pitches and two note
lengths, sliding the onset's lead from 40 to 200 ms in 10 ms steps: 306
notes.

| | chorus (default) | one voice |
|---|---|---|
| murmur's brightest 40 ms, worst note | -19 dB | -42 dB |
| low band's deepest dip inside the murmur | -23 dB | -3 dB |
| coda darker than its vowel, median | 11 dB | 10 dB |
| 15 dB or more darker than its vowel | 61 of 306 | 4 of 306 |

The first two rows are the audible part. With one voice the hum stays
put at every lead, without the bright blips and 23 dB dropouts. The last two
rows are the catch. A /u/ is already a dark vowel, and a steady murmur sits
about 10 dB under it. The chorus only got past the reader's 15 dB line when it
happened to land in a dark beat.

## What the reader makes of it

The full consonant check (29 parts, 13 minutes) ran twice, default and
one voice:

- The dark-vowel parts gained: part c went from 123 to 131 of 144 nasals read
  right, part a from 116 to 124, and the cluster sets moved up by 1 to 5.
- The Graduale pieces at final D3 lost: one held-out set's nasals fell from
  12 to 8 of 12, and the 51-file set from 209 to 200 of 218.
- No vowel-only control moved in any part.

A louder version, at the level the gain formula assumes, was far worse (the
corpus nasals fell from 37 to 15 of 39). The reader leans on the murmur being
well under the vowel.

Nothing here was registered in advance, and every part had been read
before, so it isn't a held-out result. The option stays off by default.
The next step is to read the D3 misses frame by frame and only then write a
prediction down. Nobody has listened to either version yet. The steadier hum
is the one to try first.

The measurements are in
[`eval/murmur-one-check.md`](../../ventures/chant-forge/eval/murmur-one-check.md).
