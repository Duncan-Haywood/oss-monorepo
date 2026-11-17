---
title: "On high notes, a synthetic choir's b and g sounded like a hum to its own checker"
seo_title: "Why a voiced stop read as a nasal on high notes, and the fix"
date: 2026-11-17
tags: [chant-forge, audio, speech-acoustics, reproducibility]
description: "Chant Forge's coda reader heard b, d and g as m or n on C#4-E4. A held-out test cut those misreads from 30 cells to 6, and nasals stayed as they were."
---

Chant Forge turns Gregorian chant into backing tracks, with a synthetic choir
that sings the Latin. To check that the choir actually sings the consonants, a
small rule-based reader listens to the rendered audio and writes down what it
hears at the end of each syllable. It is built from textbook acoustic cues: a
stop such as b, d or g is a closure (the mouth shut, only a low "voice bar"
humming through the throat) followed by a short burst of noise when the lips
or tongue let go.

For several rounds the reader kept hearing voiced stops on the top notes of the
range, C#4 to E4, as a nasal (an m or n) or as nothing at all. The last round's
notes said only "no burst found". This round looked at every closure the reader
found on those notes, one at a time.

## Two faults, both about pitch

**The reader never saw the closure.** A closure has to be 12 dB quieter than
the vowel below 500 Hz. On low notes it is. On C#4-E4 the voice bar is only 4-7
dB quieter there, because at those pitches the vowel's energy below 500 Hz is
mostly the fundamental, and so is the bar's. A shut mouth barely dims it. So the
closure test passed the bar by, and the nasal test, which looks for a quiet,
dark hum, took it. On two of the cells the only "closure" the reader found was
the silence after the release.

**b's burst was hidden under the bar.** The burst search listens above 600 Hz,
so that the low hum doesn't count. But on these notes the bar's second and third
harmonics sit above 600 Hz too, and the synthetic b burst, a noise band centred
at 500 Hz, stood only 2-9 dB over them. Above 2 kHz the same burst stands 30 dB
over the bar.

## The rule, and the guard it needed

The new rule, `barBurst`, does two things. If the usual search finds no burst,
it searches again above 2 kHz. And it accepts a dark, voiced run as a closure
when a burst ends it and the hum keeps its level right up to the release.

The first version broke something else. Latin is full of *-nt*, *-ns* and *-nc*
endings, and an n before a t is also a dark, voiced hum. Nine cluster cells
on the development sets (*int*, *tent*, *hinc*, *mens*) started reading as a b
or a d. When the n hands over to the t's silent closure, one frame brightens
above 2 kHz, and the retry took it for a burst. Two guards fixed that: the burst
may not run into an s, and if another closure with its own burst starts right
after the hum, the hum was an n. With the guards, every cluster cell on the
development sets read as it did before.

## Tested on syllables it had never seen

As in every round, the test set was written down and committed before it was
run: 25 syllables never used in any earlier part, at six pitches and a tempo no
other part uses. The committed predictions were at least 4 more voiced stops
read right, at least 4 fewer read as a nasal or nothing on the high notes, and
nasals, clusters, voiceless stops, other syllables and the vowel-only control
no more than one cell worse.

| Held-out part X | before | with `barBurst` |
|---|---|---|
| voiced stops read right (of 144) | 102 | 130 |
| high-note voiced stops read as a nasal or nothing | 30 | 6 |
| nasal codas (of 48) | 42 | 42 |
| n-clusters read as their nasal (of 60) | 51 | 51 |
| vowel-only control read as nothing (of 300) | 292 | 292 |

All six predictions held, so the rule is now the reader's default. On the
older parts it also gained 5 to 11 voiced-stop cells per part. It lost two cells
across all of them: one corpus syllable and one nasal.

## What it doesn't show

This reader checks a synthesiser against itself. A real singer's voice bar is
not this one, and a room puts noise above 2 kHz that a synthetic closure lacks.
Nothing in the singing changed this round, and nobody has listened to it yet;
that check still needs a person. The full write-up, with every figure, is in
the venture's README under "No burst on C#4-E4".
