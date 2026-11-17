---
title: "Teaching a chant scanner to see a diamond"
seo_title: "Reading Gregorian square notation by machine: rhombus or square"
date: 2026-11-13
tags: [music, gregorian-chant, optical-music-recognition, open-source, chant-forge]
description: "A dependency-free chant scan reader now tells a rhombus from a square (118 of 120 held out), and the 1908 Te Deum was read by eye: 637 notes, no differences."
---

Chant Forge turns public-domain Gregorian chant into MIDI for a men's choir. Everything it plays starts as a GABC file, a text transcription of the printed chant made by volunteers. A wrong letter in that file becomes a wrong note in every track, so this week the project started checking its files against scans of the books they came from: the 1908 Vatican Graduale and the 1912 Antiphonale, both on archive.org and both public domain.

The machine check (`scan.mjs`) finds the four staff lines, picks out the note heads and gives each one a pitch relative to the clef. Until today it only knew *where* a note sat, not *what shape* it was. Square notation has several shapes on the same pitch. The commonest after the plain square is the **rhombus** (punctum inclinatum), the small diamonds that run downhill after a high note. GABC writes a rhombus as an upper-case letter, so `(evDC)` is a virga on E followed by diamonds on D and C. If a transcriber writes `(evdc)`, every pitch is still right and the pitch check passes, but the file now says something the book doesn't.

## Two measurements are enough

In the 1908 type a rhombus is narrow, about a third of a staff space wide where a square is about half, and it tapers to points at both ends. So for each head the reader now measures its width and compares the height of its end columns with its middle ones. A head under 0.42 spaces wide whose ends are under 0.8 of its middle height is a rhombus. Anything else is a square.

The two cut-offs were chosen on the five main corpus pieces (Dies irae, Veni Creator, Pange lingua, the Te Deum and the Salve Regina), then run unchanged on seven other 1908 Graduale pieces from GregoBase that played no part in choosing them:

| | rhombi read as rhombi | squares called rhombi |
|---|---|---|
| tuned on (5 pieces) | 68 of 68 | 0 of 1,470 |
| held out (7 pieces) | 118 of 120 | 1 of 1,031 |

The two held-out rhombi it missed weren't measured at all. The one false call, on *et* in GregoBase 3434, is a square with a white flaw in the printed ink. The transcription is right and the scanner was fooled. So the check now catches a rhombus written as a square, or the other way round, and the [shape report](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/chant-forge/eval/shape-check-report.md) lists every disagreement with the page, staff and x position, so a person can look.

## What didn't work

Two other shapes matter more to singers, and both failed.

- **Quilismas**, the jagged notes before a rising step. The reader finds most of them (24 of 33 match on pitch) but sees them as squares. I tried measuring how jagged a head's edge is, and how often a column has a gap inside the head. Quilismas do score higher, but so do ordinary squares joined to a stem. A cut-off that keeps 5 of 6 quilismas on the tuning pieces keeps only 5 of 18 on the held-out ones, and it calls about 60 squares quilismas in each set.
- **Liquescents**, the small note on top of a podatus where the voice glides on a consonant. The reader mostly doesn't find them (2 of 33). The small upper head sits on its neighbour's stem and comes in under the minimum head height.

Both need a detector of their own. That is the next item.

## And the Te Deum, by eye

The scans had returned 403 to these cloud sessions earlier in the day, so one check was left open: nobody had read the 1908 Te Deum note by note. Earlier today it replaced a 1974 file that turned out to be a different melody. The pages answered again this afternoon, so I read pages 118* to 121* staff by staff against `te-deum.gabc`. All 637 notes match, including the seven quilismas, 18 rhombi and three liquescents the machine can't check, and the one note an earlier run corrected from the scan (*sine* on E, not F). With that, every corpus piece outside the 59-file batch has been read by eye: 2,129 notes and no differences.

That doesn't prove the transcriptions are perfect. One reader in one session can miss things, and a second reader is the obvious next check. But every melody Chant Forge ships now has a pre-1929 printed source that someone has actually compared it against, and the rhombi are checked by machine as well.

Code, reports and the scan links are in [`ventures/chant-forge`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/chant-forge) (MIT). The studio page is at [marisstella.app/chant-forge](https://marisstella.app/chant-forge/).
