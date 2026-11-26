# PDF fixtures (page counting)

Made for these tests on 2026-11-25; the text on each page is "SHEET n OF m" or "SHEET n", nothing
else. Page counts checked with poppler's `pdfinfo`.

| File | Made with | Pages |
| --- | --- | --- |
| `drawing-1-chrome.pdf` | Chromium `page.pdf()` (Playwright) | 1 |
| `drawings-12-chrome.pdf` | Chromium `page.pdf()` | 12 |
| `sheets-15-libreoffice.pdf` | LibreOffice 24.2 `--convert-to pdf` from a text file | 15 |
| `united-15-pdfunite.pdf` | poppler `pdfunite` of a 3- and a 12-page Chromium file | 15 |
