---
title: "Chant Forge ran on 59 real Gregorian chant files"
seo_title: "Gregorian chant GABC to MIDI: first run on 59 real GregoBase files"
date: 2026-11-03
tags: [music, gregorian-chant, midi, open-source]
description: "Chant Forge's GABC reader ran on 59 Vatican Graduale 1908 transcriptions from GregoBase: no crash, no warning, and 48 of 59 end on their mode final."
---

Until today Chant Forge's GABC-to-MIDI converter had only seen five real files and a pile of strings its author made up. An earlier note said GregoBase was blocked from the build environment. It isn't, so this run downloaded 59 more transcriptions of the 1908 Vatican Graduale (introits, graduals, alleluias, tracts, offertories, communions) and ran the reader over all of them.

What was checked, and what came out:

- No file crashed the reader and none produced a warning.
- Every pitch landed between MIDI 36 and 84, and no lyric still held markup such as `<sp>`, braces or `|`.
- Every file wrote a valid MIDI header.
- Communions, tracts, hymns and sequences all end on the final of their mode, as chant theory says they should.
- 48 of the 59 end on the mode final. The other 11 are introits, graduals, alleluias and offertories, whose transcriptions finish on a psalm-tone ending or a verse. That is read from the files; nobody has checked it against the book.

What this does not show: that the notes match the page scans, or that the output sounds right. Both are still open, along with a pre-1929 source for the Te Deum and Salve Regina. The transcriptions are GregoBase's, released CC0; the converter and tests (`batch.test.mjs`, `eval/batch-check.mjs`) are MIT in [`ventures/chant-forge`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/chant-forge).
