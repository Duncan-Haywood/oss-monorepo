---
title: "A cue sheet so a choir can learn the chant line"
seo_title: "Chant to MIDI cue sheet: bar, beat, note and Latin syllable"
date: 2026-11-03
tags: [music, gregorian-chant, midi, open-source]
description: "Chant Forge now writes a plain-text cue sheet with bar, beat, seconds, note name and syllable for each sung note, for singers learning a line."
---

Chant Forge turns public-domain GABC chant into MIDI choir lines. A MIDI file is good for a synthesiser and poor for a singer, who needs to know where each syllable falls in the bar.

`node cli.mjs piece.gabc --fit 8 --cues cues.txt` now writes one row per sung note: bar, beat, seconds from the start, note name, length in beats and the syllable. The first rows of a corpus piece look like `1 1 0.00 F3 0.5 DI`, then `1 1.5 0.24 E3 0.5 ES`. The times use the same tempo and bar fit as the MIDI file, so the sheet and the guide track agree.

Three new tests check the bar and beat arithmetic, the sheet shape and the CLI flag. The sheet has not been tried with real singers yet, so how readable it is in practice is untested.
