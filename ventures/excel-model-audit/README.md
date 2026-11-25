# Excel Model Audit

**Find the formula that breaks the pattern.** A free formula auditor for Excel workbooks
(.xlsx, .xlsm) that runs in the browser or from the command line. The workbook is unzipped and
read locally and never uploaded. It has no dependencies.

Live: https://marisstella.app/excel-model-audit/ ·
Guide: [How to find inconsistent formulas in Excel](find-inconsistent-formulas-in-excel.html)

## Who it is for

Anyone who has to sign off a spreadsheet they did not build: an analyst handed a model on
Thursday for a Friday sign-off, a finance lead checking a budget, a lender's or investor's analyst,
a founder checking a plan before it goes out. Paid add-ins (PerfectXL, Operis OAK, Arixcel and
others) sell this job to professional model reviewers. This tool does the first pass free.

## What it finds

| Rule | Severity | Source of the rule |
|---|---|---|
| Copied formula points at a different cell from its neighbours (shows the formula the neighbours imply) | high / medium | Excel error checking: "Formulas inconsistent with other formulas in the region" |
| Number typed over a formula in a row or column of copies | high | Model-review practice (FAST Standard: no typed values in calculation rows) |
| SUM / AVERAGE / COUNT / MIN / MAX / PRODUCT / SUBTOTAL / MEDIAN range stops next to a number | medium | Excel error checking: "Formulas that omit cells in a region" |
| Circular references, across sheets, 3-D references and named ranges | high | Tarjan's strongly connected components on the dependency graph |
| Where an error value starts (error cells whose inputs are not errors) | high | Same graph |
| #REF! in a formula or named range; reference to a missing sheet | high | |
| Formula pointing at an empty cell | medium | Excel error checking: "Formulas referring to empty cells" |
| Number stored as text (medium if a formula reads it); formula stored as text | medium | Excel error checking: "Numbers formatted as text" |
| Constants typed into formulas (grouped by value); formulas with numbers only | info / medium | FAST Standard; ICAEW Financial Modelling Code |
| Volatile functions, external links, hidden sheets and cells, unused names, long formulas, iterative or manual calculation, VBA present | info / medium | |

How "the same formula" is decided: each formula is rewritten in R1C1 form, relative to its own
cell (`=B2*B3` in B4 is `=R[-2]C*R[-1]C`). Copies have identical R1C1 text, so a broken copy is a
cell whose R1C1 text differs from the identical text either side of it. A cell at the end of a
run is flagged only when it does the same operation (same functions and operators) on
different cells, so a totals column is not.

Deliberately not flagged: subtotals beside a range, a year (1900 to 2100) typed above or left of
a range, a moving window copied along its own axis (`=SUM(A1:A3)` copied down), and settings of a
function (the 2 in `ROUND(x,2)`, the column number in `VLOOKUP`).

**Not checked:** whether the logic, assumptions or inputs are right; what OFFSET and INDIRECT
point at; VBA, Power Query, pivot tables, charts, conditional formatting, data validation; values
Excel would calculate now (it reads the values saved in the file). Old binary .xls and .ods are
not read.

## Command line

```
node cli.mjs model.xlsx                    # findings, high first
node cli.mjs model.xlsx --min medium       # hide info
node cli.mjs model.xlsx --csv findings.csv # CSV (formula-injection guarded)
node cli.mjs *.xlsx --json --fail-on none
```

It exits 1 when a finding at or above `--fail-on` (default `high`) remains, so it can gate a
shared folder or a CI job before a model is sent out. Needs Node 18 or later (for
`DecompressionStream`).

## How it was checked

- 44 tests. Each rule is tested on a workbook whose every cell is known, against a hand-worked
  answer (e.g. a revenue row with D4 typed `=D2*C3` must be found with `=D2*D3` implied; a SUM
  stopping one row short; a loop through two sheets; a 20,000-cell chain with no loop and no
  stack overflow). The ZIP reader is tested on deflated parts, namespace-prefixed XML, shared
  strings with rich text runs, and the published CRC-32 check value.
- Reader cross-check: on four public test workbooks it reads 15,072 of 15,072 formulas the same
  as openpyxl, an independent reader; the 5 cells where they differ are text cells starting
  with "=", which openpyxl reads as formulas
  ([eval/crosscheck-2026-11-22.md](eval/crosscheck-2026-11-22.md)). Those files also prompted
  two noise fixes (moving windows; grouped floods).
- Not yet measured: precision on real financial models built by people (next: a public corpus
  such as Enron or EUSES).

Spec sources: Microsoft Support, "Detect errors in formulas" (Excel's background error-checking
rules); ECMA-376 Part 1 (SpreadsheetML: shared formulas 18.3.1.40, formulas 18.17); the FAST
Standard and the ICAEW Financial Modelling Code (typed constants, one formula per row). The
professional who would sign off the output is a financial model reviewer.

## Files

`xlsx.mjs` ZIP and SpreadsheetML reader · `formula.mjs` tokenizer, shared-formula shifting, R1C1
signatures · `audit.mjs` the rules, dependency graph and map · `xlsxwrite.mjs` minimal .xlsx
writer (for the example and tests) · `example.mjs` the worked example · `cli.mjs` · `index.html`.

## Privacy

Everything runs in your browser. Your file is never uploaded; there are no accounts, cookies, or
analytics vendors. Anonymous feature events (`workbook_audited`, `example_loaded`,
`findings_downloaded`) are counted in local storage on your device only, and can be switched off
on the page. Do Not Track and Global Privacy Control are honoured.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not accounting, audit, financial, investment or engineering advice, and it does
not replace a qualified reviewer of your model. **You are responsible for reviewing and
verifying its output before relying on it**, and a clean result is not a statement that a
workbook is correct. To the maximum extent permitted by law, the authors accept no liability for
any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken,
moved, or taken offline without notice. Do not use this as a system of record.

Excel is a trademark of Microsoft Corporation; not affiliated with, endorsed by or sponsored by
Microsoft or any product named. Product names are used only to describe what this tool is and is
not.

FSL-1.1-MIT licensed. Optional support: https://github.com/sponsors/Duncan-Haywood
