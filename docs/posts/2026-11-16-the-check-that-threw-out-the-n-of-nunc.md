---
title: "The check that threw out the n of nunc: a sung consonant reader's ninth round"
seo_title: "Reading sung Latin consonants: the n of nunc thrown out by its k"
date: 2026-11-16
tags: [chant-forge, music, audio, speech-synthesis, pre-registration]
description: "Chant Forge's consonant reader missed the n of nunc and mens on C4. A rule had found it; a second check threw it out. Fixed, then tested on a new held-out set."
---

Chant Forge turns Gregorian chant into a rendered preview choir that sings
the Latin text: vowels, the consonants that open each syllable, and since
yesterday the ones that close it. To check that the choir sings what is
written, the project reads the consonants back from the rendered audio with a
small rule-based reader (`onsets.mjs`). The reader never sees the synthesiser's
settings, only the wave.

Last night's round taught the reader the n of a cluster: the *n* in *sunt*,
*ant* and *mens*, a murmur through the nose that the t, k or s right after it
cuts off. It left one gap on its own tuning set. On C4 quarter notes it still
missed *nunc*, *tunc* and *mens*.

## The murmur was found, then thrown out

Read frame by frame (5 ms hops), the n of *nunc* on C4 is plain: 60 ms of
sound 8 dB or more darker than the /u/ before it (much less energy above
1 kHz than under 500 Hz), its level and its darkness both holding. One of the
reader's existing rules, which compares a murmur with the vowel just before
it, had already found exactly that run.

What threw it out was a second check, `vowelAgain`. A murmur closes a
syllable, so if the vowel comes back after it, the dark run was something
else, such as a vibrato swing taking a harmonic off the first formant for
30 ms on a high note. The check read every frame after the run, to the end of
the window, and so it also read the consonant after the murmur:

- the /s/ of *mens* is bright and only about 8 dB under the vowel, which
  passed for vowel;
- on *nunc* and *tunc* a single frame did it: as the murmur hands over to the
  k's closure it brightens for 5 to 10 ms.

So the fix is small. When a stop's closure or a fricative starts within five
frames of the murmur's end, `vowelAgain` now reads only the frames in between,
and asks for two or more vowel-like ones. Everywhere else it reads as before.

## Tested on syllables it had never sung

Every corpus test set in this project has already printed its misses in some
earlier round, so none of them is clean held-out data any more. This round
wrote a new one, part K of `eval/coda-check.mjs`: 14 cluster syllables
(*fons, dens, pons, mons, gens, hinc, runt, bunt, tent, cant, frons, sanct,
lunt, quent*) and 22 others, none sung in any earlier part, at five pitches
none of the tuning sets used (B2, F3, A3, B3, D4), at 104 BPM instead of 120.
The predictions went into the script's header and were committed before K
was run with the change.

| prediction | before | after |
|---|---|---|
| K's cluster nasals no fewer, and at least 1 more | 121 of 140 | 127 of 140 (90.7%): held |
| K's other syllables within 1, no new nasals | 166 of 220, 6 nasal | 166, 6: held |
| K's vowel-only control identical | 295 of 360 | 295: held |
| every older part unchanged | | byte-identical: held |

On the tuning set the change took cluster nasals from 124 to 127 of 132.

## What the new set showed that it wasn't built to test

On pitches it was not tuned on, the reader does worse at everything, not
just clusters. On K it reads the non-cluster syllables right 75.5% of the
time and the vowel-only control (the choir singing vowels only, which should
read as no consonant) right 81.9% of the time. On its tuning set those were
90.5% and 95.1%. Most of the gap is one fault already on the list: /i/ read as
a voiced fricative, 83 of K's 119 misses outside the clusters.
That is now the clearest next item,
along with E4 eighth notes, where the murmur of *nunc* is 18 to 33 dB under
its vowel (only one harmonic of a 330 Hz voice passes under 500 Hz) and reads
as a voiced closure.

None of this has been listened to. The round changes what the check can see,
not what the choir sings. Whether the sung *nunc* sounds like *nunc* is still
a question for an ear.

The code, the report and the registration are in
[`ventures/chant-forge`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/chant-forge)
(README, "nunc and mens on C4"). MIT licensed.
