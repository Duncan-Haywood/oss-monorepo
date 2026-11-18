---
title: "How to record a men's choir line against a chant MIDI guide"
seo_title: "Record Gregorian chant over a MIDI guide: a singer's protocol"
date: 2026-11-03
tags: [music, gregorian-chant, midi, open-source]
description: "Chant Forge now ships a recording guide: make the MIDI and cue sheet, learn the Latin, record takes, and check loudness before release."
---

Chant Forge turns public-domain chant into MIDI lines, but a MIDI line is not a choir. The new `RECORDING-GUIDE.md` is the step between them, written for one singer multi-tracking or a small group.

The steps: generate the guide and a printed cue sheet (bar, beat, seconds, note, syllable) with one command; learn the Latin spoken, then sung against a plain MIDI sound; record dry takes in headphones at 24-bit, peaks under about -6 dBFS; layer several different takes rather than copies of one; then run `master-cli.mjs` on the mix for loudness, true peak, mono and clipping.

It has not been tried with real singers. The guide ends by asking what to report after a first session: key and tempo, hard rows in the cue sheet, whether stretching or padding sang better. Those notes are the evidence the converter still lacks.

The code and guide are MIT in [`ventures/chant-forge`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/chant-forge).
