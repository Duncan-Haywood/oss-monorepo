---
title: "Why Chant Forge now exports stems, not just a mixed preview"
seo_title: "Export per-instrument WAV stems from a MIDI chant arrangement"
date: 2026-11-03
tags: [music, gregorian-chant, midi, open-source]
description: "Chant Forge's preview renderer can write one WAV per voice that sums exactly to the mix, so a producer can rebalance choir, bass and drums in a DAW."
---

Chant Forge's preview synthesiser is deliberately plain: an additive choir pad, organ drone, bass, chord pad and synthesised drums. A producer will not keep that sound, but they will keep the arrangement. A single mixed WAV is little help for that; the useful thing is to drop each part on its own track.

`node render-cli.mjs piece.mid --stems stems/` now writes `piece-choir.wav`, `-organ`, `-bass`, `-chords` and `-drums` next to the mix. Each stem uses the same gain as the mix, including any `--lufs` target, so adding them back together gives the mix again. A test checks that across a metal arrangement of Dies irae: the stems differ from the mix by less than 1e-9.

Limits: the stems come from the same preview synth, so they are placeholders for real sampled or recorded parts, and nobody has listened to them yet. The code is MIT in `ventures/chant-forge/`.
