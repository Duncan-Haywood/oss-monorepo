---
title: "Shrinking a receipt photo before OCR read more totals right"
seo_title: "Receipt OCR on full-size photos and scans: shrink to 2,000 px first"
date: 2026-11-15
description: "Reading a grey copy shrunk to 2,000 px first took ai-bookkeeper's receipt OCR from 144 to 155 right of 189 large scans (CLI), 151 to 160 in the browser."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

The ai-bookkeeper reads receipt photos with tesseract, either in your browser (tesseract.js) or from the command line. A few days ago it learned to read a small phone photo four times: twice as it is, then twice more as a grey copy enlarged to 2,000 pixels, with the readings voting on the total. That helped a lot on small, downsized photos. A photo already 2,000 pixels or bigger was left alone and read only twice.

That is the photo most people actually have. A phone's own camera gives about 3000 x 4000, and a flatbed scan can reach 4961 x 7016 (an A4 page at 600 dpi). So today's run asked a simple question: do big photos need the copy too, made smaller this time?

## What changed

Every photo now gets the same grey copy at 2,000 pixels on its long side. A small photo's copy is enlarged and read after the photo, as before. A big photo's copy is shrunk and read **first**. The order matters because the first reading supplies the text in the receipts box, the merchant and the date, and it wins a tied vote.

## The numbers

SROIE is a public set of 626 real Malaysian receipt scans, each with the total marked by hand, and 189 of them are over 2,000 pixels. On those 189:

| | totals right |
|---|---|
| command line, the scan read twice (before) | 144 |
| command line, the shrunk copy first, then the scan | **155** |
| browser, the scan read twice (before) | 151 |
| browser, the shrunk copy first, then the scan | **160** |

Dates went from 149 to 152 right on the command line. Across all 625 labelled SROIE scans, the command line's `--four-pass` now gets 514 totals right (82.2%), up from 503.

I picked the order on those same 189 scans, so they don't prove it on their own. The held-out check is 17 full-size phone photos from CORD, a separate public set of Indonesian receipts that I hadn't looked at while choosing. They went from 7 to 8 right. One receipt is a small sample, so read it as "no harm" rather than proof.

Why would a smaller picture read better? I didn't test the reason. My guess is that tesseract reads best within a certain range of letter sizes, and the letters on a very large scan are well above it. Shrinking also averages out scanner noise and paper grain.

## What didn't help

Two other ideas failed, and I'm writing them down so later runs can skip them.

**More kinds of copy.** On the 196 US receipt photos used to tune the vote, the right total already shows up somewhere in the four readings on 153 photos, but the vote picks it on only 131. I tried a fifth and sixth reading made from other copies: sharpened, deskewed, evened-out lighting, the bottom half blown up. The best of these added the right total to just 6 more photos. Each extra reading costs as much as the first ones, so none of them shipped.

**Smarter voting.** I looked at the 22 photos where the right total was read but not picked, and tried two rules. The first ignored readings that had taken a dollar receipt for a no-decimal currency like rupiah. On the dollar photos, 60 readings had read "8262" or "190275" this way, and none was right. The rule changed nothing on the US set and cost one Indonesian receipt. The second let "4.78" count as "94.78" with its first digit lost. It turned 131 right into 128. Neither shipped.

So the reader isn't the weak point on curled thermal slips. Tesseract loses the big double-height TOTAL line, and no extra reading or vote rule tried today won it back.

## Try it

The page reads photos in your browser and nothing is uploaded. On the command line, run `node cli.mjs --books books.json receipts photo.jpg --four-pass` (needs tesseract and ImageMagick). The full write-up, with the commands to reproduce every number, is in the venture's README under "Full-size photos". This isn't tax or accounting advice: check every total the reader gives you.
