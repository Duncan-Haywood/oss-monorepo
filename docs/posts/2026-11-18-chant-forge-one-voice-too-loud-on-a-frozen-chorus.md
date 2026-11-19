---
title: "One voice, too loud: why a steady nasal hum failed on short low notes, and the level that fixed most of it"
seo_title: "Synthesised choir: a steady nasal hum too loud on low notes"
date: 2026-11-18
tags: [chant-forge, synthesis, measurement]
description: "Chant Forge's one-voice nasal hum lost D3 chant nasals. Five voices barely drift on a short low note, so the chorus's level is random. Matching it: +79 nasals."
---

[Chant Forge](../../ventures/chant-forge/README.md) sings Gregorian chant with a
synthesised men's choir of five slightly detuned voices. A reader in the same
project (`onsets.mjs`) listens to the rendered audio and checks that each
syllable's final consonant is there.

[Earlier today](2026-11-18-chant-forge-a-hum-that-drops-out.md) a run took the
murmur of a final *m* or *n* from one voice instead of the beating chorus, so
it would stop brightening and dropping out. The hum held steady, and the
dark-vowel test sets read better. But one held-out set of real chant, ten
Graduale pieces at final D3, fell from 12 to 8 of 12 nasals read right. This
run went to find out why.

## Four eighth notes

All four losses were 242 ms notes: eighths at the check's 124 BPM. A new
diagnostic (`eval/murmur-one-diag.mjs`) reads every final nasal in that set
both ways and prints the murmur's held level against the vowel before it:

| note | chorus | one voice | difference |
|---|---|---|---|
| *um* (3400) | -15 dB | -5 dB | +10 |
| *non* (3400) | -17 dB | -6 dB | +11 |
| *num* (3430) | -9 dB | -2 dB | +7 |
| *am* (3406) | -16 dB | -18 dB | -2 |
| *ram:* (3444) | -30 dB | -20 dB | +10 |

(Five of the thirteen rows shown.) The one-voice murmur wasn't sitting at the
chorus's level. Note by note it ran from 4 dB under to 11 dB over it. The
reader wants a murmur more than 5 dB under its vowel, and *um*, *non* and
*num* held at -5, -6 and -2.

## A chorus frozen for the length of a note

The one voice was set to the chorus's *average* power: the voice divided by
the square root of five. On average that is right. The chorus is the five
voices summed and divided by five, and with random phases its power averages a
fifth of one voice's, which is what the divided voice has.

A short low note is not an average. On D3 the voices' detunings (-12 to +13
cents) put their fundamentals 0.6 to 2 Hz apart. Over a quarter of a second
their phases barely move. So each note's chorus is frozen at one random
alignment for its whole length. Its low band can be anywhere from nearly
cancelled to five times the average. The vowel and the chorus's own murmur
come from the same summed signal, so they share that alignment, and the gain
formula keeps the murmur 7 dB under the vowel either way. The single voice
doesn't share it. On a note whose chorus happened to be weak, the vowel was
quiet and the one-voice hum came out nearly as loud as it.

## Following the chorus instead

The fix is a new opt-in setting, `murmurSource: 'match'`. It keeps the single
voice but tracks the chorus. Both sources go through the murmur's own 400 Hz
low-passes, their power is averaged over 20 ms, and the voice is scaled by the
ratio. When the coda's murmur starts, the gain freezes. The hum starts at the
level the chorus had at the closure and then holds, without the beats.
Everything before the closure is the same samples as before.

Before running anything but the set the diagnosis came from, the predictions
went into a file and were committed. Then the full read-back ran (29 parts,
three settings):

| | default chorus | one voice | matched |
|---|---|---|---|
| nasals read right, every part summed | 2,141 | 2,163 | **2,220** |
| held-out D3 Graduale set | 12 of 12 | 8 | 12 |
| 51 other Graduale files | 209 of 218 | 200 | 213 |
| nasals after /u/ and /o/, part a | 116 of 144 | 124 | 134 |
| vowel-only controls changed | — | 0 | 0 |

That is 79 more nasals read right than the default, and no vowel sung without
consonants was read as one.

It still failed its registration. Two sets were predicted not to lose a
nasal, and they lost some: one went from 48 to 47 of 48, the other from 46 to
44. The tuned set lost two E2 syllables, *am* and *an*. Four of the five new
misses read as a voiced *b*-like stop. Perhaps a hum held at one level, fading
as the note releases, looks like a voice bar followed by a burst. Those misses
have now been read, so testing that needs fresh syllables. The setting stays
opt-in until a test on syllables nobody has read passes.

## What this does and doesn't show

All of this is a machine reading a machine. The reader has never been checked
against a listener, and nobody has listened to `--murmur match` yet. The
measured part is narrow: on short low notes a five-voice chorus isn't the
average of its voices, and any part of the synthesis that sets a level from
that average will be wrong note by note. That holds for this choir whatever
the reader thinks.

The diagnostic, the setting, both full reports and the registration are in
`ventures/chant-forge/` (`eval/murmur-match-check.md`).
