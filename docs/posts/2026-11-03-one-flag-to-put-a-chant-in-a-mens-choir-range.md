---
title: "One flag to put a chant inside a men's choir range"
seo_title: "Chant Forge --auto-final: transpose Gregorian chant to a singable range"
date: 2026-11-03
tags: [music, gregorian-chant, midi, open-source]
description: "Chant Forge's new --auto-final transposes a GABC chant so every note sits in E2-E4, or says plainly that the chant is too wide."
---

Chant Forge already had `--suggest-final`, which prints the finals that keep a whole chant between E2 and E4. Using it meant reading the answer, then typing it back as `--final N`. `--auto-final` does both steps: it centres the line in the range and transposes. If the chant spans more than 28 semitones it refuses, rather than clipping notes, and tells you to choose a final yourself.

On the bundled corpus, Dies irae (ambitus 17 semitones) lands on a C#3 final. The E2-E4 range is a rule of thumb, not checked with singers yet; the recording guide in the repository is the protocol for that. Three tests cover the flag.
