# Workbook fixtures

Two real .xlsx files written by programs other than our own test writer, copied from the public pay-application
generator (`oss-monorepo/ventures/pay-application-generator/fixtures`, MIT, same owner; `make_fixture.py` there
regenerates them). The figures are made up.

- `openpyxl-uncalculated.xlsx`: written by openpyxl. Formulas carry no saved results.
- `libreoffice-g703.xlsx`: the same file opened and saved by LibreOffice Calc, so every formula has its cached
  value, shared strings and a percent number format, the way a contractor's own Excel file arrives.

Used by `src/shared/sov-import/sov-import.test.ts`.

- `schedule-of-values-example.xlsx` and `schedule-of-values-template.xlsx`: copies of the free template the public site
  gives away (`ventures/pay-app-guides` in oss-monorepo, written by its `template.mjs`, MIT, same owner). The title
  block puts "Retainage on work, %" labels and an instruction row right above the header; before 2026-11-25 the header
  search glued those onto the Item column, dropping item numbers and letting the CO-1 line in as contract work.

## PDF fixtures

Printed by real programs, for `src/shared/sov-import/pdf.test.ts`. The figures are made up.

- `bid-breakdown-chrome.pdf`: an HTML bid breakdown printed by Chromium (Skia, Type0 fonts with ToUnicode maps):
  CSI cost codes, centred headers, "$" at the left of the amount cell, a description that wraps around its
  amount, the header repeated on page 2 and a "Page N of M" footer. Regenerate with
  `NODE_PATH=$(npm root -g) node pdf-sources/bid-breakdown-chrome.cjs bid-breakdown-chrome.pdf` (Playwright).
- `schedule-of-values-example.pdf`: `schedule-of-values-example.xlsx` printed by LibreOffice
  (`soffice --headless --convert-to pdf`): subset TrueType fonts, a header wrapped over five lines, letters row,
  billing columns and the title block; page 2 is the application summary.
- `g702-g703-chrome.pdf`: an application for payment printed by Chromium, landscape: page 1 a G702-style summary
  (leader dots, rates typed in the 5a/5b blanks, "$" at the cell edge, the architect's "AMOUNT CERTIFIED" on line
  6's baseline, kerned capitals drawn as two runs), page 2 the continuation sheet with column letters above the
  labels and stored materials on one line. `NODE_PATH=$(npm root -g) node pdf-sources/g702-g703-chrome.cjs
  g702-g703-chrome.pdf` (Playwright); it prints the figures it wrote.
- `sov-libreoffice-csv.pdf`: `pdf-sources/sov-libreoffice.csv` printed by LibreOffice: 90 lines over two pages,
  item numbers right-aligned in their cell and "CO-1" left-aligned in the same column.

- `sov-ruled-chrome.pdf`: a dense continuation sheet printed by Chromium with every cell bordered (a thin filled
  rectangle per cell edge), a description column too narrow for its text (clipped at the border by a clip path, the
  hidden glyphs still in the stream) and amounts that fill their cells. `NODE_PATH=$(npm root -g) node
  pdf-sources/sov-ruled-chrome.cjs sov-ruled-chrome.pdf` (Playwright); it prints the line count and total.
- `sov-ruled-libreoffice.pdf`: a bordered sheet printed by LibreOffice (a stroked line per border; text cut off at
  the border by LibreOffice itself, so a cut-off header touches the next one). `python3
  pdf-sources/sov-ruled-libreoffice.py > sov-ruled-libreoffice.fods && soffice --headless --convert-to pdf
  sov-ruled-libreoffice.fods`.
  Both failed to import before the ruled-table reader (2026-11-25).
- `sov-hrules-chrome.pdf`: a schedule of values printed by Chromium with a rule under each row and none between the
  columns, cells top-aligned and long descriptions wrapped onto a second or third line at the normal line height, so
  only the rules say which line belongs to which item. `NODE_PATH=$(npm root -g) node
  pdf-sources/sov-hrules-chrome.cjs sov-hrules-chrome.pdf` (Playwright); it prints the line count and total. Its
  wrapped lines were dropped before the row-rule reader (2026-11-25).

## Submittal fixtures

Printed by Chromium for `src/shared/submittal-import.test.ts`. The jobs and wording are made up for the fixtures
(not copied from a master specification).

- `submittal-register-chrome.pdf`: a GC's submittal register over two pages (title block, header repeated on page 2,
  division heading rows, MM/DD/YYYY on-site dates, lead times in days, weeks and business days).
  `NODE_PATH=$(npm root -g) node pdf-sources/submittal-register-chrome.cjs submittal-register-chrome.pdf`.
- `spec-sections-chrome.pdf`: three spec sections (01 33 00 procedures, 09 21 16, 23 31 13), each a page or more,
  with ACTION / INFORMATIONAL SUBMITTALS articles, sub-paragraphs, a wrapped paragraph, a QUALITY ASSURANCE mockup and
  a running footer. `NODE_PATH=$(npm root -g) node pdf-sources/spec-sections-chrome.cjs spec-sections-chrome.pdf`.

## Scan fixtures

For `src/shared/sov-import/scan.test.ts`: `bid-breakdown-chrome.pdf` rasterised in grey, tilted, speckled and saved as
JPEG, then read by Tesseract 5.3.4 into a PDF with an invisible OCR text layer over each page picture (what a scanner's
"searchable PDF" setting writes). Regenerate with `sh pdf-sources/scan-fixtures.sh` (poppler, ImageMagick, tesseract
with English data); OCR output varies with the Tesseract version.

- `bid-breakdown-scan-tilted.pdf`: tilted 0.4 degrees, 200 dpi.
- `bid-breakdown-scan-tilted-more.pdf`: tilted 1.5 degrees the other way, 300 dpi.

