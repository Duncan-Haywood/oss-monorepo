---
title: "A synthetic choir that sings the Latin vowels, checked by measuring them"
seo_title: "A formant-synthesis men's choir singing Latin vowels, measured by LPC"
date: 2026-11-15
tags: [chant-forge, music, audio, dsp, choir]
description: "Chant Forge's preview choir now sings each Latin syllable's vowel: 95% of corpus notes read back as written, against 18% for the old pad."
---

Chant Forge turns Gregorian chant, written as GABC text, into MIDI with the
Latin under each note, a genre backing and a preview mix. Until today the
preview "choir" was an additive pad with a fixed "ah" colour. Every syllable
sounded the same, so you could hear the tune but not where the words fall.

`render-cli.mjs --sing` (and "Choir voice: Sing the vowels of the Latin" on the
[studio page](https://marisstella.app/chant-forge/)) now sings the vowel of each
syllable instead.

## How it works

It reads the vowel with the rules of ecclesiastical Latin. *ae* and *oe* are
*e*, and *y* is *i*. The *u* in *qu*, and in *gu* before another vowel
(*lin-gua*, *san-guis*), is a consonant. An *i* that opens a syllable before a
vowel is a *j* (*iam*, *Ie-su*). The diphthongs *au* and *eu* glide to *u* at
the end of the syllable. The voice itself is classic source-filter synthesis:
five slightly detuned sawtooth voices, each with its own vibrato, run through
five formant resonators set to the average men's vowels from Peterson and
Barney's 1952 study. It has no consonants, so what you hear is a vocalise on
the right vowels, not words.

## Checking it without trusting it

It's easy to write a vowel synthesiser that "uses the right formant table" and
still sounds like mush, so the check measures the audio instead of the
settings. An LPC formant estimator, written separately, reads F1 and F2 from
the rendered choir stem. Each note is then labelled with the nearest of the
five target vowels:

| test | singing choir | old pad |
|---|---|---|
| held vowels, E2 to E4 | 29 of 30 | 6 of 30 |
| corpus notes of 0.2 s or more (five pieces) | 1,497 of 1,571 (95.3%) | 280 of 1,571 (17.8%) |

Before measuring the synthesiser, we tested the estimator on harmonics
weighted by the formant filters' exact response, worked out on paper rather
than by the synthesiser's code. It read 29 of 30 right, so it can tell the five
vowels apart.

## Two things the measurement caught

**The release tail.** The first corpus run read only 79.7%. The pad lets each
note ring for 0.25 s, and in chant at 124 BPM most notes last 0.24 s, so each
note's tail sat over the next syllable. The quieter vowels, /i/ and /u/, were
the ones covered. A real choir doesn't do this, because the same singers move
straight on to the next note. Sung notes now cross-fade in 50 ms, and the
result went to 95.3%.

**One unlucky waveform.** All 74 remaining misses are /i/ on a short G3, read
as /e/. The renderer makes each pitch, length and vowel once and reuses it,
so this is one waveform counted 74 times. Its five voices happen to beat near
the first formant. With 20 other random seeds, 17 of 20 read /i/, and with a
single voice 20 of 20 do. That is a real limit of a small detuned ensemble in a
short window, not a wrong formant setting, and the report says so.

## What it isn't

Nobody has listened to it yet. It has no consonants. Real singers also raise
the first formant on high notes, and this doesn't, so /o/ on E4 reads as /a/.
It is a preview for hearing which syllable lands on which beat, not a release
voice. The plan for a release is still real singers (`RECORDING-GUIDE.md`).
The code is MIT licensed. The full numbers are in
`ventures/chant-forge/eval/vowel-check-report.md`, and
`node eval/vowel-check.mjs` reproduces them in about ten seconds.
