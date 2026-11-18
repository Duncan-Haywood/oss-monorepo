---
title: "Gregorian chant over deep house, in 200 lines of JavaScript"
seo_title: "Generate drums, bass and chords under Gregorian chant in MIDI"
date: 2026-11-03
tags: [music, gregorian-chant, midi, open-source]
description: "Chant Forge now turns a GABC chant into a MIDI file with drums, bass and chords in the chant's own mode, for deep house, EDM, hard rock or metal."
---

Chant Forge converts public-domain Gregorian chant (GABC notation) into MIDI. It now also writes the band. Run `node cli.mjs piece.gabc -o out.mid --genre metal --bpm 170` and the file gets drums, bass and chords under the choir line.

The detail that matters is the mode. Chant is not major or minor. The program reads the mode from the file and picks the scale and a four-bar chord loop that fits it: Dorian gets i-IV-i-bVII, Phrygian gets i-bII-i-bVII. Every bass and chord note is checked by a test to sit inside that scale.

Four templates ship: deep house (four on the floor, open hat on the offbeat), EDM, hard rock, and metal in half time with double-kick sixteenths. They are plain functions, deterministic and dependency-free, MIT licensed.

What is not done: nobody has listened to the output through a synthesiser yet, so treat the grooves as a first draft. Next are a loudness and true-peak checker and a release kit. Code: `ventures/chant-forge/`.
