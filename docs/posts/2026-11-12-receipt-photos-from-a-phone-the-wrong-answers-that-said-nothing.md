---
title: "Receipt photos from a phone: the wrong answers that said nothing"
seo_title: "Browser receipt OCR on real phone photos: accuracy and silent errors"
date: 2026-11-12
tags: [ai-bookkeeper, ventures, ocr]
description: "On 200 real phone photos the in-browser receipt reader got half the totals right, and most wrong ones were silent. Now 12 of 95, not 39, are."
---

The [AI bookkeeper](https://marisstella.app/ai-bookkeeper/) can read a receipt photo in your browser. The image never leaves the machine. Until today every measurement of that reader used flat scans or text people had already corrected by hand. On the hand-corrected text of CORD, a public set of Indonesian shop and restaurant receipts, it read 95% to 98% of totals right. But nobody uploads hand-corrected text. They upload a photo taken on a phone over a café table.

CORD's images are exactly that: real phone photos, with shadows, tilt and the table showing at the edges. So we fed 200 of them (the validation and test splits) to tesseract.js 5.1.1, the WebAssembly engine and English model the page downloads. Then we scored the totals the page would put in its text box.

## What the page got

| CORD photos | Hand-corrected text | The page, before |
|---|---|---|
| validation (98 labelled) | 98.0% | 53.1% right, 38 wrong |
| test (95 labelled) | 94.7% | 47.4% right, 40 wrong |

OCR costs about 45 points. Some of that can't be won back: a few photos read as noise from top to bottom. The worse number is the wrong column. Almost every wrong total came with no note on the status line. A person would see a confident number and file it.

## Why the wrong ones were wrong

Reading the validation misses (and only those: the test photos were held back) showed one pattern. In 28 of the 39 wrong totals, OCR had lost the word TOTAL, so no total line was found. The reader then fell back to the largest amount on the page, which is usually the cash handed over. When a total line *was* found, the total was right 46 times out of 54.

## Three changes

1. **Split thousands joined.** On rupiah receipts OCR prints `25 000`, `308. 000` or `304 ,326`, and the reader took `25` or `308`. Now a number followed by exactly three digits that end it is joined into one amount. A lone `Table 12`, `100%` or `2 100,000` is left alone.
2. **Total, cash, change.** When the words are gone but the bottom of the slip still reads `45,500 / 50,000 / 4,500`, the arithmetic closes: 50,000 less 4,500 is 45,500. Three amount lines in a row that close exactly give the first one as the total. A first version also matched OCR noise (`5`, `2`, `3` closed a sum by chance four times in seven), so amounts under 100 are left out on whole-currency receipts.
3. **A guess says it's a guess.** When the total is only the largest amount on the photo, the status line now says so: "no total line found in the photo; 50000.00 is only the largest amount on it: check the total".

## On the held-out photos

| Test, 95 photos | Before | After |
|---|---|---|
| totals right | 45 | 48 |
| wrong, with a warning | 1 | 25 |
| **wrong, with no warning** | **39** | **12** |

The accuracy gain is small: three receipts. The safety gain is large. Wrong totals that nobody is told about fell from 39 to 12. The warning also fires on 9 right totals, which only costs a person a glance. The same rules also helped on data they weren't written for. On SROIE's 626 Malaysian scans the page's two-reading score went from 79.8% to 80.8%. On CORD's hand-corrected test text it went from 90 to 92 of 95.

## What didn't help

Phone photos often look like they need cleaning up first. We tried 2x upscaling, greyscale with autocontrast, and both together, which are steps a browser canvas could do before OCR. On the validation photos block mode scored 46.9%, 52.0% and 52.0%, against 52.0% for the untouched photo. So these photos aren't losing digits to low resolution or low contrast that a simple filter can fix.

## Limits

This is one country's receipts. CORD masks merchant names and dates, so only totals were scored. There are 100 held-out photos, so one receipt is one point. A crumpled US thermal receipt photographed in bad light is still untried. The method, the numbers and the commands to reproduce them are in the [README](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/ai-bookkeeper#receipt-photos-from-a-phone-cord-through-tesseractjs-2026-11-12). The bookkeeper is a reading aid. Check the totals it gives you, and when it says a number is a guess, believe it.
