# Scan check: what looking at the page said (2026-11-13)

`node eval/scan-check.mjs` (report: `scan-check-report.md`) reads the notes off
public-domain scans and lines them up with the corpus GABC. Every place it
flagged was then looked at on the scan, cropped at full resolution. This file
records those looks. Nobody but the agent that wrote the reader has looked;
a second reader is still wanted for the one correction below.

## Scans used

- Graduale Romanum, Vatican edition, Rome 1908: archive.org item
  `gradualesacrosan0000cath` (pages 82*-86*, 115*-123* and the leaves around
  pp. 329, 396, 400, 488, 513 and 555).
- Antiphonale Romanum, Vatican edition, Rome 1912: archive.org item
  `antiphonale00anonuoft` (pp. 56-57, Salve Regina).

Both are pre-1929 printings, so US public domain.

## How the reader was tuned, and what is held out

The reader's thresholds (head height and width, staff-line coverage, the
band searched above and below a staff) were set while looking at Dies irae
p. 83* and the Te Deum pages 118*-121*. The Salve Regina pages (a different
book, printed four years later) and the seven off-final Graduale pieces were
run after the last threshold change, with nothing changed for them. Their
numbers are the fair ones: 214 of 214 notes read agree for the Salve Regina,
and 971 of 972 for the seven Graduale pieces (the one is a reader error,
below).

The planted-error control (a GABC note that agrees with the scan moved a step
up or down, 200 seeded trials per piece) is caught 189-200 times in 200. So
a one-step slip in a transcription has about a 95-99% chance of being flagged;
a slip on a note the reader cannot see (see "GABC only" in the report) has
none.

## Verdicts

| piece | where | flagged | on the page | verdict |
|---|---|---|---|---|
| Te Deum (GregoBase 3656) | p. 120*, staff 7 ("si-ne peccáto") | GABC `si(f)`, scan e | the head sits in the space between the bottom line (d) and the f line: e. The other half-verses of this tone also open on e (`Mi(e)se`, `Fi(e)at`, `que(e)mád`) | **transcription error; corrected to `si(e)` in `corpus/te-deum.gabc`** |
| Te Deum | p. 121*, staff 2 | a mark read as e, no GABC note | the end of "aetérnum" (a clivis and rhombi; the reader takes one stroke twice) | reader |
| Dies irae (an earlier reader version) | p. 86*, staff 4, "A-men" | GABC e, scan c | printed c e (podatus a third apart), f, then rhombi E D: the GABC `(ce!fvED)` | reader; GABC right |
| Dies irae (earlier versions) | porrectus places such as "tur, (ecd)", "bit (igh)" | first note off by the stroke | the slanted stroke runs from the first note down to the second, as the GABC says | reader (fixed: the stroke's ends are now read as its two notes) |
| GregoBase 3403 | leaf 513, staff 5, "su-is" | GABC h, scan g | podatus e-f, then a porrectus h-f-h: `(ef/hfh)` as printed | reader (the stroke's end read a step low) |
| Salve Regina | p. 57, staff 3 ("flentes in hac lacrimárum valle") and staff 6 ("O clemens: O pia") | 9 notes the reader did not find | rhombi, a porrectus, liquescents and two quilismas, each where the GABC has them | GABC right |

Notes the reader did not find elsewhere (9 in Dies irae, 4 in the Te Deum, 70
across the off-final pieces) were not all looked at. They are mostly rhombi,
quilismas, liquescents and notes on ledger lines.

## What this settles

- **Dies irae, Veni Creator (verse 1), Pange lingua (verse 1):** every note
  the reader found agrees with the 1908 book (604, 43 and 53 notes).
- **Te Deum:** the corpus file was a 1974 Solesmes transcription. Read
  against the 1908 book's Te Deum "juxta morem Romanum" it differs in 75
  places and has 85 notes the book lacks: it is a different tone, not a
  different transcription of the same one. It is replaced by the 1908 tone
  (GregoBase 3656, one note corrected as above): 630 of 631 notes read
  agree, and the one is the reader.
- **Salve Regina:** the corpus file is a 1961 Liber Usualis transcription;
  its melody is the 1912 Antiphonale's, note for note where the reader can
  see (214 of 214, plus 9 more checked by eye). The pre-1929 source is the
  1912 Antiphonale, pp. 56-57.
- **Off-final endings:** seven of the 11 Graduale 1908 files that end off
  their mode's final (`offfinal-report.md`) were found in the scan. In each,
  the last notes the book prints are the GABC's (3418's last note was not
  read; its five before agree). So those endings are the book's, not
  transcription slips: the introits end on the psalm-tone differentia and
  the graduals and alleluias on their verse. The other four (3402, 3419,
  3427, 3451) cite bracketed pages from the supplement for particular
  places, which this scan does not include.
