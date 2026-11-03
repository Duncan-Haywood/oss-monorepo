---
title: "Chant Forge gets an intro: bars of silence before the chant"
seo_title: "Adding an intro to a Gregorian chant MIDI track for metal or house"
date: 2026-11-03
tags: [music, midi, gregorian-chant, open-source]
description: "chant-forge --intro N puts N bars of silence before the chant so the drums and bass can start first. Cue sheets and lyrics shift to match."
---

A chant that starts on beat one of bar one gives a producer no room to let the groove in. `chant-forge --intro 2` now adds two bars of silence before the first note. The backing (drums, bass, chords) is sized to the longer piece, so it plays under the intro, and the cue sheet, the timed lyrics and the phrase markers all move later by the same amount.

At 120 BPM two bars add exactly four seconds; a test checks that to within 0.15 s. Other tests check that bad counts (0, a fraction, text, more than 16) are refused and that it works with a backing and a cue sheet. The 83 tests in the venture pass. Nobody has listened to it yet: it is a timing change, and the ear check is still on the roadmap.
