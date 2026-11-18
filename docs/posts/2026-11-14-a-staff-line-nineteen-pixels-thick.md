---
title: "A staff line nineteen pixels thick"
seo_title: "Staff line detection on crowded Gregorian chant scans"
date: 2026-11-14
tags: [music, gregorian-chant, optical-music-recognition, open-source, chant-forge]
description: "A staff line measured three times too thick erased the notes on it and hid 23 whole staves in 185 pages of the 1908 Graduale. The fix and what it changed."
---

Chant Forge turns public-domain Gregorian chant (GABC files) into MIDI for a men's choir, and checks those files note by note against scans of the books they came from: the 1908 Vatican Graduale and the 1912 Antiphonale on archive.org. The scan reader (`scan.mjs`, no dependencies) finds the staves, picks out note heads, and tells a [rhombus from a square](2026-11-13-teaching-a-chant-scanner-to-see-a-diamond.md), a quilisma and a [liquescent](2026-11-14-the-chant-notes-a-scanner-could-not-see.md).

This morning's job looked small. A height rule for rhombi, added earlier today, still left four squares that the reader called rhombi and that nobody had looked at. Cut out of the page and enlarged, all four were real diamonds in print. The reader had the shape right. What went wrong was the pairing with the GABC, and on one page the reason was obvious: next to the diamonds, the upper notes of two stacked pairs had not been read at all.

## What the reader saw

Printing that staff as ink and paper, row by row, showed it. The reader finds staff lines as rows where ink covers a fifth of the page width. That staff (Qui ambulat, in the 1908 book) recites on one line for a long stretch, and the note heads sitting on that line cover 21 to 26% of the width in the rows just above and below it, with no help from the line. So a line 6 pixels thick was taken as 19 pixels thick.

That matters because of how the reader removes staff lines. A line's rows count as ink only where something crosses the whole line, so a note head on a line is kept and the bare line is not. A head about 22 pixels tall, centred on a 19-pixel "line", does not cross it. Every head on that line was erased or cut to a sliver.

## How far it went

The same check on all 185 pages scanned so far: 38 of 5,444 lines measured half a staff space or more (a printed line is 0.1 to 0.2), and 44 more were 0.3 to 0.5.

It also moved the line's centre by a few pixels, and that broke something else. The reader accepts four lines as a staff only if they are evenly spaced, and it took the spacing from the first two lines. One centre off by 5 pixels and the test fails. On 22 pages a whole staff was never read (one page lost two). On two more pages, three lines of a staff were matched with a row of text underneath, so the staff sat one line too low and part of it went unread.

## The fix

Three changes, all in `findStaves`:

1. **Trim each line to its real rows.** A staff line is ink in horizontal runs hundreds of pixels long; a row of note heads is short runs about 20 pixels wide. Each band of rows is cut back to the rows with runs of 4% of the page width or longer, plus one row on each side.
2. **Also take the spacing from the outer two lines.** With the top and bottom lines fixed, the inner two must sit at a third and two thirds of the way down. A centre a few pixels off moves that spacing a third as much.
3. **Drop a "staff" far tighter than the rest of the page.** The second change let some evenly spaced rows of text through once; a page prints one size of staff.

The first threshold I tried was wrong, and the corpus check showed it. Keeping rows with a quarter of the line's long-run ink shaved faint edge rows off ordinary lines. Those rows stopped being removed, and descending rhombi that touch a line merged into one blob. The Te Deum lost two notes, and one piece lost a note of its ending, the very note that check exists for. At 2%, plus one row of padding, none of those is lost.

## What changed

| on the 185 pages | before | after |
|---|---|---|
| staves found | 1,361 | 1,384 |
| lines half a staff space or more thick | 38 | 3 |
| notes read | 46,079 | 47,864 |

Against the GABC transcriptions, no piece agrees on fewer notes than before. GregoBase 3407 goes from 207 to 216 of 219 notes. GregoBase 3429 goes from 208 of 210 to 286 of 287: its last staff was one of the missing ones, and now the whole piece lines up. Rhombi, quilismas and liquescents are all read more often, in every set of pages.

It also corrected this morning's write-up. The rhombus height rule was built for "worn squares": squares whose white flecks made them look narrow and tapered like a diamond. Some of that was the reader. One of those staves had a top line measured at 17 pixels, and the oversized mask had been cutting the edge columns off the squares on it. With the lines at their real thickness, the plain width-and-taper rule calls 8 squares rhombi instead of 18, and the height rule cuts that to 3. The height rule stays, since it costs no rhombus, but the reason given for it was only half right.

## The limits

These pages are the same ones the problem was found on, and two thresholds were chosen while looking at them, so this is not a held-out test. Every unused piece in the corpus with rhombi has already been used up, so a held-out set needs new GABC files. The next problem is visible in the remaining errors: tilted pages. The two diamonds still mispaired sit on staves where slant alone makes a line 8 to 12 pixels thick, and one visibly skewed page shows 2 of its 9 staves (the old reader found 1). Deskewing each page from the slope of its lines comes next.

The code, the before-and-after script (`eval/thick-line-check.mjs`) and the full tables are in the [chant-forge directory](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/chant-forge), MIT licensed.
