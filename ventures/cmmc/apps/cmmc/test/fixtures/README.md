# Test fixtures

- `self-assessment-libreoffice.xlsx`: a made-up NIST SP 800-171 self-assessment sheet (title row, a
  blank row, a header, family headings, a multi-line statement, a cell with commas, a semicolon and
  quotes, a formula whose cached result is "Not met", and a status "mostly" the import must refuse).
  Made on 2026-11-26 from `self-assessment-libreoffice.source.csv` with
  `soffice --headless --infilter="CSV:44,34,76,1" --convert-to xlsx` (LibreOffice's own .xlsx writer),
  so the reader is tested on a file a real spreadsheet program wrote, not only on the test writer in
  `test/unit/xlsx-writer.ts`. The company and e-mail are fictional (`.example`).
- `scoping-worksheet-example.csv`: the CSV the public CMMC scoping worksheet exports for its invented
  example shop ("Example Precision (invented)"), written on 2026-11-26 by
  `inventoryCsv(exampleScope())` from oss-monorepo `ventures/machine-shop-guides/scope.mjs` (MIT, same
  owner), so the asset import is tested on the worksheet's real columns and category labels.
- `scoping-worksheet-example.json`: the file the worksheet's "Save as a file (JSON)" writes
  (`scopeToJson`) for the same invented example shop, plus two assets added to cover the import's
  refusals (an IoT / IIoT spindle monitor and a USB stick with the CUI question unanswered), written
  on 2026-11-26 from oss-monorepo `ventures/machine-shop-guides/scope.mjs`.
- `scoping-worksheet-classify.json`: the worksheet's own `classify(asset, "2")` result for every
  combination of answers per asset kind (456 cases), written 2026-11-26 from the same `scope.mjs`, so
  the port in `src/shared/scope-worksheet.ts` is checked against the original rather than against
  itself. Regenerate both when the worksheet's questions or order change.

  To regenerate the classify fixture, from oss-monorepo `ventures/machine-shop-guides`: for each
  `KINDS` entry, every `cui` (unknown/yes/can/cannot) x `security` x `unsecurable` x `policy` ("" or
  "Blocked by policy") for an asset that is not a service, and every `espData` x `csp` for a service
  (`kind.service`), run `classify({...emptyAsset(kind), ...answers}, "2")` and write
  `{ source, cases: [{ kind, cui, security, unsecurable, policy, espData, csp, cat, gaps }] }`.
