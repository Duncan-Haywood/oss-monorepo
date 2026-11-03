---
title: "A one-minute chant is not a track: Chant Forge gets --repeat"
seo_title: "Chant Forge --repeat: a short Gregorian chant as a full MIDI track"
date: 2026-11-03
tags: [music, gregorian-chant, midi, open-source]
description: "Most Graduale pieces last about a minute. Chant Forge's new --repeat flag loops the chant, and the drums, bass and cue sheet follow."
---

Most pieces in Chant Forge's 59-file Graduale corpus run about a minute, while a track on a streaming service usually runs three or more. The new `--repeat N` flag plays the whole chant N times in a row, from 1 to 64. The genre backing is arranged for the longer piece and the singer cue sheet counts the extra bars.

```
node cli.mjs introit.gabc --genre deep-house --fit 8 --stretch --repeat 3 -o track.mid
```

Two tests check that notes and seconds scale exactly with N and that bad values (0, 1.5, 65, text) are refused. Nobody has listened to a repeated chant yet. Three identical passes may tire the ear, and only a listener can say whether the next step should be varied backing per pass.

Chant Forge is MIT licensed; the code is in `ventures/chant-forge/`.
