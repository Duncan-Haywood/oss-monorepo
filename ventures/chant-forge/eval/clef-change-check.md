# A C clef printed inside a staff (2026-11-14)

GregoBase 3437 (*Adhaesi*, gradual, 1908 Graduale p. [125]) had 16 of the 73 note differences left
across the repository's 74 piece checks (`porrectus-top-check.md`, "Not done"). Looked at on the scan
(leaf 710, staff 3), they are one fault in the reader, not in the transcription: the verse starts in the
middle of a staff, after a double bar, with a new C clef on the third line (`<sp>V/</sp>.(z0::c3)` in the
GABC). `findClef` only looks for a clef at the start of a staff, so `scan.mjs` read the new clef's two
blocks as a podatus and every note after it two steps low, against the old c4 line.

The MIDI converter was never affected: `parseGabc` follows the clef change (*Bo-* is `h` under c3, MIDI
60), so the music the product plays was right. What was wrong was the check that says whether it is.

## The rule (`findClefChanges` in `scan.mjs`)

The 1908 type's C clef is two blocks a third apart, one in each space either side of its line, joined
by a curve on their **left**. A podatus's two heads are joined by a stem on their **right**. So two heads
that `readStaff` already finds:

- one above the other (centres within 0.3 spaces across), two steps apart, both in spaces;
- with ink unbroken from one to the other in a column at their left edge (up to 3 px outside it, a
  quarter space in);
- and not at their right edge;

are a clef on the line between them. Their two blocks are dropped from the notes, and every note to the
right is read against the new line. Only C clefs inside a staff are read; the 1908 book's clef changes
seen here were all C clefs (c4 to c3 at a verse, and c3 back to c4 on two pages).

A solid tall run, as `findClef` uses at a staff's start, does not work inside a staff: the clef's left
curve is thin in the middle, and on leaf 710 only one column of it reaches 1.26 spaces. Measuring the
join over the gap between the blocks does.

The rule was written from one clef (leaf 710) and then frozen. `readPage(img, { clefChange: false })`
and `scan-check.mjs --no-clef-change` read as before. The check report now names notes under the clef
in force at that point of the GABC (`gabcSteps` gives each note its `clefLine`), so a note after a clef
change is no longer reported under the piece's first clef's letters.

## On the 74 piece checks it was not built on

The eight earlier piece lists (212 pages, `--trials 0` both ways):

| | before | after |
|---|---|---|
| notes agreeing with the GABC | 13,932 | 13,949 |
| notes differing | 73 | 57 |
| GABC only (not read) | 416 | 415 |
| scan only (marks the GABC lacks) | 32 | 29 |

The reader found 11 clefs inside staves on the 212 pages. Every one was cropped and looked at: all 11 are
C clefs on the third line, after a double bar (leaves 409, 489, 538, 595, 639, 646, 677, 706, 710, 742,
774). Only 3437 changed its difference count (16 to 0); eleven other pieces read two fewer notes (the
clef blocks) and agree on as many as before. No piece got worse.

## Held out: fourteen pieces with a clef change, listed before their pages were read

`clef-change-fresh-pages.json`, committed before any of its pages was downloaded: every GregoBase id
3461-3800 whose `book:` header names only the 1908 Graduale, whose GABC changes clef, and that is in no
earlier list, leaving out five whose page had already been scanned (named in the file). The GABC files
are unmodified GregoBase downloads in `corpus/gregobase-1908-clef/`, except one correction (below).
Before and after on the files as downloaded:

| piece | agree, before | differ, before | scan only, before | agree, after | differ, after | scan only, after |
|---|---|---|---|---|---|---|
| 3461 (Quemadmodum) | 223 | 2 | 3 | 224 | 1 | 1 |
| 3500 (Qui operatus est) | 309 | 1 | 0 | 309 | 1 | 0 |
| 3506 (Suscepimus Deus) | 226 | 13 | 2 | 238 | 1 | 0 |
| 3522 (Gloria et honore) | 184 | 13 | 6 | 200 | 0 | 1 |
| 3524 (Gloriosus Deus) | 339 | 13 | 3 | 352 | 0 | 1 |
| 3551 (Electi mei) | 228 | 7 | 4 | 237 | 0 | 0 |
| 3562 (Unam petii... Ut... visitem) | 189 | 1 | 4 | 191 | 0 | 1 |
| 3566 (Angelus Domini Raphael) | 135 | 23 | 3 | 158 | 0 | 1 |
| 3567 (Dabo te) | 231 | 15 | 4 | 246 | 0 | 2 |
| 3619 (Benedicta es tu) | 222 | 5 | 3 | 228 | 0 | 0 |
| 3679 (Repleta est) | 226 | 10 | 3 | 236 | 1 | 0 |
| 3706 (Propter fratres meos) | 171 | 5 | 3 | 171 | 5 | 3 |
| 3762 (Beatus vir cujus) | 231 | 3 | 3 | 234 | 0 | 0 |
| 3775 (Domine spes mea) | 211 | 18 | 5 | 228 | 4 | 0 |
| **all** | **3,125** | **129** | **46** | **3,252** | **13** | **10** |

Differences fall from 129 to 13 and marks the GABC lacks from 46 to 10. The reader found 12 clefs inside
staves on the 55 pages; all 12 were cropped and looked at, and all are C clefs read on the right line
(ten c4 to c3, and two c3 back to c4 on leaves 605 and 721, read as line 4). 3706's clef change falls on
a page past the four read (the alignment covers its notes 1-191 of 215), so it is unchanged.

## A transcription slip it uncovered: GregoBase 3775

Three of 3775's four remaining differences, and one more, were the four notes of *et confirmásti* in the
verse (leaf 484, p. 458, staff 6, after the full bar): GABC `et(ff) con(f)fir(f)`, scan h h h h. On the
scan the four heads sit on the verse's c3 clef line, the line `sce(h)` sits on earlier on the same staff,
and the next neume `má(ih...)` starts a step above them. The book prints h. The corpus copy is corrected
to `et(hh) con(h)fir(h)` with a `correction:` header; the piece then agrees with the book on all 232 notes
the reader finds (`clef-change-fresh-report.md`, written after the correction: 3,256 agree, 9 differ). As
with the Te Deum, 3427 and 3912 corrections, a second human reader is wanted. Whether the slip is still in
the live GregoBase file was not checked after the download.

## Not done

- The other nine differences on the fresh list (3461, 3500, 3506, 3679: one each; 3706: five) have not
  been looked at.
- F clefs inside a staff are not read; none was seen in these books' clef changes, but the 1908
  Graduale does print F-clef pieces.
- A clef change with no double bar before it, or one the reader's head finder misses, would still be read
  against the old clef; none was seen.
