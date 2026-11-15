---
title: "One tesseract setting read 11 more receipt totals, once it learned when to use it"
seo_title: "Receipt OCR on shaded phone photos: tesseract's Sauvola threshold"
date: 2026-11-15
description: "Tesseract's local threshold on unevenly lit receipt photos: 134 to 145 of 196 totals right in the browser, 131 to 146 on the CLI, scans unchanged."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

The ai-bookkeeper reads receipt photos with tesseract, in your browser or from the command line, and nothing leaves your machine. On ExpressExpense's 196 US receipt photos (real thermal slips shot with a phone: curled, creased, on dark tables, held in a hand), it read the total right 134 times. Most of the misses were not the reader's fault. The text tesseract handed over didn't contain the right number at all.

## Black and white first

Before tesseract reads anything, it turns the photo into black and white. By default it picks one threshold for the whole image (Otsu's method). That works on a flatbed scan, which is evenly lit. On a phone photo with a shadow across the bottom half, one threshold either blacks out the shaded side or washes out the bright side, and the total line is usually near the bottom.

Tesseract 5 has a second method built in, Sauvola, which sets the threshold from each pixel's neighbourhood. It's one parameter (`thresholding_method=2`) in both tesseract.js and the binary. There's no image processing to write and nothing extra to download.

## First try: everywhere

The page already read each photo four times: twice as it is (block mode and `--psm 4`) and twice as a grey copy enlarged to 2,000 pixels, and the readings voted on the total. I swapped each `--psm 4` reading for a Sauvola one.

On the phone photos it worked well. The right total showed up somewhere in the readings for 169 photos instead of 153, and the vote picked it on 146 instead of 134. Earlier runs had tried extra image copies for the same problem (dividing out the lighting with a blur, sharpening, deskewing), and none of them moved that ceiling by more than 6.

Then I ran the same change on SROIE, 625 flatbed scans of Malaysian receipts, and it lost 11 totals (530 down to 519). A scan has no shadow, and on scans `--psm 4` had been earning its place.

## Second try: only where the light is uneven

So the bookkeeper now measures each photo before reading it. It draws the photo as a 32 x 32 grey thumbnail and divides the spread of its brightness by its mean. A white scan comes out near 0.05. A slip on a dark table or half in shadow comes out at 0.2 or more. At 0.13 or above, the photo gets the Sauvola readings. Below that, it's read exactly as before.

I chose 0.13 on half of each dataset (even-numbered photos, even-positioned scans) and scored the other halves once:

| totals right | before | now |
|---|---|---|
| browser, 196 US phone photos | 134 | **145** |
| browser, held-out half of them | 67 of 97 | **73** |
| browser, 625 flatbed scans | 530 | 529 |
| command line `--four-pass`, 196 US photos | 131 | **146** |
| command line, held-out half | 66 of 97 | **72** |
| command line `--four-pass`, 625 scans | 514 | 514 |

It costs nothing extra in reading time. It's still four readings, plus one tiny thumbnail. The number of wrong totals the page fails to warn about stays at 3 of 196.

## What I'm not claiming

I looked at the photos the change fixed. About half show an obvious shadow or dim light. The rest look evenly lit to me, so "shaded" is the best single word for where it helps, but it isn't the whole story. The browser draws its thumbnail on a canvas and the command line asks ImageMagick, and the two disagree slightly: 4 of 200 photos land on the other side of the cut. The browser's numbers above use the canvas. I couldn't check CORD's Indonesian phone photos this time, because the host they come from refused the connection.

The vote now finds the right total on 145 of the 169 photos where it appears somewhere in the readings, so that gap of 24 is the next thing to work on.

## Try it

[The page](https://marisstella.app/ai-bookkeeper/) reads photos in your browser and nothing is uploaded; its status line says when a photo was read with the local threshold. On the command line, `node cli.mjs --books books.json receipts photo.jpg --four-pass` does the same (it needs tesseract and ImageMagick). Every number above, with the commands to reproduce it, is in the venture's `eval/shaded-photos-2026-11-15.md` and its README under "Shaded photos". This isn't tax or accounting advice: check every total the reader gives you.
