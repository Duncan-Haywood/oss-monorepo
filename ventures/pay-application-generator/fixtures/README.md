# Workbook fixtures

Three real .xlsx files, written by programs other than this tool, so `sheet.test.mjs` does not only test its own ZIP writer.

- `openpyxl-uncalculated.xlsx`: written by `make_fixture.py` (openpyxl). Formulas carry no saved results, as with any
  file written by a library that does not calculate.
- `libreoffice-g703.xlsx`: the same file opened and saved by LibreOffice Calc
  (`soffice --headless --calc --convert-to xlsx`), so every formula has its cached value, shared strings and a
  percent number format, the way a contractor's own Excel file arrives.
- `pay-app-guides-example.xlsx`: a copy of `ventures/pay-app-guides/schedule-of-values-example.xlsx`, the filled
  example of the free template this portfolio publishes (written by that venture's `template.mjs`, so its formulas carry
  no saved results). It has a title block with "Retainage on work, %" labels and an instruction row right above the
  header; until 2026-11-25 the header search glued those onto the Item column and read item numbers as retainage rates.

The figures are made up. Regenerate with `python3 make_fixture.py out.xlsx` (needs `pip install openpyxl`).