Scans with no text layer, for `src/shared/sov-import/ocr.test.ts` (read by OCR, tesseract.js in Node, the same build
the app serves to browsers). Regenerate with `sh pdf-sources/picture-scan-fixtures.sh` (poppler, ImageMagick, Node);
`pdf-sources/picture-pdf.mjs` writes the picture-only PDF.

- `sov-scan-pictures-jpeg.pdf`: `bid-breakdown-scan-tilted-more.pdf`'s grey JPEG pages (DCTDecode), its text layer left
  out: what a scanner saves with OCR off.
- `sov-scan-pictures-g4.pdf`: `bid-breakdown-chrome.pdf` rasterised at 300 dpi, tilted 1.5 degrees, thresholded to
  black and white and stored as CCITT Group 4 (CCITTFaxDecode), as a black-and-white office scan is.
- `sov-scan-pictures-sideways.pdf`: the same G4 pages scanned on their side. Page 1's picture is turned a quarter
  clockwise and drawn as it is (the page shows the sheet on its side, text running down); page 2's is turned a quarter
  anticlockwise (text running up the picture) and placed turned back upright (`picture-pdf.mjs`'s `@90`).

## Encrypted PDF fixtures

For `src/shared/pdf/crypt.test.ts` and the packet test in `pdf-merge.test.ts`. Each opens with an empty user password
(no prompt in any viewer) and an owner password, `owner-secret`, that allows printing and restricts changes and copying.

- `encrypted-rc4-40.pdf`, `encrypted-aes-128.pdf`, `encrypted-aes-256-r5.pdf`, `encrypted-aes-256.pdf`:
  `schedule-of-values-example.pdf` encrypted by pypdf (RC4 40-bit revision 2; AES-128 revision 4 with crypt filters;
  AES-256 revision 5; AES-256 revision 6). `locked-user-password.pdf` is AES-128 with the user password `open-sesame`,
  which PayApps must refuse. Regenerate with `pdf-sources/encrypt-fixtures.py` (pypdf and cryptography).
- `encrypted-libreoffice-rc4-128.pdf`: `pdf-sources/sov-libreoffice.csv` exported by LibreOffice 24.2 with "Restrict
  permissions" (RC4 128-bit, revision 3):
  `soffice --headless --convert-to 'pdf:calc_pdf_Export:{"RestrictPermissions":{"type":"boolean","value":"true"},"PermissionPassword":{"type":"string","value":"owner-secret"},"Changes":{"type":"long","value":"0"},"EnableCopyingOfContent":{"type":"boolean","value":"false"}}' sov-libreoffice.csv`.
  Its page header differs from `sov-libreoffice-csv.pdf` (a different export run), but its 90 lines import identically.

## Photo fixtures

- `exif-photo-pillow.jpg`: a 64 x 48 JPEG whose EXIF was written by Pillow (little-endian, as Android phones write it):
  DateTime, DateTimeOriginal, OffsetTimeOriginal, orientation 6, a camera make and model, and a GPS block. Regenerate with
  `python3 pdf-sources/exif-photo-pillow.py exif-photo-pillow.jpg` (Pillow). Used by `src/shared/photo-exif.test.ts` and
  `test/unit/packet-photo.test.ts`.
- `exif-photo-libheif.heic` and `exif-photo-pillow.webp`: 64 x 48 photos with the same kinds of tags (times
  2026:11:24 16:42:30 -08:00), the HEIC's EXIF written by libheif 1.23 through pillow-heif 1.9 (big-endian, in an 'Exif'
  item found by iinf and iloc, as an iPhone stores it) and the WebP's by Pillow's libwebp writer (a RIFF "EXIF" chunk).
  Regenerate with `pip install pillow pillow-heif; python3 pdf-sources/exif-photo-heic-webp.py .`. Used by
  `src/shared/photo-exif.test.ts` and `test/unit/packet-photo.test.ts`.
- `heic-grid-libheif.heic`, `heic-grid-rot-libheif.heic`, `heic-grid-transpose-libheif.heic` and
  `heic-single-libheif.heic`: a 600 x 400 colour ramp with one block per tile, encoded by libheif 1.23's x265 encoder
  through pillow-heif 1.9: as a 3 x 2 grid of 256 x 256 HEVC tiles cropped to 600 x 400 (as an iPhone stores 512 x 512
  tiles), the same with EXIF orientation 6 (an `irot`) and 5 (`irot` then `imir`), and as one image item. Regenerate
  with `pip install pillow pillow-heif; python3 pdf-sources/heic-grid.py .`. Used by `src/shared/heif.test.ts` and
  `test/unit/heic-webcodecs.test.ts`. `pdf-sources/heic-webcodecs-check.cjs` checks the WebCodecs path end to end in
  Chromium against libheif's decode of every `.heic` here (needs ffmpeg, pillow-heif and numpy; see its header).

## Submittal stamp fixture

- `submittal-stamp-chrome.pdf`: a returned product-data page printed by Chromium with the architect's stamp flattened
  into it: every choice listed with a box, "MAKE CORRECTIONS NOTED" ticked (☒), "BY: JS DATE: 11/20/2026", an
  unlabelled issue date nearby and "approved equal" in the notes. Used by `src/shared/submittal-stamp.test.ts`.
  Regenerate with `NODE_PATH=$(npm root -g) node pdf-sources/submittal-stamp-chrome.cjs submittal-stamp-chrome.pdf`.
- `signature-jpeg.ts`: a 120 x 40 baseline JPEG of a drawn line (ImageMagick), base64, for the T&M ticket signature tests.
