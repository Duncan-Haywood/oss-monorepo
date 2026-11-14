---
title: "The command line reads a receipt photo four times now, and one damaged JPEG taught it something"
seo_title: "Tesseract receipt OCR: four readings and a vote, from the command line"
date: 2026-11-14
description: "The ai-bookkeeper CLI reads a small receipt photo four times with tesseract and the readings vote: US photo totals 57.7% to 66.8% right, scans 78.7% to 80.5%."
tags: [ai-bookkeeper, evaluation, ocr, receipts]
---

Two days ago the ai-bookkeeper's web page learned to read a small receipt photo four times. It reads the photo in two of tesseract's layout modes, then a grey copy enlarged to 2,000 pixels in both modes again, and the readings vote on the total. On 196 real US receipt photos that took totals from 60.7% to 68.4% right. The command-line tool didn't get the change. It calls the tesseract program installed on your machine, not the in-browser build, and it still read a photo at most twice.

Now it can do all four readings: `receipts photo.jpg --four-pass`. ImageMagick makes the grey copy, and the same vote settles the total. A photo already 2,000 pixels or larger is read twice, since enlarging was only ever measured on small photos. If ImageMagick isn't installed, the photo is read twice and nothing fails.

## Does the page's result carry over to another engine?

Not necessarily. The vote's weights were chosen with tesseract.js on half of the US photos, and the native binary (tesseract 5.3.4 here) is a different build with different mistakes. So I measured it on the same labels and changed nothing:

| totals right | `--two-pass` | `--four-pass` |
|---|---|---|
| 196 US receipt photos (ExpressExpense) | 113 (57.7%) | 131 (66.8%) |
| the 97 of those held out when the weights were chosen | 58 (59.8%) | 66 (68.0%) |
| 625 Malaysian receipt scans (SROIE) | 492 (78.7%) | 503 (80.5%) |

It carries over. On the held-out half of the US photos the gain is 8 points, about what the page got. Wrong totals fall from 76 to 62. The binary ends up within two points of the browser engine on both sets, so the gap between them is the engines, not the reader. The tax line didn't improve (73 to 74 of 185 right). On these photos the tax line goes missing together with the total line, and reading it more often doesn't bring it back.

## The scan that stopped the tool

One of SROIE's 626 scans, number 427, stopped the run cold. It is a 4961 x 7016 JPEG with a corrupt Huffman code. Tesseract's image library refuses it ("jpeg: no pix returned"), and the CLI then reported "tesseract is needed (install tesseract-ocr)". That was wrong advice, since tesseract was installed. ImageMagick opens the file with a warning and writes a clean PNG. So when tesseract fails to open a photo, the CLI now reads it again from an ImageMagick copy. If that fails too, the error quotes tesseract's own message instead of telling you to install something you already have. A phone or scanner that writes a slightly broken JPEG is ordinary. A bookkeeping tool that tells you to install software you already have is not.

## What it costs and what's next

A small photo takes four tesseract runs instead of two: about 2.6 seconds for a 750 x 1000 photo on four cores. That's why `--four-pass` is a flag and not the default. Still not measured: full-size 12-megapixel phone photos, and flattening a curled slip before OCR. On these photos the curl is where the big printed total gets lost.

Commands and data are in the venture's README under "The CLI reads a photo four times too". The photos are fetched at run time from a public MIT-licensed copy and never committed. The totals they're scored against were read by eye.
