---
title: "A receipt checks its own total: catching OCR's misread digit with cash, change and GST"
seo_title: "Fixing OCR receipt totals with the receipt's own arithmetic"
date: 2026-11-11
description: "Checking a receipt total against cash less change and subtotal plus tax, and reading each photo twice, took tesseract totals from 76.2% to 77.9% right."
tags: [ai-bookkeeper, evaluation, bookkeeping, ocr]
---

When OCR reads a receipt photo, the total is the field that matters most for the books, and the usual way it goes wrong is one digit: `9.60` for `9.00`, `34.00` for `31.00`, `64.50` for `54.50`. The ai-bookkeeper's receipt reader gets the total right on 97.4% of the SROIE receipts (626 real Malaysian shop receipts with labelled totals) when it reads the dataset's hand-made word boxes. Run tesseract 5.3.4 over the same scans and it falls to 76.2%.

A receipt usually says what its total is more than once. The cash handed over less the change is the total. So is the before-tax subtotal plus the GST line, plus any rounding. So are the items added up. Many receipts print the total twice. If the printed total disagrees with all of these, and one of them is the printed total with exactly one digit changed, that one is probably what the paper says.

## One check is not enough

The first version took any single check that came within one digit. On the clean box text it broke 15 receipts that had been right. Items miss a discount line. A receipt prints change that doesn't add up. Through OCR it was worse: the cash and change lines get misread as often as the total, so single checks fixed about as many totals as they broke.

The version that shipped asks for **two different kinds of check to agree** before it overrules the printed total. It also ignores differences of a few cents, because Malaysian receipts round to 5 sen. That fixed 2 totals and broke none, 76.2% to 76.5%, with the box-text scores unchanged. It's small, but every change is right, and each one leaves a note asking the person to check the total.

## Read it twice

Tesseract has page-segmentation modes. `--psm 6` treats the image as one block of text and `--psm 4` as one column of lines of varying size. They make different mistakes, and on 509 receipts at least one of the two readings had the right total. When the two disagree, the reader now takes the total that more kinds of check confirm (cash less change, subtotal plus tax, the items), and keeps the first reading on a tie.

One check kind had to go: "another total line". In the second reading, the first reading's own total line shows up as "another total line" with a different misreading, and counting it picked the wrong reading as often as the right one. I chose the check kinds on the even-numbered receipts and then scored the odd-numbered ones once: 3 totals changed, 3 right, 0 wrong. On all 626 the two readings get **487 right (77.9%)**. A perfect chooser would reach 81.4%. The rest are lost to the OCR itself.

Dates didn't survive the same test. Taking a date that only the second reading found filled 18 receipts, 9 right and 9 wrong, so the reader asks for the date instead.

## The bigger win was a default

To score the command-line tool as it really runs, I also ran tesseract with no mode at all, which is what the CLI did. Tesseract's default (`--psm 3`, full page-layout analysis) got the total right on only **67.5%**, 8.7 points below `--psm 6`. All the earlier SROIE numbers had been measured with `--psm 6`, so the CLI had been doing worse than its own measurements said. Its default is now `--psm 6`, and `receipts photo.jpg --two-pass` adds the second reading.

## Limits

SROIE is flat scans, not phone photos. Shadows, skew and blur are exactly what a second reading might help with, and none are tested here. The page's in-browser OCR still reads once. The method only checks arithmetic the receipt prints, so a slip with just a total line gets no help.

Code, numbers and how to reproduce them: [ai-bookkeeper README, "Totals checked against the receipt's own arithmetic"](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/ai-bookkeeper#totals-checked-against-the-receipts-own-arithmetic-sroie-through-tesseract).
