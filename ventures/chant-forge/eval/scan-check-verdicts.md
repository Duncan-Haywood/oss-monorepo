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
  places, which this scan does not include. *(Wrong, corrected
  2026-11-14: the scan does include the supplement, at leaf = bracketed page
  + 585; see the next item.)*
- **Off-final endings in the supplement (2026-11-14):** the four bracketed-page
  pieces read off leaves 742-753 (`offfinal-supplement-pages.json`,
  `offfinal-supplement-report.md`, `node eval/scan-check.mjs --manifest
  eval/offfinal-supplement-pages.json`):
  - **3402** (*Omnis gloria*, introit, p. [167]): 185 of 187 notes agree, 0
    differ, the whole ending (h g h i g h) read: the book's.
  - **3451** (*Qui ambulat*, gradual, p. [161]): 325 of 332 agree, ending
    (h g f g h f) read: the book's. The one difference (`lén`, porrectus
    `hfg`, read g for h, leaf 746 staff 5) was looked at: the stroke starts on
    the h line, so it is the reader (a porrectus top read a step low), not the
    GABC.
  - **3419** (*Gaudeamus ... Boni Consilii*, introit, p. [157]): the page
    prints only the changed middle ("sub honore beatae Mariae Virginis, Boni
    Consilii Matris") and says "Gaudeamus, 486" for the rest. The middle: 33
    of 33 agree. The rest, read on pp. 486-487 (the Gaudeamus of Our Lady of
    Mount Carmel, leaves 511-512): 165 agree, 0 differ, and the ending (f f d
    c d f, the psalm-tone differentia) is the book's. So the GregoBase file is
    the book's two places put together, as the rubric asks.
  - **3427** (*Lingua pravorum*, alleluia, mode 7, p. [161]): 166 of 179
    agree and the last three GABC notes (`ni(ed) tas.(d)`) pair with nothing.
    Looked at on leaf 746, staff 4 (c3 clef): the clivis on "ni" starts on the
    f line and falls to the space below, and "tas" is in that space: f e | e,
    a step higher than the GABC, ending on the mode-7 final like the jubilus
    before the verse. **Transcription error; corrected to `ni(fe) tas.(e)` in
    `corpus/gregobase-1908/3427.gabc`** (its `correction:` header; the live
    GregoBase file was still the old one on 2026-11-14). With the correction
    the reader pairs all three (f/f e/e e/e) and 169 of 182 agree, 0 differ.
    A second reader is wanted, as for the Te Deum note.
  So of the 11 files that ended off their mode's final, 10 end as the book
  prints them and 1 was a slip; `offfinal-report.md` lists the 10 with what
  each reading found.
