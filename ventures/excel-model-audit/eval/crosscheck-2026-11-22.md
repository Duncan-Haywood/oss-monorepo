# Reader cross-check against openpyxl, and a first run on public workbooks (2026-11-22)

## What was compared

Every formula cell this tool reads (after expanding shared formulas, ECMA-376 18.3.1.40) against
openpyxl 3.1.5's reading of the same file. openpyxl expands shared formulas with its own
`Translator`, so the two readings are independent. Whitespace and the `_xlfn.` prefix are
ignored in the comparison.

Files (public test files of two open-source spreadsheet-calculation projects, fetched from raw.githubusercontent.com on 2026-11-22; read only, not committed):

| File | Source | Formula cells | Read the same |
|---|---|---:|---:|
| test.xlsx | vinci1it2000/formulas, `test/test_files/test.xlsx` | 14,977 | 14,974 |
| circular.xlsx | vinci1it2000/formulas, `test/test_files/circular.xlsx` | 55 | 53 |
| excel.xlsx | vinci1it2000/formulas, `test/test_files/excel.xlsx` | 8 | 8 |
| example.xlsx | dgorissen/pycel, `example/example.xlsx` | 37 | 37 |
| **all** | | **15,077** | **15,072** |

All 5 differences are cells openpyxl calls formulas and this tool does not: text cells
(shared strings, `t="s"`) whose text starts with "=", e.g. `CORE!D25` holds the text
`=SUM(D2:D5)` (checked in the raw XML: `<c r="D25" s="1" t="s"><v>487</v></c>`). openpyxl treats
any string starting with "=" as a formula. This tool now reports such a cell as
**formula stored as text** (a new rule this cross-check prompted).

So on these files: 15,072 of 15,072 real formulas read identically.

## Reproduce

```
python3 -m venv venv && venv/bin/pip install openpyxl
curl -sO https://raw.githubusercontent.com/vinci1it2000/formulas/master/test/test_files/test.xlsx   # etc.
node eval/crosscheck.mjs venv/bin/python test.xlsx circular.xlsx excel.xlsx example.xlsx
```

## What the audit said on them, and what changed

| File | Before tuning (high / medium) | After (high / medium) |
|---|---|---|
| circular.xlsx (a test file of deliberate loops) | 18 / 4 | 16 / 5 |
| pycel example.xlsx (rolling 3-cell SUMs) | 0 / 18 | 0 / 0 |
| test.xlsx (a function test book, 20 sheets) | 12,208 / 978 | 829 / 713 |

Changes made because of what these files showed:

- **Moving windows.** pycel's `B1 = SUM(A1:A3)` copied down is a rolling sum; all 18 cells were
  flagged as "range stops next to a number". A range whose ends are both relative along its own
  axis, in a formula copied along that axis, is now treated as a deliberate window.
- **Floods.** test.xlsx holds thousands of deliberate error values. Errors typed in as values
  are now one grouped finding per sheet; any rule lists at most 50 cells per sheet and then one
  "…and N more" line.
- **Circular.xlsx:** every loop in this file is deliberate (it tests a calculation engine's
  circular handling). 13 loops are reported. Not checked against an independent count of the loops in the file.

Not measured: precision on real financial models built by people, which is what the
tool is for. Neither test.xlsx nor circular.xlsx is a model; their "inconsistent formula"
findings are cells that differ from coincidentally equal neighbours in a test grid. The next
measurement needs a corpus of real models: the Enron spreadsheet corpus (Hermans and
Murphy-Hill, 2015) and the EUSES corpus are the public candidates; figshare refused this
session's proxy.
