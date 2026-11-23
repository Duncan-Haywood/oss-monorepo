---
title: "A hum that stops is not a b: testing a guess about a synthetic choir on fresh notes"
seo_title: "A hum that stops is not a b: a choir test on fresh notes"
date: 2026-11-23
tags: [chant-forge, audio, measurement]
description: "Chant Forge's steadier nasal murmur read some m and n as b. A fresh, pre-registered test confirmed it: 9 of 9 on low notes, and the fake burst has no highs."
---

[Chant Forge](../../ventures/chant-forge/README.md) turns Gregorian chant into
tracks sung by a synthesised choir. A reader in `onsets.mjs` listens to the
rendered audio and says which consonant closes each syllable, so we can check
the choir really sings the *m* of *dominum*. It never looks at the
synthesiser's settings.

Five days ago a change to how the choir hums a final *m* or *n* came out mixed.
The new murmur, one voice held at the chorus's level (`murmurSource: 'match'`),
read 2,220 nasals right where the old one read 2,141. But it lost five that the
old one got, and four of those five came back as a *b*. The guess was that a
steady hum that stops when the note ends looks to the reader like a voiced
closure followed by a burst.

That guess came from misses we had already looked at, so testing it on those
same notes would prove nothing. It needed notes nobody had read.

## The test

Part h is new: 16 nasal syllables after *a*, *e* or *i* (*pam*, *flan*, *spen*,
*drin* and so on), 6 syllables ending in *b*, and 4 others. None had been sung
in any earlier part. They were sung at a tempo no other part uses, on thirteen
pitches from E2 to E4, as quarters and eighths, once with each murmur. Before
anything ran, three predictions were written into the script's header and
committed:

1. at least 4 nasals that the old murmur reads right and `match` reads wrong
   (fewer would mean the part can't test the guess);
2. at least half of those read as *b*;
3. at least twice as many nasals read as *b* with `match`, and at least 3 more.

## What happened

| part h | old murmur | `match` |
|---|---|---|
| nasals read right (of 416) | 412 | 407 |
| nasals read as *b* | 3 | 9 |
| real *b* read right (of 156) | 145 | 145 |
| vowel-only notes read as nothing (of 676) | 676 | 676 |

Nine nasals went from right to wrong, and all nine came back as *b*. All three
predictions held. Two things the registration hadn't predicted: all nine are on
the lowest notes, E2 to B2, and the old murmur makes the same mistake there,
just less often. So this isn't a new fault that `match` brought in. It makes an
existing low-note fault more common.

## What the reader thought was a burst

A new diagnostic, `eval/labial-burst-diag.mjs`, prints everything the reader
measured for those notes. The real *b* bursts on the same notes put between 11%
and 79% of their power above 1 kHz. In every fake one, the share above 1 kHz is
0.004% or less. The reader was hearing the low-passed hum switch off and calling
that a release. A real stop's burst is a click of broadband noise, and this had
no top end at all.

That points straight at the next rule: a burst has to carry some energy above
1 kHz. The gap is more than three orders of magnitude here, but the number was
read off part h's own misses. So it gets tried on the development parts first,
then registered and run on a fresh low-pitch part before it ships. Until then
`match` stays opt-in.

As always, this is synthesised audio read by a program, and nobody has listened
to it yet. Full tables: [`eval/murmur-labial-check.md`](../../ventures/chant-forge/eval/murmur-labial-check.md).
