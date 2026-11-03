---
title: "Why chant-forge's MIDI got phrase markers"
seo_title: "Gregorian chant to MIDI with DAW locators at each phrase"
date: 2026-11-03
tags: [music, midi, open-source, chant]
description: "chant-forge's --markers flag writes a MIDI marker at the start of every chant phrase, so a producer can jump between phrases in a DAW."
---

A chant turned into a track is long: a minute of plain chant, repeated, stretched or set over a backing. Moving around it in a DAW meant scrubbing by ear.

chant-forge now takes `--markers`. It writes a MIDI marker on the tempo track at the start of each phrase (a phrase starts at the first note after a bar line), labelled "Phrase 3 Ky" with the first syllable. DAWs show these as locators. Off by default, so existing files are byte-identical.

Two tests cover it (off by default, on from the library and the CLI), and the venture's 79 tests pass. What is not checked: how a given DAW displays the markers. That needs a person with one open.
