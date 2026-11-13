# Corpus

Public-domain chant in GABC, one file per piece. Each file's header names the
book and page it was transcribed from.

## Pieces (added 2026-11-03)

| File | GregoBase id | Source named in the file | Mode |
|---|---|---|---|
| `dies-irae.gabc` | 3441 | Graduale Romanum (Vatican), 1908, p. 83* | 1 |
| `pange-lingua.gabc` | 3855 | Graduale Romanum (Vatican), 1908, p. 123* (first verse only) | 3 |
| `veni-creator.gabc` | 3431 | Graduale Romanum (Vatican), 1908, p. 121* (first verse only) | 8 |
| `te-deum.gabc` | 16704 | Graduale Romanum, Solesmes, 1974, p. 841 (simple tone; matches Liber Usualis 1913 pp. 25*-28* note for note) | 3 |
| `salve-regina.gabc` | 2715 | Liber Usualis, 1961, p. 276 (solemn tone; matches Liber Usualis 1913 pp. 62-63 note for note) | 1 |
| `pange-lingua-full.gabc` | (3855) | Graduale Romanum, Vatican, 1908, p. 123*: all six verses on the checked verse-1 neumes | 3 |
| `veni-creator-full.gabc` | (3431) | Graduale Romanum, Vatican, 1908, pp. 121*-122*: all seven verses on the checked verse-1 neumes | 8 |

Files are unmodified GregoBase downloads (`download.php?id=N&format=gabc&elem=1`).
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
GABC text is usable. Two caveats:

- The Te Deum (1974) and Salve Regina (1961) name post-1929 books. On
  2026-11-13 both were read note by note against the 1913 Liber Usualis
  (public domain) and match it exactly, so the melodies as transcribed are in
  a pre-1929 book (`scan-check.json`, `../eval/scan-check/README.md`). The
  2026-11-03 label "simple tone" on the Salve Regina was wrong: it is the
  solemn mode-1 tone. The Te Deum file is the simple tone (*tonus simplex*).
- The five named pieces were read against page scans on 2026-11-13 (Dies
  irae, Veni Creator and Pange lingua against the 1908 Graduale; the other two
  against the 1913 Liber Usualis): 0 differences in 1,492 notes. The 59 files
  in `gregobase-1908/` have not been read against the scans, apart from the
  ending of 3407. `scancheck.test.mjs` fails if a checked file changes.

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
