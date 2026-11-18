---
title: "Rehearsal tracks for every section of a split chant"
seo_title: "Free choir learning tracks per part from a Gregorian chant MIDI"
date: 2026-11-15
tags: [chant-forge, music, choir, audio]
description: "Chant Forge now writes a part track and a minus-one track for each choir section, the learning tracks choirs usually buy or build by hand."
---

Chant Forge turns Gregorian chant written as GABC text into MIDI, a cue sheet,
a printed score and a preview mix. When a chant is too wide for one section of
men's voices, it hands phrases between tenors, baritones and basses. Until today
the singers then had a score and a cue sheet to learn from, but nothing to put
in their ears.

Choirs usually learn parts from **learning tracks**: one recording per section,
with that part louder than the rest. You can buy them per piece from
rehearsal-track services, or a director builds them in a DAW, one bounce per
part. A split chant needs a set for every section, and they have to be rebuilt
whenever the split changes.

## What it writes

`node render-cli.mjs piece.mid --learn DIR` (and a "Download rehearsal tracks"
button on the [studio page](https://marisstella.app/chant-forge/)) writes two
WAVs per section:

- **part**: the section loud and panned left, the other sections 12 dB down and
  panned right, the band 6 dB down. The pan alone puts the singer's line about
  6 dB louder in the left ear, so they can follow it without losing the others.
- **minus**: the whole mix without that section, to sing the part against.

The sections come from the MIDI's own track names, so a tenor/bass split gives
four files and a TTBB split gives eight, in score order.

## How it was checked

The levels are measured from the rendered audio, not assumed. On a two-phrase
test file the part track's own phrase comes out 6.02 dB louder on the left than
the right, the other section's phrase is mirrored to the right and sits 9 to 15
dB under it, and the minus track is silent wherever only the left-out section
sings. A headless browser downloads the page's ZIP for a split *Dies irae* and
finds all four files byte-for-byte equal to the command line's.

What hasn't been checked: whether singers actually learn faster from these
than from the full mix, and whether 12 dB is the right drop. Rehearsal-track
makers don't agree on it, which is why `--others` and `--backing` set the levels.
The "choir" is still the preview synthesiser, so these are for learning notes,
not for listening.
