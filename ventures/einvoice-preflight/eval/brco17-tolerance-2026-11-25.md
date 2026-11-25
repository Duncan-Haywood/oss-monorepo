# BR-CO-17 on the built-in route: a cent off is a warning, as CEN allows (2026-11-25)

**Defect** (quality audit 2026-11-19, `portfolio/quality/audits/2026-11-19-einvoice-preflight.json`):
the default built-in route blocked any VAT breakdown row whose amount was not
exactly taxable x rate rounded to cents (`INV-038`), and then the tax total that
summed those rows (`INV-018`). CEN's own EN 16931 Schematron (validation 1.3.x,
bundled here as `plain/en16931-ubl.json` and `plain/en16931-cii.json`) accepts a
row within one currency unit: strictly under 1.00 in UBL, up to 1.00 in CII, and
for a rate that rounds to 0 a tax that rounds to 0. An ERP that rounds VAT per
line and sums the lines lands a cent or two away and is accepted by the official
rules, so a bookkeeper was told to "fix" a valid invoice. The tool's own rule page
(`rules/en/br-co-17.html`) already said the official test is that loose.

**Change** (`breakdown.mjs` `brCo17Tolerated`, `cenRules`; `checks.mjs`
`statedBreakdownTax`; Python `breakdown.py` `br_co_17_tolerated`,
`stated_breakdown_tax`):

- A row within CEN's tolerance is `INV-038` with `severity: "warning"`: the page
  and API report it, it does not fail the file, and the fix names the exact
  figure for anyone who wants it. The Python CLI has no warning severity and stays
  silent, as it does for INV-061 and INV-064.
- `INV-018` accepts a tax total equal to the sum of the stated rows when every row
  is exact or tolerated (BR-CO-14: BT-110 = sum of BT-117). A total that disagrees
  with its own rows still blocks.
- Stricter than CEN on purpose: a row whose sign is opposite the expected amount
  still blocks (CEN compares absolute values); the CII-only exactly-1.00 case
  blocks here (it is UBL's strict bound).
- PINT and ZATCA files keep the exact check: their own rule sets apply, and the
  Oman baisa tests (`test_baisa.py`, `baisa.test.mjs`) pin exact three-decimal
  arithmetic there.
- `repair-cli.mjs` prints warnings as warnings and exits on blocking findings only.

**Measured** (`node eval/brco17-tolerance-crosscheck.mjs 300 20261125`, needs
`npm i --no-save slimdom fontoxpath`): 300 seeded invoices from `generate.mjs`,
each as UBL and CII (600 files), every VAT row moved by one of
±0.01, ±0.02, ±0.03, ±0.50, ±0.99, ±1.00 with the tax total, gross and amount due
moved with it. Built-in route (blocking INV-038/INV-018) against the bundled CEN
rules (fatal BR-CO-14/15/16/17, BR-S-08/09):

| Delta band | Files | CEN blocks | Built-in blocks, before | After | False alarms before → after | Misses after |
|---|---|---|---|---|---|---|
| 0.01–0.03 | 282 | 0 | 282 | 0 | 282 → 0 | 0 |
| 0.50–0.99 | 195 | 0 | 195 | 0 | 195 → 0 | 0 |
| 1.00 | 123 | 123 | 123 | 123 | 0 → 0 | 0 |

The bundled CEN rules are the ones the audit matched against CEN's XSLT under
SaxonC 609/609; SaxonC itself was not rerun in this session.

**Not done:** no real ERP file with per-line rounding was run (the files are
generated); the same tolerance is not applied to BR-S-09-style per-category
checks beyond the breakdown row (the built-in route has no separate check for
them). The audit's other open items are listed in NEXT.md.
