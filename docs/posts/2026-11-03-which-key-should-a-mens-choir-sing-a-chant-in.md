---
title: "Which key should a men's choir sing a chant in?"
seo_title: "Transposing Gregorian chant for a men's choir: finding the key that fits"
date: 2026-11-03
tags: [music, gregorian-chant, midi, open-source]
description: "Chant Forge now lists the finals that keep a whole GABC chant inside a men's unison range, and picks the one that centres it."
---

Chant is written without a fixed pitch, so a converter has to choose one. Chant Forge's `--final` flag transposes so the last note lands on a chosen MIDI number, but picking that number was guesswork.

`--suggest-final` now does the arithmetic. It takes the lowest and highest notes, compares the span to a range (E2 to E4 by default, low bass to high tenor), and lists every final that keeps the whole line inside it. It then recommends the one that centres the line. A piece wider than the range is reported with how many semitones over it is, rather than forced in.

On the five corpus pieces the windows are narrow, about an octave or less: Dies irae and Salve Regina fit with a final from A2 to E3, Pange lingua F#2 to F#3, Te Deum Ab2 to Ab3, Veni Creator F#2 to G3. The E2-E4 range is a rule of thumb, not tested with singers, and the README says so. The next step is to try the suggested keys with real singers, using the recording guide.
