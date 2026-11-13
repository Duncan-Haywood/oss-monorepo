# Corpus notes read against the page scans (2026-11-13)

Until today nobody had compared chant-forge's corpus with a printed book. The
GABC files came from GregoBase's volunteers, and two of them (Te Deum, Salve
Regina) named only post-1929 books as their source. This run read every note
of the five named pieces against public-domain scans on archive.org. All five
match. The machine-readable record is [`corpus/scan-check.json`](../../corpus/scan-check.json),
and `scancheck.test.mjs` fails if a checked file changes without a fresh reading.

## Result

| File | Notes | Book read against (printed before 1929) | Scan leaves | Differences |
|---|---|---|---|---|
| `dies-irae.gabc` | 613 | Graduale Romanum, Vatican, 1908, pp. 83*-86* | [874-877](https://archive.org/details/graduale-romanum-1908/page/n874) | 0 |
| `veni-creator.gabc` | 43 | Graduale Romanum, Vatican, 1908, p. 121* | [912](https://archive.org/details/graduale-romanum-1908/page/n912) | 0 |
| `pange-lingua.gabc` | 53 | Graduale Romanum, Vatican, 1908, p. 123* | [914](https://archive.org/details/graduale-romanum-1908/page/n914) | 0 |
| `salve-regina.gabc` | 231 | Liber Usualis, Desclée, 1913, pp. 62-63 (solemn tone, mode 1) | [70-71](https://archive.org/details/liber-usualis-1913/page/n70) | 0 |
| `te-deum.gabc` | 552 | Liber Usualis, Desclée, 1913, pp. 25*-28* (*tonus simplex*) | [603-606](https://archive.org/details/liber-usualis-1913/page/n603) | 0 |
| `gregobase-1908/3407.gabc` (ending only) | 219 | Graduale Romanum, Vatican, 1908, p. 396 | [419](https://archive.org/details/graduale-romanum-1908/page/n419) | 0 |

"Notes" counts the individual pitches the parser reads, so a three-note neume
counts three.

## What the reading turned up

- **The Te Deum and Salve Regina now have a pre-1929 witness.** Both files,
  unchanged, match the 1913 Liber Usualis note for note. The melodies are in
  a public-domain book, and GregoBase releases the transcriptions as CC0, so
  the caveat in `corpus/README.md` ("a pre-1929 source for those two is wanted
  before a release") is met.
- **The corpus README had two labels wrong.** It called the Salve Regina
  the "simple tone". It is the solemn mode-1 tone; the simple tone (*in cantu
  simplici*, mode 5, LU 1913 p. 65) is a different melody. The Te Deum file,
  named as GR 1974 p. 841, is the **simple tone** (*tonus simplex*). The 1913
  solemn tone on pp. 22*-25* departs from it at the first half-verse's second
  half: *te Dóminum confitémur* is e, gh, h, h, g, hi, ivHG, g in the solemn
  tone against h, h, h, g, h, i, h, g in the file. Both labels are fixed.
- **Alleluia 3407 really does end off the final.** Its verse ends d-e-d on
  "bellum" in the 1908 book, as in the file, while the Alleluia above it ends
  on E, the mode-3 final. The other ten off-final endings in
  `eval/offfinal-report.md` were not read against the book. Their structure
  in the file explains them: five introits end on the Gloria Patri's
  *Euouae* differentia; four mode-2 pieces are written a fifth up on A, the
  usual layout for that mode; one Alleluia (3427) ends its verse on F before
  the Alleluia is sung again.
- **What the reading did not check:** rhythmic signs (episemata, dots, the
  ictus), which the Vatican edition omits and the Liber Usualis prints, and the
  syllable text beyond what was needed to line notes up. Pitches and neume
  groupings were read; dotted and plain notes were counted as the same pitch.

## The full hymns

The corpus held only the first verse of Pange lingua and Veni Creator. The
1908 pages print the rest as text under the music, so
[`build-hymns.mjs`](build-hymns.mjs) sets every verse to the checked first
verse's neumes and writes `corpus/pange-lingua-full.gabc` (six verses, 318
notes, 85.6 s at 124 BPM) and `corpus/veni-creator-full.gabc` (seven verses,
301 notes, 83.0 s). The verse texts were read from the scans (p. 123*, and pp.
121*-122* for the first of the two Veni Creator texts printed there) and checked
against archive.org's OCR of the same pages. The syllables were split by hand.
The one elision the page marks (the italic *e* of *Infúnde amórem*) is a
single syllable carrying Gregorio's `<e>` tag. The page prints no music for the
closing Amen, so none is written.

## Method

1. Find the page. The 1908 Graduale's starred pages (*Missa pro defunctis*
   and the appendix) are leaf 791 + N on archive.org: 75* = leaf 866 (leaf
   images `https://archive.org/download/graduale-romanum-1908/page/n<leaf>.jpg`,
   about 1770 x 2730 px). For the 1913 Liber Usualis, archive.org's
   in-book full-text search (`fulltext/inside.php`) gives the leaf for a word
   from the text (*clamámus*, *Chérubim*).
2. Crop each system (staff plus text) at full resolution, split it into
   left and right halves, and read each neume's staff position against the
   four lines (c4: d on line 1, f line 2, h line 3, j line 4; c3 for Veni
   Creator). Zoom in on any figure whose last note is not clear (the two
   porrectus of *éxsules, fílii* in the Salve; the flat and the pes of
   *Lacrimósa* and the *Amen* in the Dies irae).
3. Compare with the GABC group by group, syllable by syllable.

The reading was done by eye by one reader in one session. A second reader is
the obvious next check, and a person who reads square notation can confirm
any line in a minute from the scan links above.
