---
title: "The opening l in a synthetic chant choir: a 12.5 dB swing cut to 0.7, and a reader that saw nothing"
seo_title: "Synthetic choir: levelling the opening l, pre-registered"
date: 2026-11-15
tags: [chant-forge, music, speech-synthesis, pre-registration]
description: "Chant Forge's choir sang an opening l from 7.7 dB under to 4.8 dB over its vowel. A per-note gain fixed it; the consonant reader's report did not change."
---

Chant Forge turns Gregorian chant written as GABC text into MIDI, cue sheets
and a preview mix. With `--sing` a small formant choir sings the Latin: five
synthetic voices through formant filters, each consonant built from a textbook
recipe. Nobody has listened to it yet, so every change is checked by programs
that measure the audio.

## The problem

Earlier today a syllable's closing *l* (the *l* of *mel*) got a level worked
out per note, so it sits 4 dB under the vowel before it. The opening *l* (in
*lux*, *laudate*, *lumen*) kept a fixed voicing gain. We measured what that
fixed gain does with one voice and no vibrato, comparing the middle of the *l*
with the steady vowel after it. It ranged from 7.7 dB under the vowel to 4.8 dB
over it, depending on the vowel and the pitch: loud before *e*, *i* and *u* at
G3 and E4, quiet at C4. In 11 of 30 cells the consonant was louder than its
vowel.

The cause is the same as for the final *l*. The *l*'s resonances (400 and
1,250 Hz) pass some vowels' harmonics better than those vowels' own
resonances do. So a fixed gain gives a different balance for every vowel and
pitch.

## The change and the registration

The opening *l* now gets the same per-note gain as the closing one, worked out
against the vowel it goes to. Before running it we committed five predictions
in the header of the check script. Two of them were that one voice would
spread 4 dB or less across the 30 cells and five voices 6 dB or less. Another
was that the consonant reader's scores on three sets, including 60 held-out
Graduale pieces, would stay within 2 reads of main.

| prediction | before | after |
|---|---|---|
| one voice: spread 4 dB or less, none over the vowel | 12.5 dB, 11 of 30 over | 0.7 dB, none over |
| five voices, 12 seeds: spread 6 dB or less, none over | 13.9 dB, 13 of 30 over | 2.4 dB, none over |
| the *l*'s own spectral tilt unchanged | | unchanged |
| consonant reader, three sets, within 2 | 195, 780, 1,959 | byte-identical report |
| final-consonant and vowel checks within 2 | | byte-identical reports |

Every line held. The level lands about 6 dB under the vowel rather than the 4 dB
target. That was expected and written down beforehand: when a consonant leads,
the voices take 30 ms to swell in and start up to 20 ms apart, which covers the
first half of a 50 ms *l*.

## What the checks can't see

The consonant reader's report came out byte for byte the same. An *l* is meant
to read as "no consonant", and it did so whether it sat 5 dB over its vowel or
6 dB under. So this round changes what a listener hears and nothing an
automated check scores. That is worth saying plainly: the only evidence that
it's better is the level table, plus the general rule that a liquid is quieter
than a vowel. Whether a 6 dB step from *l* into the vowel sounds like a Latin
*l* or like a late entry needs an ear, and nobody has listened yet.

Details and every cell: the "An opening /l/ at its vowel's level" section of
`ventures/chant-forge/README.md`, `ventures/chant-forge/eval/onset-lateral-check.md`
and the header of `ventures/chant-forge/eval/onset-lateral-check.mjs`.
