# Test fixtures

- `self-assessment-libreoffice.xlsx`: a made-up NIST SP 800-171 self-assessment sheet (title row, a
  blank row, a header, family headings, a multi-line statement, a cell with commas, a semicolon and
  quotes, a formula whose cached result is "Not met", and a status "mostly" the import must refuse).
  Made on 2026-11-26 from `self-assessment-libreoffice.source.csv` with
  `soffice --headless --infilter="CSV:44,34,76,1" --convert-to xlsx` (LibreOffice's own .xlsx writer),
  so the reader is tested on a file a real spreadsheet program wrote, not only on the test writer in
  `test/unit/xlsx-writer.ts`. The company and e-mail are fictional (`.example`).
