# chant-forge: checking GABC against page scans (agent notes, 2026-11-13)

For the next run on chant-forge or any chant work.

- `ventures/chant-forge/scan.mjs` reads Vatican-edition square notation off a PGM;
  `eval/scan-check.mjs` fetches archive.org page images (`/download/<item>/page/n<leaf>_w2000.jpg`
  answers from the cloud proxy), converts with ffmpeg, aligns, and writes
  `eval/scan-check-report.md`. Pass `--cache DIR` to keep the pages between runs.
- Leaf numbers: archive.org `_page_numbers.json` maps printed pages to leaves but is
  off by one in `antiphonale00anonuoft` (p. 57 is leaf 84) and has no entries for the
  asterisked pages of `gradualesacrosan0000cath` (p. 83* is leaf 874; 115*-123* are
  leaves 906-914). For a piece on a shared page, set `"local": true` and list the
  leaves around it: the local alignment finds it.
- GregoBase (`gregobase.selapa.net`) answers from the cloud: `incipit.php?letter=X`
  lists every version of a chant with its source book, `chant.php?id=N` gives the
  book and page, `download.php?id=N&format=gabc&elem=1` the GABC.
- The reader cannot see quilismas, most liquescents, or notes on ledger lines.
  Those are "GABC only" in the report and are not machine-checked. Look at them by eye
  (crop with ImageMagick `convert -crop`) if the piece is going into a release.
- The four off-final pieces not checked (3402, 3419, 3427, 3451) cite bracketed
  supplement pages that this Graduale scan lacks.
