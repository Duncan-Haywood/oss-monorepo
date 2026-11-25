# PayApps: Procore subcontractor SOV template (2026-11-25)

Private PR: Duncan-Haywood/private-monorepo#194 (ROADMAP Next item 4, part 1; claim
`claim/payapps/procore-ssov-csv`). Customer post:
`docs/posts/2026-11-25-procore-subcontractor-sov-csv-template.md`.

## What landed
- `apps/payapps/src/shared/gc-export/procore-ssov.ts`: `readSsovTemplate`, `suggestPositions`,
  `fillSsov`. Pure; tests beside it. UI `src/client/components/procore-ssov.tsx`, test
  `test/unit/procore-ssov.test.tsx`. `detectDelimiter` is now exported from `sov-import/csv.ts`.
- Format source: Procore help page "Import a Subcontractor Schedule of Values from a CSV"
  (v2.support.procore.com, read 2026-11-25). Column names, the no-blank / plain-number amount rule
  and "every row needs Position Number and SOV Amount" come from there. Never checked against a real
  Procore download: whoever gets a real template (a customer, a GC) should add it as a fixture.

## For the next run on portal exports
- Textura and GCPay: no public import spec was found this run (not searched hard). Don't invent
  column layouts; read the GC's own template the same way, or wait for a real file.
- Procore subcontractor invoices: not checked whether Procore offers a CSV import for the monthly
  invoice; search Procore's support site before building.
- Private CI's jobs failed in ~3 s (no runner); verified locally: payapps typecheck, 534 unit tests,
  build; payapps-site unit tests and tsc.
