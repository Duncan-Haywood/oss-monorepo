#!/bin/sh
# Builds the "scan with no text layer" fixtures from bid-breakdown-scan-tilted-more.pdf's page pictures
# (bid-breakdown-chrome.pdf rasterised at 300 dpi, tilted -1.5 degrees, speckled, JPEG; see
# scan-fixtures.sh), with its OCR text layer left out: what a scanner saves with OCR off.
# - sov-scan-pictures-jpeg.pdf: the grey JPEG pages as they are (DCTDecode).
# - sov-scan-pictures-g4.pdf: bid-breakdown-chrome.pdf rasterised at 300 dpi, tilted the same -1.5
#   degrees, thresholded to black and white and stored as CCITT Group 4 (CCITTFaxDecode), as a
#   black-and-white office scan is (a scanner thresholds the sheet itself, not a speckled JPEG).
# - sov-scan-pictures-sideways.pdf: the same G4 pages scanned on their side. Page 1 is turned a
#   quarter clockwise and drawn as it is (the page shows the sheet on its side, its text running
#   down); page 2 is turned a quarter anticlockwise (its text runs up the picture, which Tesseract
#   reads only half turned) and placed turned back upright, so the page shows it the right way up.
# Needs poppler (pdfimages) and ImageMagick (convert). Usage, from test/fixtures:
# sh pdf-sources/picture-scan-fixtures.sh
set -eu
work=$(mktemp -d)
here=$(dirname "$0")
pdfimages -j bid-breakdown-scan-tilted-more.pdf "$work/pg"
node "$here/picture-pdf.mjs" 300 sov-scan-pictures-jpeg.pdf "$work"/pg-*.jpg
pdftoppm -r 300 -gray -png bid-breakdown-chrome.pdf "$work/bw"
for p in "$work"/bw-*.png; do
  convert "$p" -background white -rotate -1.5 -threshold 60% -type bilevel "${p%.png}.pbm"
  h=$(identify -format %h "${p%.png}.pbm")
  convert "${p%.png}.pbm" -compress Group4 -define tiff:rows-per-strip="$h" "${p%.png}.tif"
done
node "$here/picture-pdf.mjs" 300 sov-scan-pictures-g4.pdf "$work"/bw-*.tif
set -- "$work"/bw-*.pbm
for r in 90:"$1" -90:"$2"; do
  h=$(convert "${r#*:}" -rotate "${r%%:*}" "${r#*:}.r.pbm" && identify -format %h "${r#*:}.r.pbm")
  convert "${r#*:}.r.pbm" -compress Group4 -define tiff:rows-per-strip="$h" "${r#*:}.r.tif"
done
node "$here/picture-pdf.mjs" 300 sov-scan-pictures-sideways.pdf "$1.r.tif" "$2.r.tif@90"
rm -r "$work"
