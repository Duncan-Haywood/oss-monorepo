---
title: "A slow lip closure, and a held-out part that missed for a different reason"
seo_title: "A slow lip closure rule that failed its held-out part"
date: 2026-11-17
tags: [chant-forge, audio, speech-acoustics, pre-registration]
description: "A rule for slowly closed m's gained 16 cells on development parts and 2 on its held-out part. The held-out misses turned out to be a different shape."
---

Chant Forge turns Gregorian chant into finished tracks, and its preview choir
sings the Latin. A small rule-based reader checks the sung consonants from the
rendered audio, the way a listener would. A rule that changes the reader is
tried on development parts first. Then it is judged on a new held-out part,
with its predictions committed to git before that part is ever run. This is
the twenty-fifth round of that loop. Its rule failed, and the way it failed
was useful.

## What the last round left

[The round before](2026-11-17-chant-forge-an-m-that-holds-level.md) left 11
cells of part b where a final m or n after /u/ was sung but read as nothing:
*num* three times, *mum*, *bun* and *cun* twice each, *run* and *vun* once,
mostly on D#4 and E4. The default rule for these, `lipShut`, looks for the
moment the lips meet. The band above 1 kHz drops 12 dB or more within two 5 ms
hops, and then the level holds within 4 dB for 30 ms.

Read frame by frame, *num* on an E4 quarter note does both, just more slowly.
Its upper band falls 0, -3, -5, -9, -13, -15 dB against the vowel, which takes
five hops. Its level then slides from -2 to -8 dB before it settles. The
30 ms hold, measured from the fall, misses by 2 dB.

## The rule, and the guard it needed

The slow form counts the fall from any of the four frames before it, and lets
the hold start up to two frames late. The first version read 6 of part A's
vowel-only /u/ cells on C4 as nasals, and 15 of part J's controls. A /u/ fading
at a note's end dips 15 dB in that band too, and then its vibrato brings it
back 8 dB. So a late hold now counts only when the band never climbs back more
than 4 dB over its lowest point since the fall. With that guard, every
vowel-only control on every development part read the same as before.

Development, A to b: about 16 cells gained (b alone 133 to 137 of 144) and two
lost, both a stop or bare vowel read as a nasal.

## Held out: part c

Part c was written before it ran. It has 12 nasals after /u/ or /o/, chosen
to look like b's misses (nasal, labial and cluster onsets), plus stops, bright
vowels, clusters and controls, none sung in any earlier part, at 88 BPM.

| c | default | slow form | wanted |
|---|---|---|---|
| nasals after /u/ or /o/ (of 144) | 123 | 125 | 3 or more better: **fails** |
| bright-vowel nasals, n-clusters (of 48 each) | 48, 44 | 48, 45 | no fewer: holds |
| voiced, voiceless stops, others | 60, 36, 48 | 60, 36, 48 | no fewer: holds |
| cells read as a false nasal | 15 | 15 | at most 1 more: holds |
| vowel-only control (of 384) | 369 | 369 | identical: holds |

One short of the bar, so the slow form ships opt-in and the default reader is
unchanged.

## Why it missed

The default missed 21 of c's dark-vowel nasals, plenty to test the rule on.
But 18 of those 21 were not slow closures. They were two-consonant onsets
before -um: *brum* 6, *glum* 5, *stum* 4, *flum* 3. The slow form takes none of
them back. It was written for one shape, and the held-out part's misses were
mostly another. The last two failed rounds made the same mistake: they took
the shape of the development misses for the shape of misses everywhere. Moving
the reference vowel 100 ms later fixes only 2 of these, so a reference landing
in the onset is not the cause. These cluster onsets are the next thing to read
frame by frame.

Part c also caught a fault in the default reader that 26 earlier parts did
not. All 15 of its vowel-only misses are in one cell, A#3 quarter notes. There,
every /u/ syllable sung on its vowel alone reads as a nasal by the plain level
rule. The bright vowels and /o/ in the same cell read correctly.

Everything is in the repository. The frames come from
`node eval/dark-nasal-diag.mjs b num` and `... c brum`. The registration and
its outcome are in the header of `eval/coda-check.mjs`. The numbers are in
`eval/coda-check-report.md` and the README, "A dark-vowel m that closes slowly".
This round changed only the reader. The synthesis did not change, and nobody
has listened to these cells.
