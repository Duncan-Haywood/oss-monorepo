---
title: "Giving a six-verse chant a breakdown: what the arranger changes before the last drop"
seo_title: "Breakdown and riser for chant-based dance tracks, in MIDI from code"
date: 2026-11-13
tags: [ventures, chant-forge, music]
description: "Chant Forge now turns the verse before the last drop of a long hymn into a breakdown and gives every build an approach chord and a riser. Measured levels, and what still needs an ear."
---

Chant Forge turns Gregorian chant into gym tracks: a men's choir line over
deep house, EDM, hard rock or metal, generated as MIDI from the chant's GABC
source. Earlier today it learned song sections. Each double bar in the chant
ends a section, verses alternate with drops, and a build bar leads into each
drop. On the six-verse *Pange lingua* that gives verse, drop, verse, drop,
verse, drop. Three identical turns in a row sound like a loop, not a song.

**The fix is the one dance producers use: a breakdown before the last drop.**
A piece with four or more chant sections now turns the verse before the last
drop into a breakdown. Drums and bass drop out. The choir sings alone for the
first half, then a soft held chord comes in and gets louder bar by bar into
the build. The bars don't move. Only the energy changes, and `--no-breakdown`
turns it off.

**Builds now change harmony as well as drums.** Before, a build bar held
whatever chord the four-bar loop had reached. Now it holds the mode's
approach chord, the one that pulls back to the final: bVII in Dorian and
Mixolydian, bII in Phrygian (its own cadence), II in Lydian. Over it, a riser
climbs seven eighths up the mode, louder each step, and stops at the
eighth-note gap before the drop. Every note is a scale degree, so nothing
leaves the church mode. The tests check that for modes 1, 3, 5 and 7 in all
four genres.

Measured through the preview renderer (backing only, mean power;
`node ventures/chant-forge/eval/section-levels.mjs` reproduces it):

| genre | verse | drop | breakdown | build |
|---|---|---|---|---|
| deep house, 124 BPM | -20.6 dB | -18.8 dB | -31.9 dB | -18.3 dB |
| EDM, 140 BPM | -22.2 dB | -20.5 dB | -34.7 dB | -20.9 dB |
| hard rock, 140 BPM | -21.0 dB | -17.4 dB | -32.4 dB | -18.6 dB |
| metal, 170 BPM | -19.3 dB | -16.9 dB | -35.3 dB | -21.8 dB |

The breakdown sits 11 to 16 dB under the verses, so the last drop comes back
13 to 18 dB above it, against 1.7 to 3.5 dB between an ordinary verse and
drop. Those numbers leave out the choir, which carries the breakdown's first
half.

**What a meter can't tell you:** whether four bars of choir alone feel like a
breath or a dropout, and whether the riser cuts through the snare roll. Nobody
has listened yet. To hear it, run

```sh
node ventures/chant-forge/cli.mjs ventures/chant-forge/corpus/pange-lingua-full.gabc \
  --final 52 --fit 8 --stretch --genre deep-house --sections --intro 2 --outro 2 -o pange.mid
node ventures/chant-forge/render-cli.mjs pange.mid -o pange.wav
```

and the breakdown is bars 39 to 47. The studio page at
[marisstella.app/chant-forge](https://marisstella.app/chant-forge/) uses the
same arranger in the browser, on pasted GABC.
