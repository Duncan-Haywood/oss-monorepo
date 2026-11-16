---
title: "A fix that worked and still failed its test: Chant Forge's g read as a b"
seo_title: "A pre-registered audio fix that worked but failed its test"
date: 2026-11-16
tags: [chant-forge, audio, speech-acoustics, reproducibility]
description: "A new rule fixed every g-read-as-b it was meant to fix, but the held-out set had only one to find. Why the fix stays opt-in, and the bigger fault it found."
---

Chant Forge's preview choir sings Latin, and a rule-based reader listens to the
rendered audio to check which consonant ends each syllable. It sorts a stop's
place (lips, tongue tip, back of the tongue) from the spectrum of the release
burst. Its next fault on the list: on F#3 to A#3, a voiced *g* at the end of
*tag*, *hag*, *dag* or *lag* was being read as a *b*.

## What the bursts showed

Printing each burst's numbers (`eval/vstop-diag.mjs`) gave a clean answer.
Every velar read as a labial had a *compact* burst: 68 to 83% of its energy
above 1 kHz sat in a single 500 Hz band near 2 kHz, which is what a g looks
like. But only 32 to 50% of its total energy was above 1 kHz. The reader asks
"is most of the energy low?" before it asks "is it compact?", and on these
pitches the voice bar's low harmonics, still running under a voiced g's
release, answer the first question for it.

The labial bursts on the same development sets never looked like that. The
compact ones peaked at the bottom of the band, 1.25 kHz, and the ones that
peaked higher were diffuse (58% or less in one band). So the rule wrote
itself: a burst at least 0.65 compact, centred at 1.65 kHz or above, is velar,
whatever lies under it.

## Development, then a registration

On the twenty development parts it gained 7 cells and lost none. Every
vowel-only control stayed the same. Before running anything new, the round
committed six predictions against a fresh part V: 35 syllables never sung in
any earlier part, at six pitches and a tempo used nowhere else. The key one:
V's velar codas read correctly at least 3 more times out of 192.

| V | default | the rule | wanted |
|---|---|---|---|
| velars read exactly (of 192) | 175 | 176 | +3: fails |
| velars read as a labial | 1 | 0 | 3 fewer: fails |
| labials read exactly (of 108) | 86 | 86 | no fewer: holds |
| alveolars, others, control | 57, 59, 420 | same | identical: holds |

The rule fixed the only velar-as-labial cell V had. There was just one. The
fault had been common on the cells already studied, and the prediction
assumed it would be as common everywhere. It wasn't. So the rule stays
opt-in (`compactVelar`), as the registration said it would, and the default
reader is unchanged.

## The bigger fault, the other way round

V turned up something larger: 14 of its 108 labial endings read as a *k*,
12 of them a voiceless *p* on A3 and B3. The synthesiser sings p's burst in a
band around 500 Hz, yet the burst the reader finds there has a 2.1 to 2.3 kHz
centroid. On G2 and F3 the same syllables read fine. That is the next thing to
read frame by frame, before anyone writes a rule for it.

Everything here is the reader checking a synthesiser; nobody has listened to
it. The full tables are in the project's
[README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/chant-forge)
and `eval/coda-check-report.md`.
