---
title: "Sunt read as sut: the n a synthetic chant choir sang and its own checker missed"
seo_title: "Synthetic choir: reading the n in -unt before its stop"
date: 2026-11-16
tags: [chant-forge, music, speech-synthesis, acoustics]
description: "Chant Forge's choir sang the n in sunt, but its acoustic checker heard only the t. One cue fixed it: a murmur starts with a step, not a ramp."
---

Chant Forge turns Gregorian chant into tracks for the gym, with a synthesised
men's choir singing the Latin. Nobody has listened to that choir yet, so every
change to it is checked by machine. A small acoustic reader (`onsets.mjs`)
listens to the rendered audio and writes down which consonant it hears at the
end of each syllable. The reader never sees the synthesiser's settings.

Before today it kept writing *sunt* down as *sut*.

## The n was there

Read frame by frame, the n in *sunt*, *ant* and *mens* is plainly in the audio.
It is a nasal murmur of 50 to 70 ms that the t's closure cuts off. Through it,
the energy above 1 kHz drops 17 to 55 dB against the band under 500 Hz,
compared with the vowel just before. The reader's three nasal rules each missed
it for a different reason:

- **Too loud.** The level rule wants a murmur at least 5 dB quieter than its
  vowel. The choir has five slightly detuned voices whose low harmonics beat
  against each other, and on low notes that leaves the murmur only 2 to 4 dB
  under the vowel.
- **No step under 500 Hz.** That rule was written for *-um* after a dark vowel,
  and the n of *-unt* doesn't drop in that band.
- **Not steady enough.** The newest rule wants the murmur's darkness to hold
  within 4 dB, and here it wobbles by about 6.

So the reader skipped the n and found the next thing it recognised, the t.

## Step, not ramp

The obvious fix ("anything dark just before a closure is a nasal") was the
first draft, and it failed on a synthetic set of 39 syllables at six pitches.
It read *up*, *uc*, *ub* and *ap* as nasals 14 times. A vowel darkens on the way
into a closure too. That happens most of all to /u/, whose resonances slide
toward the lips or the soft palate.

The frame-by-frame numbers showed the difference. A vowel darkens as a ramp, 2
to 5 dB per 5 ms hop. A murmur darkens as a step: the nose takes over in one
hop, 8 to 15 dB at once, and then holds. So the new rule asks for a dark run of
40 ms or more that starts with a step of 8 dB within two hops and lasts right up
to the obstruent. On the synthetic set, cluster nasals went from 46 to 124 of
132, and not one other syllable changed its reading.

## Written down before it was run

The thresholds were chosen on synthetic syllables only. Every corpus set had
already been used in earlier rounds, so none of them was clean held-out data
any more. Instead, five predictions went into the check script's header and
were committed before any corpus set was run with the rule. All five held:

| | before | after |
|---|---|---|
| *unt*/*ant* in the tuning set | 7 of 12 | 12 of 12 |
| nasals in 51 scan-checked pieces | 106 of 137 | 116 of 137 |
| corpus cluster nasals (five sets) | 7 of 11 | 11 of 11 |
| vowel-only control, every set | | identical |

## What it doesn't tell you

Nothing in the synthesis changed. The checker can now see an n that was already
being sung. Whether a listener hears *sunt* or *sut*, and whether five real
voices beat the way five synthetic ones do, still needs a person with
headphones. The details, including the syllables still missed (*nunc* and
*mens* on high notes, where the murmur arrives without a step), are in the
project's README under "-unt read on its stop". The code is MIT licensed.
