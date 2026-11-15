# Full-size receipt photos and scans: a grey copy shrunk to 2,000 px (2026-11-15)

Flagship item (5), "next: curled slips, full-size photos". Engines: the tesseract 5.3.4
binary (Ubuntu `tesseract-ocr`, `OMP_THREAD_LIMIT=1`) for the CLI, and tesseract.js 5.1.1
with `@tesseract.js-data/eng@1.0.0` for the page. Copies: ImageMagick 6.9.12
`-colorspace Gray -resize 2000x2000` for the CLI, and Chromium's canvas with the page's own
settings (`eval/srd-canvas-grow.mjs`) for the page. No photo is committed here.

## Data

- SROIE 2019 (zzzDavid/ICDAR-2019-SROIE, MIT): 626 scans, 625 with a labelled total;
  **189 over 2,000 px** on the long side (flatbed scans, up to 4961 x 7016).
- CORD-v2 test split (naver-clova-ix/cord-v2, revision 7f0115a4, CC BY 4.0), fetched from
  Hugging Face with `eval/cord_images.py`: 100 phone photos, 95 with a total; **17 over
  2,000 px** (2304 x 4096, 1836 x 3264, ...). Hugging Face did not answer on 2026-11-12, so
  this is also the first four-reading measurement on CORD's photos.
- ExpressExpense SRD (`eval/srd-fetch.mjs`): 196 labelled US totals; one photo
  (1151, 3024 x 4032) over 2,000 px.

## Choosing the order (on SROIE's 189 large scans)

| readings, in order | total | date (188) | merchant exact |
|---|---|---|---|
| CLI: photo 6, photo 4 (before) | 144 | 149 | 93 |
| CLI: photo 6, 4, copy 6, 4 | 152 | 150 | 94 |
| CLI: copy 6, 4, photo 6, 4 (shipped) | 155 | 152 | 94 |
| CLI: copy 6, 4 only | 156 | 152 | 94 |
| page: photo 6, 4 (before), `--settled` | 151 | 154 | 92 |
| page: photo 6, 4, copy 6, 4 | 156 | 155 | 92 |
| page: copy 6, 4, photo 6, 4 (shipped) | 160 | 154 | 95 |

"Copy only" scores one total higher on the CLI. The shipped order keeps the photo's own
readings, which cost little next to the copy and leave the vote something to fall back
on. It is also one rule for every photo: four readings, two of the photo and two of a grey
copy at 2,000 px.

## Held out: CORD's 17 large photos

| CLI readings | totals right of 17 |
|---|---|
| photo twice (before) | 7 |
| photo, then shrunk copy | 8 |
| shrunk copy, then photo (shipped) | 8 |
| shrunk copy only | 8 (6 wrong, 3 none) |

## End to end, CLI code as shipped (`eval/srd-cli.mjs` over every photo)

| set | before | after |
|---|---|---|
| SROIE 625 totals | 503 (80.5%) | 514 (82.2%) |
| SROIE 611 dates | 490 | 493 |
| SROIE merchants exact (626) | 287 | 288 |
| CORD test 95 totals | 47 (one reading: 44) | 48 |
| SRD 196 totals | 131 | 131 |

"Before" on SROIE was rebuilt from today's readings: the 437 smaller scans' four readings
plus the large scans' two, which reproduces the README's 503 exactly.

## Cost (CLI, one thread, largest scan 4961 x 7016)

One pass on the photo 2.3 s; making the copy 1.8 s; one pass on the copy 0.5 s. Four
readings about 7.6 s against 4.6 s for two.

## Tried and not shipped

Ceiling on SRD: the labelled total appears somewhere in the four readings' text on 153 of
196 photos (amount regex over `cleanOcr` text); the vote picks it on 131.

| extra reading pair added to the four | ceiling |
|---|---|
| none | 153 |
| grey 3,000 px | 156 |
| divide by a 25 px blur at 2,000 px, normalise | 156 (alone: 36) |
| divide by a 12 px blur, then 2,000 px | 155 |
| grey 2,000 px, normalise, unsharp 0x1.5 | 158 |
| grey 2,000 px, deskew 40% | 157 |
| bottom 55% cropped, 2,000 px | 159 |

Vote rules, written after reading all 196 SRD misses:

- whole-unit readings sit out when at least half the readings use decimals: SRD 131 to 131
  (the decimal readings had no total either), CORD four-pass 47 to 46;
- a value whose digits end another's lends its votes to the longer one: SRD 131 to 128.

Neither shipped.
