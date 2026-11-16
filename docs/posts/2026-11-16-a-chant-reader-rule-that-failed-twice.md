---
title: "A chant-reader fix that worked on its training set and failed two held-out tests"
seo_title: "A rule that passed its dev set and failed two held-out tests"
date: 2026-11-16
tags: [chant-forge, audio, speech-acoustics, pre-registration]
description: "Chant Forge's consonant reader missed nasals on high short notes. A new rule fixed every training miss, then failed two pre-registered held-out sets. It ships switched off."
---

Chant Forge renders Gregorian chant with a synthetic choir that sings the
Latin, and a small rule-based reader listens back to check that the final
consonants are really in the audio. On the set the reader was tuned on, it got
every cluster syllable right except four, all on the same kind of note: an E4
eighth note. *Nunc*, *tunc* and *mens* read as a voiced *b*, and *sunt* as a
*t*. The *n* was missing.

Read in 5 ms frames, the *n* was there after all. It is just very quiet. On a
330 Hz voice only one harmonic falls under 500 Hz, so the murmur sits 19 to 32
dB under the vowel, deeper than any nasal rule allowed. Inside it, the five
slightly detuned voices beat: they drift in and out of phase, and at one dip
the murmur fell to -31 dB. To the reader that dip looked like a closure, and
the swell back up looked like a stop's burst.

## The rule

The fix reads what a murmur does that nothing else does. It holds at -12 to
-35 dB for 60 ms or more, then ends in an obstruent: either noise that outlasts
it (the *s* of *mens*), or a closure that goes properly silent and then bursts
(the *k* of *nunc*). A voiced stop's voice bar never goes silent before its
burst, and a vowel falling into a *t* passes through that level band in 15 to
35 ms. On the training set the rule fixed all four misses and broke nothing.

## Two held-out tests

The project's habit, kept here, is to write a fresh test set and commit its
predictions before the rule is run on it. The first set, part N, used new
syllables at new pitches and 108 BPM. The rule failed three of its five
predictions. N's high eighth notes were already read right 19 times out of 20
without the rule, because an eighth at 108 BPM lasts 0.28 s rather than 0.25.
Voiced stops were read as nasals 5 times instead of once. Three other parts
each lost a syllable.

The frames showed two faults. On a short note the reference vowel is measured
45 ms in, which is still the attack, so a voice bar looked only 24 dB down.
And after the fading tail of a dark /u/, a voice bar counted as "18 dB under
the run", the rule's first definition of silence. The second version compares
against the vowel's own peak just before the run and asks for real silence:
a frame at -50 dB. It went back over the training set and N without a single
loss, and a second fresh set, part O, was written and committed: 126 BPM,
eighths of 0.24 s, and one pitch no part had used.

It failed again, on three predictions:

| prediction | without the rule | with it |
|---|---|---|
| O's high eighth-note clusters, at least 2 more | 25 of 30 | 25 of 30 |
| O's voiced stops read as a nasal, no more | 3 | 4 |
| every earlier part no lower | | one part 106 to 105 |

Added up over every part, the rule gains eight reads and loses one. That
sounds like a win. But it was registered as a fix for short high notes, and on
the one set built to test that claim it fixed none of them. Its gains came
from other syllables. A net gain found after two rounds of reading the data
is exactly what tuning on the test set would also produce. So it ships the way it was
registered: off by default, one switch away (`deepMurmur: true`, or
`--deep on` for the whole report), with both columns printed for N and O.

## What is next

O's five high eighth-note misses (*punc* read as a *k*, *tunt* and *ment* as a
*t*, *sons* as an *s*) have not been read frame by frame yet. They need their
own explanation and, because their misses are now printed, a part P that
nobody has seen. All of this is the reader checking the synthesis. Nobody has
listened to whether a choir on E4 sings *nunc* or *nuc*.

The measurements are in the [Chant Forge
README](../../ventures/chant-forge/README.md) ("E4 eighth notes: a murmur read
as a closure") and the [coda report](../../ventures/chant-forge/eval/coda-check-report.md).
