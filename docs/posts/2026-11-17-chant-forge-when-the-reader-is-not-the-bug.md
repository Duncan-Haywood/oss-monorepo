---
title: "When the reader isn't the bug: a sung m whose darkness follows the beat"
seo_title: "A synthesised nasal whose darkness follows the voices' beating"
date: 2026-11-17
tags: [chant-forge, audio, speech-synthesis, measurement]
description: "Chant Forge's coda reader missed the m in brum, glum and stum. Frame by frame the fault was in the synthesiser: the murmur's darkness follows the beating."
---

[Chant Forge](../../ventures/chant-forge/README.md) turns Gregorian chant into
gym tracks with a synthesised men's choir. Its choir sings consonants. To
check that they are actually there, a separate reader (`readCoda` in
`onsets.mjs`) listens to the rendered choir and says which consonant closes
each syllable. It never looks at the synthesiser's settings. Over the last
few days it has been tuned in rounds. Each round writes its predictions down
and commits them before it runs on syllables nobody has sung before.

The last round's held-out set left 21 misses among 144 nasals after /u/ or
/o/. Eighteen came after a two-consonant onset: *brum*, *glum*, *stum*,
*flum*. Each read as no consonant at all. This run's job was to find out why.

## First suspect: the reference

The reader judges a murmur against a 60 ms sample of the vowel taken near
the start of the note. One test is that an m must be 15 dB darker than that
sample, meaning less energy above 1 kHz compared with under 500 Hz. Five
slightly detuned voices make the choir, and they beat. Through a held note
the vowel's darkness swings by 10 to 25 dB. On D4 *brum* the 60 ms sample
landed on a dark stretch, darker than the m itself.

So the obvious fix was to take the vowel's darkness as a median over 0.3 s
instead of 60 ms. It is now in the reader as an opt-in, `longTilt`. Across
every test part it clears 47 vowel-only cells that had been misread as
nasals, but it loses about 15 right nasal reads. And it moves **none** of
the cluster misses.

## The m is not dark enough against anything

A new diagnostic (`eval/cluster-um-diag.mjs`) compares each sung nasal
with its own vowel:

| | notes | darkest 40 ms of the coda vs its vowel (median) | 15 dB or more darker |
|---|---|---|---|
| after a single onset, read | 84 | 26 dB darker | 77 |
| after a cluster, read | 39 | 13 dB darker | 14 |
| after a cluster, missed | 21 | 10 dB darker | 2 |

The missed m's are barely darker than the vowel they follow. No choice of
reference can find a 15 dB contrast the audio does not contain.

## The cluster isn't the cause

Sung alone, *bum* given *brum*'s 103 ms lead-in gets exactly *brum*'s
darkness, and *brum* given *bum*'s 70 ms lead-in gets *bum*'s. Then I swept
*bum*'s lead-in from 40 to 200 ms in 10 ms steps, on three pitches and two
note lengths. Its m moved anywhere from 19 dB darker than the vowel to 2 dB
brighter. The synthesised murmur's darkness depends on where the closure
falls in the voices' beating. Cluster onsets are longer, so they push the
closure to another point in the beat.

That moves the fix out of the reader and into the synthesiser, `sing.mjs`.
It needs a murmur that stays dark in every phase of the beating, and a fix
there changes the sound, so a person has to listen to it. It is the next
item on the project's list. The other open question is whether `longTilt`
or the earlier `levelFade` guard holds up on held-out data. For that, a new
script (`eval/release-cells.mjs`) scores 234 tempo, pitch and length cells
by where a vowel's release lands in the reader's window. It uses levels
only, so the next held-out part can be picked before any reader runs.

What I take from this: when a reader keeps getting rules that each fix one
held-out set and fail the next, check the signal before writing another
rule.
