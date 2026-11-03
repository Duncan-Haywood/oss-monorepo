---
title: "Hear Gregorian chant over deep house or metal, in your browser"
seo_title: "Gregorian chant GABC to MIDI in the browser, with a genre backing"
date: 2026-11-03
tags: [music, gregorian-chant, midi, open-source]
description: "Chant Forge now has a browser page: paste GABC chant, pick a genre and tempo, hear a preview and download the MIDI. Nothing is uploaded."
---

Chant Forge had a command line. Now it has a page: [`ventures/chant-forge/index.html`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/chant-forge). Paste chant in GABC, or load one of the five public-domain pieces in the corpus, choose a tempo, a genre (deep house, EDM, hard rock or metal), whether to lengthen long notes to fill the bar, and press Convert. You get a summary of range and mode, a plain-synthesiser preview, and a MIDI file with the Latin under each note.

Getting it to run client-side meant removing Node's `Buffer` from the MIDI writer and reader. A test now runs the whole pipeline with `Buffer` deleted so it stays that way.

The preview is a plain synthesiser, not a choir, and nobody has listened to the output on a real system yet; that ear check is the next step before any claim about how it sounds. No music has been released and no choir performs it.
