# Shaded receipt photos: a local threshold, chosen per photo (2026-11-15)

Flagship item (5), "next: curled slips". Engines: tesseract.js 5.1.1 with
`@tesseract.js-data/eng@1.0.0` for the page (its core prints `5.1.0-280-ge20b`), and the
tesseract 5.3.4 binary (Ubuntu `tesseract-ocr`, `OMP_THREAD_LIMIT=1`) for the CLI. No photo
is committed here.

## The idea

Tesseract turns a photo into black and white before it reads it. By default it uses one
threshold for the whole image (Otsu). On a phone photo with a shadow across the slip, a
dim room or a slip held in the hand, one threshold either blacks out the dark side or
washes out the light side. Tesseract 5 has a second method, Sauvola, which sets the
threshold from each pixel's neighbourhood: `thresholding_method=2` (a parameter in both
tesseract.js and the binary; no image work, no extra download).

Earlier runs tried extra image copies to the same end (flattened lighting by dividing by a
blur, sharpening, deskewing) and each raised the "right total is somewhere in the
readings" ceiling on SRD by only 2 to 6 (README, "Full-size photos", "What did not help").

## Data

- ExpressExpense SRD (`eval/srd-fetch.mjs`): 196 US receipt photos with a total read by eye
  (`eval/srd/labels.jsonl`). Even-numbered photos were used to choose; odd ones held out.
- SROIE 2019 (zzzDavid/ICDAR-2019-SROIE, MIT): 625 labelled flatbed scans. Even-indexed
  scans (sorted by id) were used to choose the cut below; odd-indexed held out.
- CORD's phone photos were not measured: Hugging Face refused this session's connection.

## Step 1: Sauvola in place of `--psm 4`, on every photo (page, tesseract.js)

Readings, in order: photo, then the page's grey copy at 2,000 px (`eval/srd-canvas-grow.mjs`).

| page, totals right (settled) | SRD 196 | SRD even | SRD odd | SRD ceiling | SROIE 625 |
|---|---|---|---|---|---|
| photo 6, 4; copy 6, 4 (before) | 134 | 67 | 67 | 153 | 530 |
| photo 6, 6 Sauvola; copy 6, 6 Sauvola | **146** | 74 | 72 | 169 | **519** |
| photo 6, 6 Sauvola, 4; copy 6, 6 Sauvola, 4 (six readings) | 143 | 72 | 71 | | 527 |
| photo 6, 4; copy 6, 6 Sauvola | 134 | 67 | 67 | | 520 |
| photo 6, 6 Sauvola; copy 6, 4 | 140 | 71 | 69 | | 520 |

The order "photo 6, photo 6 Sauvola, copy 6, copy 6 Sauvola" scored best of six orders on
the even half (74). "Ceiling" is the count of photos where the right total appears in any
reading's text. Sauvola everywhere helps the phone photos a lot and costs the flatbed scans
11 totals: a scan is evenly lit, and `--psm 4` was earning its place there.

## Step 2: choose per photo by how evenly it is lit

`lightSpread` (photoocr.mjs): draw the photo as a 32 x 32 grey thumbnail (each pixel the
average of its patch, aspect ignored) and take the standard deviation over the mean. A
white flatbed scan is near 0.05; a slip on a dark table or under a shadow is 0.2 or more.
At or over the cut, a photo gets the Sauvola readings; under it, the readings as before.

