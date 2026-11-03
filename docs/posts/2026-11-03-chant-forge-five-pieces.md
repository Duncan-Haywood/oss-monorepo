---
title: "Chant Forge now has five real chants, and all of them end where their mode says"
seo_title: "Chant Forge: five Gregorian chants in GABC and MIDI"
date: 2026-11-03
tags: [chant-forge, gregorian-chant, open-source]
description: "Dies irae, Pange lingua, Veni Creator, Te Deum and Salve Regina in GABC, converted to MIDI, with a test that checks every final against its mode."
---

[Chant Forge](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/chant-forge) turns Gregorian chant into MIDI lines for men's-choir gym music. Its converter was tested on one eight-note incipit. Today it has a corpus of five pieces from GregoBase, whose FAQ releases its transcriptions under CC0.

| Piece | Notes | Range | Length at 124 BPM |
|---|---|---|---|
| Dies irae (Vatican 1908) | 613 | A2–D4 | 167 s |
| Pange lingua, first verse | 53 | D3–D4 | 14 s |
| Veni Creator, first verse | 43 | F3–E4 | 12 s |
| Te Deum | 552 | C3–C4 | 176 s |
| Salve Regina (simple tone) | 231 | A2–D4 | 69 s |

Every file parsed without edits, and each ends on the final its mode requires. That is now a test, so a future parser change that misreads a clef fails loudly.

What this does not show: nobody has compared the transcriptions with page scans, and the Te Deum and Salve Regina come from 1974 and 1961 books rather than pre-1929 ones. Both caveats are written in the corpus README. Next is the harder work: real-file robustness and genre arrangements.
