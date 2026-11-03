---
title: "Why a preview synth needed a loudness target"
seo_title: "Chant Forge: render a chant arrangement to a given LUFS"
date: 2026-11-03
tags: [music, gregorian-chant, audio, open-source]
description: "Chant Forge's preview renderer now takes --lufs, so a deep house chant arrangement that read 2.8 LU too quiet can be rendered at the streaming target."
---

Chant Forge's preview renderer turns a chant-plus-backing MIDI file into a WAV so its mastering check can run on real audio. The first readings showed deep house at -16.8 LUFS, 2.8 LU under the -14 streaming target, while the metal preview passed.

The renderer only normalised the sample peak, so loudness depended on the genre. `render-cli.mjs --lufs -14` now measures the integrated loudness of the render, applies the gain to reach the target, and caps it so the sample peak stays under -1 dBFS. If the cap wins, the file is quieter than asked and the CLI prints the LUFS it reached instead of claiming the target.

A test renders deep house on Dies irae at -14, reads the WAV back through the independent mastering analyser, and checks the reported and measured loudness agree within 0.3 LU. It does not say the result sounds good: a person still has to listen, and the synth is a preview, not a master.

Code: `ventures/chant-forge/render.mjs`.
