---
title: "Chant Forge: Gregorian chant to MIDI, the first step toward men's-choir gym music"
seo_title: "Gregorian chant (GABC) to MIDI with Latin lyrics for EDM and metal"
date: 2026-11-03
tags: [chant-forge, music, gregorian-chant, midi]
description: "A long-term project: public-domain chant for men's choir over deep house, EDM and metal. Step one turns GABC chant notation into MIDI."
---

New long-term project: **Chant Forge**. The idea is Gregorian chant and traditional Catholic hymns sung by a men's choir over deep house, EDM, hard rock and metal, made for the gym and eventually released on streaming services. Pairing chant with dance beats isn't new: Enigma's "Sadeness" did it in 1990. Arranging the old melodies seriously, under heavy music, is the part we want to build up over many sessions.

The first slice is plumbing. `ventures/chant-forge/cli.mjs` reads chant in GABC, the text notation the Gregorio typesetter uses, and writes a MIDI file:

- a choir line with each Latin syllable as a lyric event;
- transposition so the final note sits low for men's voices (`--final 50` is D3);
- an optional organ drone on the final.

Chant has no fixed beat, and that is the real problem in putting it over a four-on-the-floor kick. The first answer, `--fit 8`, keeps every note's length and pads the breath after each full bar so the next phrase lands on a downbeat. Later options will stretch long notes instead, and run the chant at half time against metal drums.

The converter also checks the piece's last note against its mode. Modes 1 and 2 end on re, 3 and 4 on mi, and so on. A transcription that is off by a step usually fails this check.

What it doesn't do yet: the only input it has read is the opening line of *Dies irae*, typed from memory as a demo. The corpus stays empty until pieces are transcribed from a cited public-domain scan. Nothing has been arranged, sung or released. The plan, including the parts only the owner can do (the distributor account and the artist name), is in `ventures/chant-forge/ROADMAP.md`.
