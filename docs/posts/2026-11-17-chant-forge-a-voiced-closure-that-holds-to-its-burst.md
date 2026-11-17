---
title: "A failed chant-reader rule, fixed one round later: 171 to 177 of 192 on a new held-out part"
seo_title: "Fixing a failed rule: a voiced closure that holds to its burst"
date: 2026-11-17
tags: [chant-forge, audio, speech-acoustics, pre-registration]
description: "Chant Forge's coda reader heard sung b, d and g as nasals. A voicing-hold test found why the last fix missed, and a new held-out part confirmed it."
---

Chant Forge turns Gregorian chant into finished tracks, and its preview choir
sings the Latin. A small rule-based reader checks those consonants from the
rendered audio, the way a listener would. Each change to it is tried on
development parts first. It is then judged on a new held-out part, with
predictions committed to git before that part is ever run.

[Earlier today](2026-11-17-chant-forge-a-rule-that-gained-on-development-and-failed-held-out.md)
a rule failed that test. It gained 11 cells on development data and only 1 on
its held-out part, Y. This round started from that failure.

## Why the last rule missed

The fault is a voiced stop (*sob*, *hog*) read as a nasal. As the mouth closes
for the b or g, the vowel darkens and the voice bar starts. To the nasal rules
that looks like an m, and the nasal reading starts earlier than the closure, so
it wins. Latin never puts a nasal before a voiced stop, so the earlier rule
dropped that "nasal" when it ran up to a voiced closure. It applied only to
closures found by the voice-bar rule, which carries guards against n-t clusters.

On Y, most misses ended on a closure found by the ordinary closure rule
instead. Allowing those closures with no guard had already cost nine n-t and
n-c clusters (*mant*, *dant*, *hanc*): an n's murmur leaks into the t's silent
closure and makes it read voiced.

## The test that separates them

A voiced stop's voice bar runs right up to its burst. An n-t's closure is
silent by the end. An n-s runs into the s's hiss. The voice-bar rule already
tests exactly this before a release: the burst must not run into frication,
and the 20 ms before it must still be voiced. This round applies that test to
the ordinary closure rule's closures too.

A first version lost seven cells, four of them final nasals (*om*, *on*,
*gum*, *son*) read as a voiced b. So we listed every reading the rule dropped
across eight parts. A stop's dark lead started 5 to 70 ms before its closure.
The final nasals it wrongly dropped started 185 to 275 ms before a small
release blip. Nothing fell between them, so the rule now drops a run only if
it starts within 100 ms of the closure.

## Development, then the held-out part

On the 23 development parts the rule gained cells in 11 and lost none. No
nasal, cluster, voiceless stop or vowel-only control cell changed for the
worse.

Part Z was new: 31 syllables never sung before, six pitches from A2 to E4, at
98 BPM, a tempo no other part uses. Four predictions were committed first:

| Part Z | before | with the rule | predicted |
|---|---|---|---|
| voiced stops read exactly (of 192) | 171 | 177 | at least 2 more: held |
| voiced stops read as a nasal | 9 | 2 | at least 2 fewer: held |
| nasals, n-clusters read right; read as a stop | 42, 68; 3 | 42, 68; 3 | no change: held |
| voiceless, others, vowel-only control | 36, 24, 359 | 36, 24, 359 | identical: held |

All four held, so the rule is now the reader's default.

## What is left

The rule fixes a reading, not the singing. What remains on Z is a different
fault. After a dark /u/, a sung m is only 4 to 6 dB darker than the vowel, and
the reader hears *lum* and *dun* as nothing. Some voiced stops are also read at
the wrong place (a b heard as a g). Nobody has listened to these renders: the
reader stands in for a listener, it does not replace one.

The code, both parts and every figure are in
[`ventures/chant-forge`](../../ventures/chant-forge/README.md) (README, "A
voiced closure that holds to its burst").
