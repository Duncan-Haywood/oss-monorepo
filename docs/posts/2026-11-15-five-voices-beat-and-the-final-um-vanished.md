---
title: "Five singing voices beat, and the final -um vanished: reading a murmur against the vowel next to it"
seo_title: "Synthetic choir nasal codas: reading -um against the nearest vowel"
date: 2026-11-15
tags: [chant-forge, music, speech-synthesis, signal-processing]
description: "A synthetic choir's short final -um often read as nothing because five detuned voices beat. Reading it against the vowel next to it fixed most misses."
---

Chant Forge renders Gregorian chant into a preview mix, and its choir sings
the Latin text, consonants included. To check that the consonants are really
in the audio, a small reader (`onsets.mjs`) listens to the rendered choir and
says what each syllable ends on: a stop, a fricative, a nasal, a tap, or
nothing. The synthesiser's own settings never enter into the check.

The biggest group of misses was the most common Latin ending: a short final
*-um*, *-num*, *-tum* or *-rum*. On the corpus's quarter-second notes it
often read as nothing at all.

## Why: the voices beat

The choir is five sawtooth voices, detuned from -12 to +13 cents. A nasal
murmur goes out through the nose, which passes little above a few hundred
hertz, so the murmur is mostly the voices' first two harmonics. At D3 those
harmonics drift in and out of phase with each other a few times a second.
Over the 70 ms of a murmur the phase barely moves, so the murmur comes out
loud or quiet depending on where in the beat it lands. An earlier run
measured the spread: from 5.7 dB over to 20.1 dB under the vowel.

The reader compared the murmur with 60 ms of vowel taken at the start of the
note. When we looked at the misses frame by frame, the vowel itself was
drifting with the same beat in the 100 ms before the closure. One *num* at D3
had its murmur 12 dB under the start of the note, but only 3 to 6 dB under
the vowel right before it. The sharp step held up even when the level didn't.
At the closure the sound turns 10 to 15 dB darker (less energy above 1 kHz
against below 500 Hz) within 10 ms and stays dark.

## The change, and the version we threw out

So the reader got one more rule. It compares each frame with the vowel 25 to
45 ms before it. A frame counts as murmur if it is 8 dB darker and up to
18 dB quieter, and the run holds its level for 45 ms.

That first version heard nasals that weren't sung. On a synthetic set of
eighth and quarter notes, it read 9 of 9 vowel-only /u/ and /o/ notes at F3
as nasals. As those vowels fade, their darkness wanders by 8 dB while their
level holds steady. We caught this before any of the held-out sets had
finished. We stopped that run without reading it, added a second condition
(the darkness must also hold within 4 dB over the run's first 30 ms) and
wrote the predictions down again before running the held-out sets.

## What it did

Every prediction held:

| | before | after |
|---|---|---|
| final nasals, three held-out sets of Graduale pieces | 67 of 80 | 73 of 80 |
| final nasals, 51 more pages never used for tuning | 96 of 137 | 106 of 137 |
| all closings on the largest held-out set | 121 of 134 | 126 of 134 |
| vowel-only choir read as a consonant | unchanged | unchanged |

Only the reader changed, so the choir sounds exactly the same as before. The
beat is still in the audio. A real section of singers beats too. Whether five
real voices beat this much on a held *-um*, and whether a listener hears the
murmur come and go, can only be settled by listening. Nobody has listened yet.

The numbers, the rule and both registrations are in the
[Chant Forge README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/chant-forge)
("A short final -um against the vowel just before it") and
`eval/coda-check-report.md`.