The cut was chosen on SRD even + SROIE even with ImageMagick's thumbnail (`convert
photo[0] -colorspace Gray -resize 32x32! -depth 8 gray:-`): the best tuning score is any
cut from 0.127 to 0.139, so **0.13**. Two other measures (1 - p10/p90 of the cells, and the
share of cells darker than 0.75 of the 95th percentile) tuned no better.

| cut on ImageMagick's thumbnail | SRD even | SRD odd | SROIE even | SROIE odd |
|---|---|---|---|---|
| none (before) | 67 | 67 | 262 | 268 |
| Sauvola on every photo | 74 | 72 | 257 | 262 |
| 0.10 | 74 | 73 | 258 | 267 |
| 0.12 | 73 | 73 | 261 | 268 |
| **0.13** | **73** | **73** | **262** | **268** |
| 0.14 | 72 | 73 | 262 | 268 |
| 0.16 | 71 | 71 | 262 | 268 |

The page draws its thumbnail with a canvas (`imageSmoothingQuality = "high"`), which
differs from ImageMagick's by up to 0.06 on one photo; 4 of 200 SRD photos and 7 of 626
scans fall on the other side of 0.13. With the canvas thumbnail, the same cut gives 72 / 73
/ 261 / 268.

## Shipped, end to end

| totals right | before | now |
|---|---|---|
| page, SRD 196 (canvas thumbnails, 181 photos over the cut) | 134 (68.4%) | **145 (74.0%)** |
| page, SRD odd half (held out) | 67 of 97 | **73** |
| page, SROIE 625 (canvas thumbnails) | 530 (84.8%) | 529 (84.6%) |
| page, SROIE odd half (held out) | 268 | 268 |
| CLI `--four-pass`, SRD 196 | 131 (66.8%) | **146 (74.5%)** |
| CLI `--four-pass`, SRD odd half | 66 of 97 | **72** |
| CLI `--two-pass`, SRD 196 | 113 (57.7%) | **120 (61.2%)** |
| CLI `--four-pass`, SROIE 625 | 514 (82.2%) | 514 (82.2%) |
| CLI `--two-pass`, SROIE 625 | 492 (78.7%) | 493 (78.9%) |

On the page, wrong totals with no warning stay at 3 of 196 on SRD and tax stays at 79 of 185.
CLI SROIE: 48 of 626 scans are over the cut; the other 578 take the old path unchanged, so
only the 48 were read again (four-pass 39 right before and after, two-pass 35 to 36), and
the totals are the earlier run's 514 and 492 with that difference.

Of the 18 SRD photos the step-1 change got right that were wrong before, 12 were looked at
by eye: about half show a visible shadow or dim, warm light; the others look evenly lit.
So "shaded" is the best single word for where it helps, not the whole story.

## Cost

None in readings: a photo is still read four times (`--four-pass`, the page) or twice
(`--two-pass`). The thumbnail is one more canvas draw on the page and one more ImageMagick
call in the CLI (a few ms on a 750 x 1000 photo; about 1 s on a 4961 x 7016 scan).

## Reproduce

```
node eval/srd-fetch.mjs <photos>
node eval/srd-canvas-grow.mjs <photos> <grey>
npm install tesseract.js@5.1.1 @tesseract.js-data/eng@1.0.0   # anywhere
node eval/sroie-tesseractjs.mjs <photos> <ocr> <node_modules>
node eval/sroie-tesseractjs.mjs <grey> <ocr2> <node_modules>
node eval/sroie-tesseractjs.mjs <photos> <ocrS> <node_modules> 4 --modes psm6 --set thresholding_method=2
node eval/sroie-tesseractjs.mjs <grey> <ocr2S> <node_modules> 4 --modes psm6 --set thresholding_method=2
```

Then per photo take `<ocr>/psm6, <ocrS>/psm6, <ocr2>/psm6, <ocr2S>/psm6` when its
`lightSpread` is 0.13 or more, else `<ocr>/psm6, <ocr>/psm4, <ocr2>/psm6, <ocr2>/psm4`
(the copy's two first for a photo over 2,000 px), and score with `node
eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr <four folders> --settled` (SROIE:
`eval/sroie-receipts.mjs <clone>/data --ocr ... --settled`). CLI: `node eval/srd-cli.mjs
<photos> <out>` runs the shipped code (its psm4 and g4 folders now hold whichever second
reading the photo got) and `node eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr
<out>/psm6,<out>/psm4,<out>/g6,<out>/g4`.
