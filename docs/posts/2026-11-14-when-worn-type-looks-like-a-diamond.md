---
title: "When worn type looks like a diamond"
seo_title: "Telling a rhombus from a worn square on a 1908 Gregorian chant scan"
date: 2026-11-14
tags: [music, gregorian-chant, optical-music-recognition, open-source, chant-forge]
description: "Chant Forge's scan reader started calling worn square notes rhombi. The fix was one measurement the wear could not change: height."
---

Chant Forge turns public-domain Gregorian chant (GABC files) into MIDI for a men's choir, and it checks each volunteer transcription against the printed book: the 1908 Vatican Graduale, scanned on archive.org. The scan reader (`scan.mjs`, no dependencies) finds the staff, picks out the note heads and gives each one a pitch and a shape. One of those shapes is the [rhombus](2026-11-13-teaching-a-chant-scanner-to-see-a-diamond.md), the diamond-shaped *punctum inclinatum* of a falling run. The rule was simple: a head under 0.42 staff spaces wide whose end columns are shorter than its middle ones.

It held for two days. Then a set of eighteen pieces nobody had scanned before came back with 14 of 2,641 squares called rhombi. Every earlier set had 0 to 0.35%.

## Looking at them

Ten of the fourteen were on just two staves. The first guess was a scale error, with the reader misjudging the staff spacing there and so seeing every head as narrow. It wasn't: those staves measure 37.7 and 37.8 px between lines, like every other staff on the page.

The crops told the real story. These are ordinary square notes in worn type. The 1908 page shows white flecks inside many heads, and on these the flecks run near the edges. The reader builds a head from vertical runs of ink, column by column, and drops runs that are too short. A fleck splits an edge column into two short pieces, so the column disappears. The head comes out 11 to 13 pixels wide instead of 18 to 20, which is 0.35 to 0.40 staff spaces, and its surviving edge columns are short. Narrow and tapered: by the old rule, a rhombus.

## The measurement the wear could not change

A rhombus is a square turned on its corner, so it is taller than a square. The flecks take columns away but leave the height alone. On one staff:

| heads | width | height |
|---|---|---|
| real rhombi | 0.32-0.35 | 0.69-0.74 |
| worn squares called rhombi | 0.35-0.40 | 0.56-0.61 |
| ordinary squares | about 0.50 | about 0.58 |

Across all 50 pieces scanned before this, twelve of the eighteen false rhombi stand 0.56 to 0.61 spaces tall. All but two of 1,026 real rhombi stand 0.63 or more. So the reader now also asks for a height of at least 0.62 spaces. On those 50 pieces false calls drop from 18 to 6 of 7,501 squares, and two real rhombi are lost (both genuine diamonds that happen to measure short).

I also tried a ceiling, because one false call was a stacked pair of squares read as a single tall piece. It cost more than it saved: a real rhombus touching its neighbour can read 1.09 spaces tall.

## The held-out test, and what it does not show

Those numbers come from the pieces the floor was chosen on, so they flatter it. Before choosing anything, I listed and committed every unused piece in the corpus that has rhombi and whose pages had never been downloaded. There were six. The floor was frozen and committed before their pages were fetched.

On those six: 103 of 103 rhombi kept, and 1 of 596 squares called a rhombus both before and after. The test shows that the floor costs nothing on fresh pages. It cannot show the gain, because those pages had almost none of the wear. Their one false call is the same fault, a worn square measuring 0.62, right on the floor. A fair test of the gain needs fresh, worn pages, and with every unused corpus piece that has rhombi now spent, that means new GABC files.

On the eighteen pieces that started this, the count is now 4 of 2,641.

The rule, the crops' verdicts and every number are in [`eval/rhombus-height-check.md`](../../ventures/chant-forge/eval/rhombus-height-check.md); rerun them with `node ventures/chant-forge/eval/rhombus-check.mjs --held-out --sweep`. Chant Forge is MIT licensed and part of the open-source portfolio at [marisstella.app](https://marisstella.app/).
