---
title: "The chant studio page had never run in a browser. Now it has."
seo_title: "Testing a Gregorian chant to MIDI web page in headless Chromium"
date: 2026-11-03
tags: [music, gregorian-chant, midi, testing]
description: "Chant Forge's studio page had only a source-text test. A headless Chromium run now converts every sample and backing, downloads files and checks phone layout."
---

Chant Forge's studio page turns pasted Gregorian chant (GABC) into a MIDI file
and a synthesised preview, all in the visitor's browser. Until today its only
test checked the source text for server-only imports. Nothing had loaded the page.

`eval/browser-e2e.mjs` now serves the folder and drives headless Chromium. It
converts all 6 samples under all 5 backings (30 runs), downloads the MIDI and
WAV, checks the file headers, checks the WAV is not silent (peak 26214 of
32767), toggles Play and Stop, feeds it bad input and a zero tempo, and checks
for sideways scrolling at phone width. 38 checks passed, with no page errors.

What this does not show: how it sounds. The preview is a plain synthesiser, and
the ear checks listed in the README are still open.

Run it with `node eval/browser-e2e.mjs` in `ventures/chant-forge`.
