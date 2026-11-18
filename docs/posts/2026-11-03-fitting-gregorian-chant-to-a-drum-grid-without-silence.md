---
title: "Fitting Gregorian chant to a drum grid without padding it with silence"
seo_title: "Gregorian chant to MIDI: stretching long notes to fit 4/4 bars"
date: 2026-11-03
tags: [music, gregorian-chant, midi, open-source]
description: "Chant has no metre, drums do. Chant Forge now lengthens a phrase's long notes to fill whole bars, cutting padded rest by 51 to 68 percent on five pieces."
---

Chant Forge sets public-domain Gregorian chant over deep house, EDM, rock or metal drums. The hard part is that chant has no bar lines in the pop sense, while a drum loop needs each phrase to start on a downbeat.

The first answer was to pad: keep every note as written and add rest after each full bar until the next phrase lands on beat one. It works, but long gaps make the singer sound like they keep stopping.

The new `--fit 8 --stretch` option instead lengthens the phrase's own long notes first (the ones with a mora dot or episema, then the phrase-final note), each by at most double, and pads only what is left. Pitch, order and lyrics do not change; each stretched note records how much it grew.

Rest left in the pulses (eighth notes) over the whole piece:

| Piece | Padding only | Stretching |
|---|---|---|
| Dies irae | 171 | 79 |
| Pange lingua | 19 | 6 |
| Salve Regina | 53 | 26 |
| Te Deum | 200 | 87 |
| Veni Creator | 13 | 6 |

That is a count of silence, not a verdict on how it sounds: no ear check against a synthesiser has been done yet, and the five pieces are the corpus's own, so there is no held-out set. Five tests cover the rule, including that the input is not mutated and every phrase ends on a downbeat.

The code is MIT in [`ventures/chant-forge`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/chant-forge).
