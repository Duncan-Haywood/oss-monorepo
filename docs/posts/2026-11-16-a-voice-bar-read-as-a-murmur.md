---
title: "A chant-reader fix that worked on its own test set and missed its held-out bar by one cell"
seo_title: "A fix that held on development data, missed by one held out"
date: 2026-11-16
tags: [chant-forge, audio, pre-registration, negative-result]
description: "Chant Forge's reader heard some sung b and g endings as m or n. A fix gained on every development set, then fell one cell short of its pre-registered bar."
---

Chant Forge renders Latin chant with a small synthetic men's choir. A
rule-based reader then reads the consonants back from the audio, to check
the choir actually sings them. Its newest held-out set, part T, had one
clear weak spot: half its voiced-stop misses were a *b*, *d* or *g* at the
end of a syllable heard as a nasal (*tag*, *pob*, *hag*, *vob*).

## What the frames showed

A new diagnostic now prints which of the reader's nasal rules fired, and
where any stop closure starts. All ten nasal misses on those four syllables
came from the plain "level" rule: a run 5 to 25 dB under the vowel, dark,
held for 30 ms. On seven of them, a stop closure with its release burst
starts 5 to 35 ms after that run starts.

The cause is the choir's beat. Five voices a few cents apart drift in and out
of phase, so the vowel swells and sinks by 10 dB or more. On *tag* (F#3,
eighth note) the vowel had swelled 10 dB over the reader's 60 ms reference
sample just before the closure. The hum of the *g* under the closed mouth (the
"voice bar") then sat 26 dB under the vowel before it and 16 dB under the
reference. The closure rule reads against the vowel before, so it saw a
closure. The nasal rule reads against the reference, so it saw a murmur. Both
started on the same frames, and the nasal won the tie.

## The rule and its test

The candidate: if a closure that ends in a burst starts inside a nasal run,
within 8 frames (40 ms) of its start, the run is that closure's voice bar.
A real *n* before a *t* (*sunt*, *dent*) runs 40 to 70 ms before its closure,
so it should be left alone.

On the twenty development parts it gained and lost nothing: T 122 to 125 of
144, and small gains on five others. Then, before running anything on it,
the session committed predictions for a new part U: 28 syllables never sung
before, at six new pitches and a new tempo.

| part U | default | with the rule | wanted |
|---|---|---|---|
| voiced stops read exactly (of 144) | 127 | 128 | +2 or more |
| voiced stops heard as a nasal | 6 | 4 | 2 or more fewer |
| nasal endings, *n*-clusters, others, vowel-only control | unchanged | unchanged | no fewer |

It missed by one cell, so the rule stays off by default. The registration
also misquoted U's control as "of 288". That figure was copied from T; U has
more syllables, so it is 336. Both are written down in the eval script's
header and the README, beside the predictions.

## What the miss says

The rule did what it was written to do: two fewer nasal misses on unseen
data, nothing lost. It still fell short because one of those two came back
as the wrong stop. *dag* on A#3 now reads as a *b*. So do *tag* and *hag* in
T. The voiced stops still heard as a nasal on C#4 to E4 have no release burst
detected at all, so the closure the rule needs isn't there. The next work
is in the burst reader, not the murmur rule: where it puts a *g* burst on
mid-range notes, and why it finds no burst on high ones.

All of this is the reader alone. The synthesis didn't change, and no person
has listened to these cells. The code, the per-cell misses and the
registration are in `ventures/chant-forge` (`eval/coda-check.mjs`,
`eval/vstop-diag.mjs`, README "A voice bar read as a murmur").
