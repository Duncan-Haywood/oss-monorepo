---
title: "An untested registration: Chant Forge's fix for a fading /u/ heard as an m found nothing to fix"
seo_title: "A fading vowel heard as an m: a fix its held-out test could not test"
date: 2026-11-17
tags: [chant-forge, audio, speech-acoustics, pre-registration]
description: "A guard that stops a fading /u/ being read as a final m fixed 44 cells on development parts. The new held-out part had no such cells to fix."
---

Chant Forge turns Gregorian chant into finished tracks, and its preview choir
sings the Latin. A small rule-based reader listens to the rendered audio and
checks the consonant that closes each syllable. Every change to that reader
follows the same steps. We try it on development parts, write down what it
should do on a new held-out part, commit that, and only then run the held-out
part. This round's held-out part could not test the change at all.

## The fault

The previous round found that the default reader got one cell wrong in a new
way. On A#3 quarter notes, every /u/ syllable sung on vowels alone (*nun*,
*brum*, *mut*, *nul* and eleven more) read as ending in a nasal. Nothing
there should read as a consonant.

Frame by frame, the /u/ grows about 12 dB louder over the note than at its
start, where the reader takes its reference, and it gets darker. After the
note ends it fades by 2 to 3 dB every 5 ms. For the last 40 ms before the
reader's window closes, that fade looks like a murmur. It sits 5 to 25 dB
under the reference, with far less energy above 1 kHz than under 500 Hz.

## Two guards that failed on development

- **Darker than the vowel before it.** Asking the murmur to be darker than
  the vowel 25 to 45 ms before it fixed all 15 cells, and 15 more on another
  part. It also lost more than 60 sung nasals. An m after /u/ is no darker
  than the /u/, which [an earlier round](2026-11-17-chant-forge-a-dark-vowel-m.md)
  had already shown.
- **A level that keeps falling.** For every wrong read this fixed, it broke a
  right one. A sung m also falls into its murmur.

## What separated them

A new script, `eval/level-tail-sweep.mjs`, lists every nasal the level rule
reads on twelve parts, along with where the murmur starts relative to the end
of the reader's window. Every false nasal on the two parts with this fault
started 5 or 6 frames (25 to 30 ms) from the end. Of 636 right reads, the
earliest started 7 frames out, and nearly all of them 60 or more.

So the rule, `levelFade`, drops a level-rule murmur that starts in the
window's last 30 ms. A real final consonant starts well before the next
sound.

On the development parts it fixed 44 vowel-only cells (15, 14 and 15 on three
parts) and 3 other syllables. It lost one sung *lum*, and no nasal row moved
anywhere. It does not touch two other vowel-only faults (17 cells), which
start further from the end.

## The held-out part

Part d used 32 syllables never sung before, at six pitches and a tempo no
other part uses. The registration said the gain counts only if the default
reader misses at least 3 of d's 384 vowel-only cells. It missed none, so
`levelFade` gained nothing to measure. It lost nothing anywhere else on d
either.

The rule stays opt-in, recorded as untested. The fault depends on how tempo
and note length line up with the window. It shows on A#3 quarters at 88 BPM
and on E3 eighths at 122 BPM, but not at 92 BPM on these pitches. A fair test
needs a held-out part whose cells are picked where a vowel-only release ends
in the window's last 30 ms. That has to be measured on the render before any
reader runs.

This is the reader's own check on synthetic audio. Nobody has listened to
it, and a real singer's release is not this synthesiser's. The numbers are in
the venture's README, under "A /u/ release read as a nasal".
