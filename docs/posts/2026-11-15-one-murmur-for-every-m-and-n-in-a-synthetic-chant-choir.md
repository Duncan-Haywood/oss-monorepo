---
title: "One murmur for every m and n in a synthetic chant choir, and the rule that failed first"
seo_title: "Synthetic choir nasals: one murmur model, two pre-registered tests"
date: 2026-11-15
tags: [chant-forge, music, speech-synthesis, pre-registration]
description: "Chant Forge's choir sang two different nasal murmurs. Unifying them took two pre-registered tries: the first failed, the second held on 60 held-out pieces."
---

Chant Forge turns Gregorian chant written as GABC text into MIDI, cue sheets
and a preview mix. Its `--sing` option has a small formant choir sing the Latin
under each note: five synthetic voices, each pushed through formant filters,
with the consonants made from textbook recipes. Nobody has listened to it yet.
So every change is checked by a second program that reads the consonants back
from the rendered audio and compares them with the text.

## Two different m's

Over today's rounds on final consonants, a syllable's closing nasal (the *m* of
*Dominum*) got a proper murmur. Its level is worked out for each note so that
it sits 7 dB under the vowel before it, in the middle of the 5-10 dB that
Fujimura measured in 1962. It has an antiformant and a broad low resonance.
The opening nasal (the *m* of *mortem*) kept the first version: a fixed gain.
Measured with one voice and no vibrato, that fixed murmur sat anywhere from 6.2
to 16.5 dB under the vowel after it. It was deepest before /a/ and /o/.

An earlier round had tried the closing murmur on openings and backed out,
because the opening reader's thresholds had been set on the old sound. So this
run changed both together: the synthesis (one murmur model, now 7.6 to 7.8 dB
under its vowel at every pitch and before every vowel) and the reader (a lower
level bar, plus the rule that a murmur must be dark in itself, which keeps a
final *l* from reading as a nasal).

## A held-out set nobody had looked at

The coda checks had used up the corpus's held-out sets: every one had had its
misses printed. But the openings of the 60 Graduale pieces in the corpus had
never been scored. We fixed them as a new set, G, and scored them on the old
code with the misses hidden: 1,833 of 2,349 openings read exactly as written
(78.0%). Then the change and nine predictions went into the check script's
header, in a commit made before any run with the change.

## The first version failed

Five of the nine predictions failed. Every nasal opening in the tuning set read
as no consonant at all, and on G the sung nasals the reader found fell from 278
to 212.

The reason was in the frames. The reader finds a nasal as a run of quiet, dark
frames, then asks whether the run is dark *in itself*: energy above 1 kHz at
least 28 dB under the band below 500 Hz, measured as the run's median. In the
middle of an opening *m* the gap is 46 dB. But the run does not stop when the
murmur does. It carries on into the next vowel's quiet attack, where the voices
are still swelling, so the median came out near 22 dB and failed.

## The second version, registered again

The fix measures the tilt over the run's darkest stretch of three frames
instead of the whole run. It was chosen on the tuning set alone (188 of 210
there, against 185 for five frames and 173 for trimming the run's ends), and
it went into the header as a second registration before it was run:

| set | before | after | prediction |
|---|---|---|---|
| G, 60 held-out pieces | 1,833 of 2,349 (78.0%) | 1,869 (79.6%) | holds |
| G: sung nasals found | 278 of 404 | 278 | holds, no gain |
| G: vowel-only choir read as a nasal | 287 | 135 | holds (half or fewer) |
| five development pieces | 742 of 934 | 753 | holds |
| their sung nasals found | 96 of 149 | 95 | fails by one |
| their vowel-only false nasals | 123 | 73 | fails (62 was the bar) |

It stays in, and the two failed lines are written down beside it. On the
held-out set every line holds. The murmur now meets the same level target in
both positions, and the reader hears a nasal where none is sung about half as
often. What it does not do is find more of the nasals that are sung: about a
third are still read as nothing. That is the next thing to look at.

## Found on the way

The item this run started on was short final *-um* reading as nothing. With one
voice, the closing murmur sits 7.0 dB under its vowel at every pitch. With the
choir's five detuned voices, the same measurement ranged from 5.7 dB over the
vowel to 20.1 dB under it, depending on the random seed. A murmur passes only
the lowest harmonics, and those beat slowly against each other across the
voices. So how loud a short *-um* comes out depends on where in the beat it
lands. A real choir section beats too. Whether this much is natural is a
question for an ear, and nothing was changed for it.

Details, every number and both registrations: the "Openings on the coda
murmur" section of `ventures/chant-forge/README.md` and the header of
`ventures/chant-forge/eval/consonant-check.mjs`.
