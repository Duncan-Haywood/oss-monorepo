# Workbook fixtures

Two real .xlsx files, written by programs other than this tool, so `sheet.test.mjs` does not only test its own ZIP writer.

- `openpyxl-uncalculated.xlsx`: written by `make_fixture.py` (openpyxl). Formulas carry no saved results, as with any
  file written by a library that does not calculate.
- `libreoffice-g703.xlsx`: the same file opened and saved by LibreOffice Calc
  (`soffice --headless --calc --convert-to xlsx`), so every formula has its cached value, shared strings and a
  percent number format, the way a contractor's own Excel file arrives.

The figures are made up. Regenerate with `python3 make_fixture.py out.xlsx` (needs `pip install openpyxl`).
