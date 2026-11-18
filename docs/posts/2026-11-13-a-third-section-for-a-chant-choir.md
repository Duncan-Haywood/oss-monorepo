---
title: "What a baritone section buys a chant choir"
seo_title: "Splitting Gregorian chant between tenors, baritones and basses"
date: 2026-11-13
tags: [music, gregorian-chant, choir, algorithms, open-source, chant-forge]
description: "Chant Forge now splits a wide chant across three men's sections. On 67 chants, small-range choirs fit 8 more and solo-section notes fall from 89% to 30%."
---

Chant Forge arranges public-domain Gregorian chant for a men's choir over dance and metal backings. A chant that spans more than the band every singer can reach gets split: each phrase goes to the full choir if everyone can sing it, otherwise to the section that can. Until today there were two sections, tenors and basses.

Plenty of men's choirs sing in three, with baritones in the middle. So `--split-voices --baritones` now gives each phrase (or word, when a handoff inside a phrase is allowed) to all three sections, to two of them, or to one.

## What changed in the search

The split was already an exact dynamic programme. It kept the most notes for the full choir, then the fewest changes of singer. With three sections "full choir or not" is too coarse: a phrase sung by tenors and baritones is better than one sung by tenors alone. So the programme now counts section-notes left out. A note sung by one of three sections leaves out two, and a note sung by two leaves out one. With two sections that count is the old one, so every two-section result stayed the same, and the earlier tests pass untouched. A brute force over every assignment of 150 random small chants agrees with the programme.

## What it buys, on 67 chants

The ranges below are assumptions, not measurements of a real choir. They are the same three sets the earlier word-split measurement used, each with a baritone section added between its tenors and basses.

| ranges | files that fit (2 → 3 sections) | notes one section sings alone | changes of singer |
|---|---|---|---|
| textbook | 67 → 67 | 0.9% → 0.0% | 14 → 14 |
| amateur | 67 → 67 | 25.4% → 2.5% | 261 → 280 |
| octave-wide | 56 → 64 | 89.4% → 29.9% | 166 → 484 |

With wide textbook ranges a baritone section changes little. Every chant already fit, and the few phrases one section had to take alone now get two. The section pays off for a choir with small ranges. With octave-wide sections the Dies irae, the Salve Regina and six hymns from the 1908 hymnal become singable. Notes carried by one section alone drop from nine in ten to three in ten.

The cost is in the last column. Three times as many entrances and exits might sound like one line passed around a choir, or it might sound like a relay. The full-choir share also slips slightly with amateur ranges (74.6% to 74.4%), because the count now prefers two sections on many notes over three sections on a few. Both are judgments for singers, and nobody has sung it yet. The next piece of work is a cost on short entrances, so a section does not come in for two notes and leave again.

The MIDI gets a Baritones track, and the cue sheet's who-sings column reads `T+Bar` or `Bar+B`. The studio page has the option too, and a browser check confirms its downloads are byte-equal to the command line's. The full report is `ventures/chant-forge/eval/three-sections-report.md`, and the code is MIT licensed in [the Chant Forge directory](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/chant-forge).
