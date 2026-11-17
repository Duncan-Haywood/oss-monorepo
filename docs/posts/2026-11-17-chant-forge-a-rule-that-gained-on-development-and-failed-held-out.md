---
title: "A chant-reader rule that gained 11 cells in development and 1 on its held-out test"
seo_title: "A rule that helped on development data and not on held-out data"
date: 2026-11-17
tags: [chant-forge, audio, speech-acoustics, pre-registration]
description: "Chant Forge's coda reader heard a sung g as an m. A fix gained 11 cells, none lost, on development parts, then 1 on its held-out part."
---

Chant Forge turns Gregorian chant into finished tracks, and its preview choir
sings the Latin. A small rule-based reader checks those consonants the way a
listener would: from the rendered audio, never from the synthesiser's settings.
Each change to that reader is tried on development parts first. Then it is
judged on a new held-out part whose predictions are committed to git before the
part is ever run.

This round's target was *cog*. On C#4 to E4 the reader heard its final g as a
nasal on 5 of 12 cells.

## What the reader saw

A diagnostic script prints every closure the reader finds and every candidate
burst it tries. It now also prints which nasal rule won and where that rule's
run starts. On each failing cell the g was there: a closure, then a burst. But a
"murmur" started 35 to 40 ms earlier and ran right up to the closure. That was
the /o/ darkening as the tongue rose for the g, then the first frames of the
voice bar. The reader takes whichever candidate starts first, so the nasal won.

Latin has no final nasal before a voiced stop. Its final clusters are -nt, -nc,
-ns and -nx, and all of those stops are voiceless. So the rule wrote itself: a
nasal run that ends at the chosen closure, or inside it, is that stop's lead when
the closure reads voiced.

## The first form broke clusters

On every closure that reads voiced, the rule gained the most: part X's voiced
stops went from 130 to 134 of 144. It also lost 9 cluster cells, among them *mant*,
*dant* and *hanc* in real chant from the corpus. In those clusters the n's murmur
runs into the t's silent closure, and the murmur's tail makes the closure read
voiced. So the rule was narrowed to closures found by the voice-bar rule, which
already carries guards against clusters.

Narrowed, it gained 11 cells across parts K, N, R, T, V and X and lost none. The
corpus pieces and every vowel-only control read exactly as before.

## The held-out part

Part Y was new: 16 voiced stop codas, most after /o/ or /u/, plus nasals,
n-clusters, voiceless stops and vowel-only controls. It was sung at six pitches
and 102 BPM, a tempo no other part uses. The registration asked for at least 2
more voiced stops read right and at least 2 fewer read as a nasal, with nothing
else moving.

| Y | default | with the rule |
|---|---|---|
| voiced stops read exactly (of 192) | 173 | 174 |
| voiced stops read as a nasal | 10 | 9 |
| nasals, clusters, voiceless, control | unchanged | unchanged |

Nothing got worse, but the gain was half what the registration asked for. The
rule stays opt-in and the default reader is unchanged.

## Why, read afterwards

Most of Y's nasal misses end on a closure that the ordinary closure rule found,
not the voice-bar rule. On development parts the voice-bar closures were most of
the cases; on Y they were the minority. The narrowed rule skips exactly the
closures the broader form caught. The next step is a test that tells a voiced
stop's closure from an n-t's on those closures as well. One candidate is voicing
held through the closure's last 20 ms, which the voice-bar rule already checks.

The round also settled *tum*, which reads as nothing on D4 and E4. A diff against
the vowel-only render shows the m is sung: a step about 7 dB down, held within
1 dB for 60 ms. But it is only 4 to 6 dB darker than an /u/ that already has
almost nothing above 1 kHz, and the step rule asks for 7.

All of this is synthetic: a real singer's voice bar is not this synthesiser's,
and nobody has listened to these cells. The figures, the registration and the
commit it was made in are in the
[Chant Forge README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/chant-forge),
under "A g's voice bar read as a nasal".
