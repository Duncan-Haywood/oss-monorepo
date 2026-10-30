#!/bin/bash
# OCR the SROIE receipt scans with and without an ImageMagick preprocessing
# step, then score each with sroie-receipts.mjs --ocr. Nothing is copied into
# this repository: clone zzzDavid/ICDAR-2019-SROIE (MIT) and point at it.
#   eval/sroie-ocr-variants.sh <clone>/data <outdir> base|gray2x|thresh|deskew [N]
#   node eval/sroie-receipts.mjs <clone>/data --ocr <outdir>/<variant>
# Needs tesseract and ImageMagick `convert`. N limits to the first N images.
# Tesseract runs one thread per process (OMP_THREAD_LIMIT=1); four processes on
# four cores with its default threads was ~50x slower.
D=$1; O=$2; V=$3; N=${4:-100000}
mkdir -p "$O/$V" "$O/tmp-$V"
one() {
  D=$1; O=$2; V=$3; f=$4; id=$(basename "$f" .jpg); src=$f; t="$O/tmp-$V/$id.png"
  case $V in
    gray2x) convert "$f" -colorspace Gray -resize 200% -normalize "$t"; src=$t;;
    thresh) convert "$f" -colorspace Gray -resize 200% -normalize -lat 40x40-8% "$t"; src=$t;;
    deskew) convert "$f" -colorspace Gray -background white -deskew 40% +repage "$t"; src=$t;;
  esac
  OMP_THREAD_LIMIT=1 tesseract "$src" "$O/$V/$id" --psm 6 >/dev/null 2>&1
}
export -f one
ls "$D"/img/*.jpg | head -n "$N" | xargs -P "$(nproc)" -I{} bash -c "one '$D' '$O' '$V' {}"
