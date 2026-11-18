---
title: "A failed registration: Chant Forge's level-hold rule for a sung m gained 2 where 3 were promised"
seo_title: "An m that holds level: a rule that failed its held-out test"
date: 2026-11-17
tags: [chant-forge, audio, speech-acoustics, pre-registration]
description: "A new rule for hearing a sung m after /u/ gained 22 cells on development parts and lost none, then fell one cell short on a new held-out part."
---

Chant Forge turns Gregorian chant into finished tracks, and its preview choir
sings the Latin. A small rule-based reader listens to the rendered audio and
checks the consonant that closes each syllable. Every change to that reader
goes through the same steps. It is tried on development parts first. Then we
write down what it should do on a new held-out part and commit that to git.
Only then do we run the held-out part. This round's rule failed that last
step, and it stays off.

## The miss

[The last round](2026-11-17-chant-forge-a-dark-vowel-m.md) taught the reader to
hear a final m after /u/ by the way the lips close. The band above 1 kHz blips
up as the lips meet and then drops. That fixed some cells. *bum*, *hum* and
*fum* on D4 to E4 still read as nothing.

Frame by frame, the blip was there. But the /u/ had already lost 3 to 8 dB above
1 kHz in the 30 ms before the lips closed. So the m was no darker in that band
than the vowel just before it, and the last round's darkness test failed.

What the m does instead is hold still. Its level settles 4 to 11 dB under the
vowel and stays within 1 to 2 dB for 30 ms or more. A vowel fading out at the
end of a note loses 1 to 3 dB every 10 ms.

## The rule

`lipHold` counts a run as a nasal when all of these hold:

- it starts with the blip-then-fall above 1 kHz (12 dB within three 5 ms hops);
- it sits 3 to 20 dB under the vowel and is dark in itself;
- its level holds within 2 dB for 30 ms;
- it lasts 45 ms, and the vowel does not come back.

On every development part (A to Z, then a) it gained 22 cells and lost none. On part a, the
part it was written from, nasals after /u/ or /o/ went from 121 to 128 of 144.
Every vowel-only control stayed the same.

## The held-out part

Part b was new. It had twelve nasals after /u/ or /o/ (*mum*, *bun*, *dom*,
*ton* and others) and five voiced stops after the same vowels, which are the
risk. It also had bright-vowel nasals, n-clusters, voiceless stops and other
codas. None of these syllables had been sung in any earlier part. It used six
pitches from C#3 to E4 and a tempo no other part uses.

| part b | default | `lipHold` | wanted |
|---|---|---|---|
| nasals after /u/ or /o/ (of 144) | 133 | 135 | 3 or more better |
| bright-vowel nasals, n-clusters | 48, 47 | 48, 47 | no fewer |
| voiced stops, voiceless stops, others | 57, 33, 47 | 57, 33, 47 | no fewer |
| vowel-only control (of 384) | 384 | 384 | identical |

The rule lost nothing, but it gained 2 where 3 were promised, so it stays
opt-in (`lipHold: true`, or `--hold on` in `eval/coda-check.mjs`).

## Why it fell short

We made the mistake an earlier round made. Part a's misses were mostly /u/
before m on high notes, and we expected part b to have as many. It did not. The
default reader already got every -om syllable on b right. Of its 11 misses, 7
were *num*, *mum* and *bun*: an -um or -un after a nasal or labial onset. That
is a different shape, and it is the next thing to read frame by frame.

This reads one synthesiser's choir, not a real singer, and nobody has listened
to these cells. The code, both parts and every figure are in
[`ventures/chant-forge`](../../ventures/chant-forge/README.md) (README, "A
dark-vowel m that holds level").
