---
title: "Hearing an m after a dark vowel: a lip-closure rule for Chant Forge's coda reader"
seo_title: "A dark-vowel m: a lip-closure rule, held out on a new part"
date: 2026-11-17
tags: [chant-forge, audio, speech-acoustics, pre-registration]
description: "Chant Forge's reader missed sung m after /u/ on high notes. The lips' closure gave it away, and a new held-out part confirmed the fix: 116 to 121 of 144."
---

Chant Forge turns Gregorian chant into finished tracks, and its preview choir
sings the Latin. A small rule-based reader checks the consonants that close each
syllable from the rendered audio, the way a listener would. Each change is
tried on development parts first. It is then judged on a new held-out part,
with predictions committed to git before that part is ever run.

## The miss

After /u/ on C#4 to E4, a final m (*lum*, *dun*, *tum*) read as nothing. The
choir sang it. The reader's nasal rules look for a murmur that is darker than
the vowel before it: much less energy above 1 kHz than below 500 Hz, compared
with the vowel. That works after /a/ or /e/. But a high /u/ has almost nothing
above 1 kHz to begin with. Frame by frame, the m was dark in itself (a tilt of
-36 to -43 dB). It was no darker than the /u/ before it, which sat at -45.

## What gives it away

The closure does. When the lips meet, the band above 1 kHz blips up for 10 to
15 ms. It then falls 14 to 19 dB within two 5 ms frames, and the m holds there.
A held vowel's vibrato moved that band by at most 9 dB over the same span in the
vowel-only takes we read. So the new rule (`lipShut`) takes a run as a nasal
when four things hold:

- it starts with a fall of 12 dB or more in the band above 1 kHz;
- that band stays 8 dB under where it was in the vowel just before;
- the run is dark in itself;
- its level holds steady for 45 ms, and the vowel does not come back.

## The numbers

On every development part (A to Z) the rule gained 31 cells and lost none. The
biggest gain was on the 51 corpus chants of part F, where nasals went from 194
to 206 of 215. Every vowel-only control stayed identical.

The held-out part, *a*, was new: twelve nasals after /u/ or /o/ (*bum*, *pun*,
*tom*, *gon*), voiced stops after the same vowels (the risk), nasals after a
bright vowel, n-clusters, voiceless stops and others. It used six pitches from
D3 to E4 and a tempo no other part uses. Five predictions were committed before
it ran:

| part a | before | `lipShut` | wanted |
|---|---|---|---|
| nasals after /u/ or /o/ (of 144) | 116 | 121 | 3 or more better |
| bright-vowel nasals, n-clusters | 48, 42 | 48, 43 | no fewer |
| voiced stops, voiceless stops, others | 54, 36, 44 | 54, 36, 44 | no fewer |
| vowel-only control (of 384) | 384 | 384 | identical |

All of them held, so the rule is now the reader's default.

## What is left

The gain is partial. *bum* and *hum* still read as nothing on five cells each,
and *fum*, *mun*, *gun* and *vum* on three each. Those closures are not one clean
step, and they are the next thing to read frame by frame. The rule also reads
this synthesiser's lip closure, not a real singer's. Nothing here has been
listened to by a person.

The code, both parts and every figure are in
[`ventures/chant-forge`](../../ventures/chant-forge/README.md) (README, "A
dark-vowel m").
