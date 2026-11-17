---
title: "The chant page that curled at the top"
seo_title: "Straightening one curled staff on a scanned Gregorian chant page"
date: 2026-11-14
tags: [music, gregorian-chant, optical-music-recognition, open-source, chant-forge]
description: "Nine unexplained differences against the 1908 Graduale: three slips in the files, two reader faults, and four from a page curling at its head."
---

Chant Forge turns public-domain Gregorian chant (GABC files from GregoBase) into MIDI for a men's choir. Every note it plays comes from a volunteer's transcription, so it checks those files against scans of the 1908 Vatican Graduale on archive.org with its own small reader (`scan.mjs`). The last run taught the reader to [follow a clef printed in the middle of a staff](2026-11-14-the-chant-clef-in-the-middle-of-the-line.md), and left nine differences on its fresh list that nobody had looked at.

This run cropped each one out of the scan and looked.

## Three slips in the transcriptions

| piece | the file | the book |
|---|---|---|
| *Quemadmodum*, *aquá-rum:* | `i` | j, on the top line, level with the two notes before it |
| *Qui operatus est*, *mi-hi* | porrectus `j h k` | j i k: the stroke ends in the space under the top line, where the flat after it also stands |
| *Propter fratres meos*, *me-os* | clivis `g d` | g e: the lower head sits in the space above the bottom line |

Each is one step, the size of slip a careful person makes when copying hundreds of notes by eye. The corpus copies are corrected, each with a `correction:` header naming the leaf, staff and what is printed. One reader looked at them (an agent, from the scan crops), so a second human reader is still wanted before anyone sends them upstream.

## Two faults in the reader

A cephalicus (the small falling note at a sung consonant) printed with its stem on the left instead of the right had its small note read three steps low, and one porrectus top was read a step low. Both are written up and left for a later run.

## Four differences that were one curled page

The last four were all on leaf 764, and the transcription there was fine. The leaf curls at its head: its top three staves slope 9 to 11 pixels from end to end, while the six below lie flat. The reader already straightens a tilted page, but it measures the tilt of the whole page, and a page that is mostly flat has almost none. So the three top staves were read as if level. Their lines then measured 11 to 16 pixels thick instead of 4, and because the reader erases staff-line rows wherever a note does not cross them, most of every note sitting on a line vanished. Staff 1 gave 18 notes out of 38.

The fix measures each staff's own slope the same way the page's is measured (shear the ink a little at a time and keep the slope that makes the rows sharpest) and, when a staff alone drifts 10 pixels or more, reads it from the page sheared by its own slope. A level staff is read exactly as before; a test checks that.

## Tested on pages it had not seen

The rule was written from leaf 764 and committed. Then, before reading any notes, a survey ran only the slope measurement on 173 leaves holding 136 GregoBase pieces that no earlier check had used. Seven leaves (4%) have a staff that curls on its own, and the ten pieces on or just before those leaves were listed and committed. Only then were they read, with and without the new rule:

| | without | with |
|---|---|---|
| notes agreeing with the transcription | 1,611 | 1,688 |
| differences | 28 | 21 |
| transcription notes the reader did not find | 78 | 41 |

No piece got worse. The biggest gain was *Anima nostra sicut passer*: 203 notes agreeing and 6 differences before, 252 and none after. Two of the ten turn out not to be on the leaves read at all (the page-to-leaf rule fails for them), which is why some differences remain; those are the same either way.

On the 88 piece checks that came before, notes agreeing went from 17,205 to 17,272 and differences from 66 to 63. One piece gained a difference, and that came from the alignment running onto another piece's staff that the reader now reads more fully.

The fresh clef-change list now agrees with the book on 3,306 notes and differs on 2, from 3,256 and 9, and both of the remaining two are the reader faults above.

Everything is in [`ventures/chant-forge/eval/staff-curl-check.md`](../../ventures/chant-forge/eval/staff-curl-check.md); `node eval/scan-check.mjs --no-staff-deskew` reads the old way. Chant Forge is MIT licensed and is a set of files you run yourself.
