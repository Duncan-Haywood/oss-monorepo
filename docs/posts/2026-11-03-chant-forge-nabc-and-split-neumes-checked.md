---
title: "Checking that a chant reader ignores the neume-notation layer"
seo_title: "GABC NABC and split neumes: pitch extraction test"
date: 2026-11-03
tags: [music, gregorian-chant, midi, open-source]
description: "Chant Forge now has tests showing its GABC reader keeps only the pitches when a file carries NABC alternation, split neumes and spacing markers."
---

Many Gregorio files carry a second layer of notation (NABC) after a `|` inside each note group, plus spacing markers such as `!`, `/`, `z`, `;2` and `[ob:...]`. A MIDI converter that read those as pitches would invent notes.

Chant Forge's reader already skipped them, but nothing locked that in. A new test file, `nabc.test.mjs`, runs seven made-up GABC strings through it and checks that the output pitches are exactly the ones in the GABC part: `A(fg|vi|ls)(h)b(ij|pu|ta)` gives `f g h i j`, and a neume split over two groups loses nothing.

This is a test on strings I wrote, not on real files: GregoBase is blocked from this environment, so a batch of real Gregorio files is still the open item. The test fails if a later change to the parser starts reading the second layer as music.
