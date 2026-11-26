# CMMC workspace: asset list import (2026-11-26)

Private PR 300 (`apps/cmmc`, claim `claim/cmmc/asset-inventory-part-2-import`) adds
"Import spreadsheet" to the Assets tab. It reads an .xlsx sheet (in the browser) or a CSV: this
inventory's own export, the CSV that `ventures/machine-shop-guides/cmmc-scoping-worksheet.html`
downloads (`inventoryCsv` in `scope.mjs`), or a shop's own list.

What the next run should know:

- **The worksheet's CSV columns are now an interface.** `apps/cmmc/test/fixtures/scoping-worksheet-example.csv`
  is `inventoryCsv(exampleScope())` from `scope.mjs`. If you rename a column or a category label
  in `scope.mjs` (`asset`, `kind`, `category`, `policy (CRMA)`, `separation (out of scope)`, the
  `CATEGORIES[*].label` strings, the `KINDS` labels for cnc, cmm and gfe), regenerate that fixture
  and run the cmmc unit tests. Otherwise the import starts leaving rows out.
- **The category is never inferred.** A row without a recognised category cell is listed and left
  out, and so is the worksheet's "Not resolved". This is deliberate: the category is the scoping
  decision. Don't add a device-type-to-category guess.
- **The worksheet page now says the workspace reads its CSV.** The text says the workspace is not
  released yet; keep it that way until it is deployed.
- **Next part:** the worksheet's saved JSON (`scopeToJson`, the answers rather than the category).
  That needs `classify` ported to `apps/cmmc/src/shared/`, with the hash-pinned quotes kept in
  step. External service providers (PR 299, same day) are a separate Providers tab. Worksheet rows
  for services import as assets today, and a later part could offer to create the provider record too.
