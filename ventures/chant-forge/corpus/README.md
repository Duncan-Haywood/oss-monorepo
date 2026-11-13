# Corpus

Public-domain chant in GABC, one file per piece. Each file's header names the
book and page it was transcribed from.

## Pieces (added 2026-11-03)

| File | GregoBase id | Source named in the file | Mode |
|---|---|---|---|
| `dies-irae.gabc` | 3441 | Graduale Romanum (Vatican), 1908, p. 83* | 1 |
| `pange-lingua.gabc` | 3855 | Graduale Romanum (Vatican), 1908, p. 123* (first verse only) | 3 |
| `veni-creator.gabc` | 3431 | Graduale Romanum (Vatican), 1908, p. 121* (first verse only) | 8 |
| `te-deum.gabc` | 3656 | Graduale Romanum (Vatican), 1908, pp. 118*-121* (Roman tone; one note corrected from the scan, 2026-11-13) | 3 |
| `salve-regina.gabc` | 2715 | Liber Usualis, 1961, p. 276 (solemn tone); melody read against Antiphonale Romanum (Vatican), 1912, pp. 56-57 | 1 |

Files are unmodified GregoBase downloads (`download.php?id=N&format=gabc&elem=1`),
except `te-deum.gabc` (header lines added, and `si(f)ne` corrected to `si(e)ne` as
printed on p. 120*; see its `correction:` header).
Their headers carry the original transcribers. `chant-forge.test.mjs` parses
every file here and checks the final against the `mode:` header.

## Batch from the 1908 Graduale (added 2026-11-03)

`gregobase-1908/` holds 59 more unmodified downloads (GregoBase ids 3400-3460
whose `book:` header names the Graduale Romanum, Vatican edition, 1908): 17
alleluias, 12 introits, 10 communions, 9 graduals, 6 tracts, 5 offertories and a
few others. Pre-1929 source, CC0 transcription. `batch.test.mjs` and
`node eval/batch-check.mjs` run the converter over them.

## Licence of the GregoBase files

GregoBase's FAQ (gregobase.selapa.net, read 2026-11-03) says: "All chant
transcriptions are released under CC0 (a.k.a. Public Domain) license." So the
GABC text is usable.

### Checked against page scans (2026-11-13)

`node ../eval/scan-check.mjs` reads the notes off public-domain scans and lines them up
with these files (`../eval/scan-check-report.md`, verdicts in
`../eval/scan-check-verdicts.md`). Every note the reader found agrees with the book
for Dies irae, Veni Creator and Pange lingua (1908 Graduale) and the Salve Regina
(1912 Antiphonale). The Te Deum was replaced: the earlier file (GregoBase 16704,
Solesmes 1974) is a different tone from the 1908 book's, so the corpus now has the
1908 Roman tone (GregoBase 3656) with one note corrected from the scan. All five
pieces now have a pre-1929 printed source. Notes the reader cannot see (a few rhombi,
quilismas and liquescents per piece) are not machine-checked.

Each file's header carries:

```
name: Pange lingua;
mode: 3;
office-part: Hymnus;
source: edition, year, page and scan URL (e.g. Graduale Romanum, Vatican edition 1908, p. NNN);
transcriber: who typed it and when;
%%
```

Rules:

- **Public domain only.** Use the 1908 Vatican edition and other editions
  printed before 1929 (US public domain). A newer edition can carry its own
  copyright: check before using it.
- **Third-party transcriptions** (GregoBase and the like): record their licence
  here before copying any of them (done for GregoBase above).
- **Every piece must pass** `node ../cli.mjs piece.gabc`'s mode/final check, or
  the file must say why it doesn't (for example, a transposed final).
