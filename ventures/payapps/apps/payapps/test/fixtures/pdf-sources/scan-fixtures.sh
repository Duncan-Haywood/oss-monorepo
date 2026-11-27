#!/bin/sh
# Builds the "searchable scan" fixtures: bid-breakdown-chrome.pdf rasterised in grey, tilted a little
# as a sheet lies on a scanner's glass, speckled, saved as JPEG, then read by Tesseract into a PDF
# with an invisible OCR text layer over each page picture (what a scanner's "searchable PDF" setting
# or a scanning app writes). Needs poppler (pdftoppm), ImageMagick (convert) and tesseract with the
# English data. Usage, from test/fixtures: sh pdf-sources/scan-fixtures.sh
# OCR output depends on the Tesseract version (5.3.4 made the committed files), so the tests check
# what must hold of any good OCR (totals, line counts), plus the misreads this version made.
set -eu
work=$(mktemp -d)
# angle (degrees), resolution (dpi), output: a slight tilt at 200 dpi (some misreads), and a
# steeper one at 300 dpi, the resolution scanners use for OCR.
for spec in "0.4 200 bid-breakdown-scan-tilted.pdf" "-1.5 300 bid-breakdown-scan-tilted-more.pdf"; do
  set -- $spec
  angle=$1
  out=$3
  rm -f "$work"/pg-*
  pdftoppm -r "$2" -gray -png bid-breakdown-chrome.pdf "$work/pg"
  : > "$work/list.txt"
  for p in "$work"/pg-*.png; do
    convert "$p" -seed 7 -background white -rotate "$angle" -attenuate 0.3 +noise Gaussian -colorspace Gray \
      -quality 35 "${p%.png}.jpg"
    echo "${p%.png}.jpg" >> "$work/list.txt"
  done
  tesseract "$work/list.txt" "$work/out" -l eng pdf
  mv "$work/out.pdf" "$out"
done
rm -r "$work"
