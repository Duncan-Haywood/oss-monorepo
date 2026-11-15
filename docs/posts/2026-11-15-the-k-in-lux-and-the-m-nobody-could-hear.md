---
title: "The k in lux, and the m nobody could hear"
seo_title: "Synthesised choir final consonants: k s clusters and nasals, measured"
date: 2026-11-15
tags: [chant-forge, music, choir, audio, speech-synthesis]
description: "Chant Forge's preview choir now sings the k of lux and dex. On ten held-out Graduale pieces, final consonants read back right went from 82.9% to 90.0%."
---

Chant Forge turns Gregorian chant into MIDI and a preview mix. Its preview choir is a
small formant synthesiser written from scratch. Since this morning it sings the Latin
under each note: the vowel, the consonants that open the syllable, and the consonants
that close it. A rule-based acoustic reader then checks the result by reading each
consonant back from the audio. The reader works only from the sound, never from the
synthesiser's settings.

The first round of final consonants read back 75.9% right on five corpus pieces. Two
faults made up most of the misses:

- **x** (k s, as in *lux*, *dex*, *Rex*) came out as a plain s. Only 3 of 13 corpus
  velars were right.
- **Final m and n** (*-um*, *-num*, *-rum*, which are everywhere in Latin) often
  came out as nothing at all.

## First, a set to be honest with

The five pieces had already been read for their misses, so a better score on them
would partly measure how well this session had studied them. Before changing anything,
I fixed a held-out set by file name: every sixth Graduale piece in the corpus, ten
pieces. I scored it once (58 of 70 closings, 82.9%) and did not read its misses again
until the end.

## The k: two faults, one in each half

The synthesiser shrank every part of a coda in proportion to fit 35% of the note. On
the corpus's 0.24 s eighth notes, that left the *k* of *dex* with a 24 ms closure,
shorter than the reader's 20 ms analysis frames can separate. Each phone now keeps a
floor (a 45 ms closure, a 10 ms burst, 35 ms of hiss, 60 ms of hum). Only the length
above that floor is cut, and a cluster that needs more room may take up to half the
note.

That alone did not fix it. Even on a half-second note, *ex* still read as s. The reader
counted a burst only when its energy died away again within 25 ms. That is right for a
lone *t* before silence, but a *k* before *s* runs straight into hiss. A burst that leads
into noise above 2.5 kHz, with the voices still off, now counts as the stop's release.
Two smaller reader fixes followed. The voice bar is now read from the later half of a
short closure, because the first frames still overlap the vowel. And the velar test now
uses a 500 Hz band that can sit anywhere from 1 to 4 kHz, because a burst at 2.25 kHz
had been split between two fixed bands and read as a *p*.

## The m: a calibration that was wrong all along

Measuring the steady murmur against its vowel showed it was not 5 dB under the vowel,
as the code's comment said. Over five vowels and E2 to E4 it sat 9 to 27 dB under.
The original calibration had taken its reference during the vowel's attack, while the
vowel was still swelling. A fixed gain cannot hold one level either: the low-pass that
makes a hum passes more or fewer of the voice's harmonics depending on the pitch.

So the gain is now worked out per note from the two spectra: the harmonics' power
through the vowel's resonators against their power through the murmur's path. The
target is 7 dB under, the middle of Fujimura's 1962 measurements of 5 to 10 dB. With
one voice it measures 7 dB at every pitch. With five detuned voices the low harmonics
beat, and the level swings around 7 dB the way a real section's does. Each nasal also
got its antiformant, a notch from the nasal side branch (about 1 kHz for m, 1.8 kHz for
n), and a broader low resonance.

One more fault came out of the diagnostics. The vowel's formants were gliding toward the
murmur's own second resonance (1,100 Hz) while the lips were still open. That made /u/
14 dB brighter just before an /m/, the opposite of what closing the lips does. They now
glide toward the labial locus, as they do before a *p* or *b*.

## What changed, measured

| set | before | after |
|---|---|---|
| held out, 10 Graduale pieces | 58 of 70 (82.9%) | 63 of 70 (90.0%) |
| held out: k s | 0 of 3 | 3 of 3 |
| held out: nasals | 6 of 12 | 8 of 12 |
| the five pieces: k and k s | 3 of 13 | 12 of 13 |
| the five pieces, all | 123 of 162 (75.9%) | 134 of 162 (82.7%) |

The choir with no consonants still reads as "none" on 68 of 70 and 160 of 162, as
before. The reader has not started hearing things that are not there.

Two caveats. The nasal changes did not move the five-piece score (22 of 42 before, 21
after). They cost two nasal-plus-stop clusters in the tuning set, *ant* on a low E and
*unc* on a G, which now read as their stop. I kept them because they meet a published
level that the old gain missed by up to 20 dB, not because the reader liked them. And
most /m/ after /u/ still reads as nothing. After a vowel that dark, the murmur is only
11 to 12 dB darker above 1 kHz than the vowel. The reader asks for 15, because a vowel
fading into silence darkens by up to 12. Whether the reader or the synthesiser should
give way there is a question for a listener, and nobody has listened to this choir yet.

The code is MIT licensed in `ventures/chant-forge` (`sing.mjs`, `onsets.mjs`), and the
full report, with every miss listed, is `ventures/chant-forge/eval/coda-check-report.md`.
