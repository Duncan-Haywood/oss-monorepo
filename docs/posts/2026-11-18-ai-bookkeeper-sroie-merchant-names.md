---
title: "The OCR engine read the shop's name; the parser printed the typos"
seo_title: "Receipt OCR merchant names: fixing RapidOCR misreads"
date: 2026-11-18
description: "On 313 held-out Malaysian receipt scans, cleaning RapidOCR's misread shop names lifted exact merchants from 68.7% to 73.2%, with none made worse."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads receipt photos on your own machine
and pulls out the merchant, the date and the total. Then it matches each receipt to a bank line.
The merchant name matters for that match, and it is what a person scans when they check the result.

On SROIE, 626 Malaysian shop receipts with the merchant labelled by hand
([zzzDavid/ICDAR-2019-SROIE](https://github.com/zzzDavid/ICDAR-2019-SROIE), MIT), the reader got
83-86% of merchant names exactly right from the dataset's own clean text. With RapidOCR reading
the scans, which is how the app reads a photo, it got only 67-69%. That gap is what this run looked
at.

## The engine was not the problem

We split the scans in half before changing anything: 313 to read misses from, 313 held out. Of the
69 wrong names in the first half, most were not wrong lines. RapidOCR had found the shop's name
and misread a few characters in it:

- `SDN BHD`, the Malaysian "private limited", came out as `San Bhd`, `SIN BHD`, `SONBHD`,
  `5dn Bhd`, `SDN 3HD` and `SDN.BHZ`;
- zeros, ones and fives inside words: `AEON C0.`, `KMF F00DICI0US`, `URBAN 1DEA`, `MR.D.1.Y.`;
- `S/B` (Sendirian Berhad, shortened) as `5/B` or `S/R`.

Two other faults made the reader pick the wrong line entirely. On four AEON slips the company line
ends in its registration number in a full-width bracket, `(126926-H）`. The reader didn't treat
that as a registration number, so the line failed the "is this a name" test and the address under
it was taken. And boilerplate the engine glued together or misspelt (`TQFORSHOPPINGWITHmyNEWS`,
`For feedtack or ccpiaint`) slipped past the list of lines that are never a shop's name.

## What changed

The reader now cleans the merchant line before returning it. Each `SDN BHD` misread becomes
`SDN BHD`, and a 0, 1 or 5 caught between letters becomes O, I or S. Names with real numbers in
them (`LOT10`, `OLIVE9`, `99 SPEED MART`, `7-ELEVEN`) are left alone, and a test pins each case.
Registration numbers are recognised in full-width or unclosed brackets, and the glued boilerplate
is skipped.

## Results

| SROIE, RapidOCR leading | before | after |
|---|---|---|
| first half (rules written here) | 211 of 313 (67.4%) | 239 (76.4%) |
| **held-out half, scored once before and once after** | **215 of 313 (68.7%)** | **229 (73.2%)** |

On the held-out half 14 receipts got better and none got worse. Dates and totals didn't move, and
the clean-text scores rose by two in each half. The gain held out is half the gain on the half the
rules came from, which is the usual cost of writing rules from misses you can see.

The headline number undersells one change. Sixty-three held-out names were already "exact",
because the scorer ignores spaces. Before this change they printed as
`GARDENIABAKERIES(KL)SDNBHD`; now they print as `GARDENIABAKERIES(KL) SDN BHD`. It's still not
perfect, but it's closer to what a bookkeeper expects to see in the merchant column.

## What is left

About twenty misses are plain misreads (`PEIRO` for PETRO, `Dwner` for OWNER) with no pattern to
fix. About ten are slips that print a brand (`Chili's`, `Harvey Norman`) where the label is the
company that owns it. Three Domino's slips were scanned upside down and read as `YZZIG S.ONINOO`.
The last two are separate problems: reading the legal-entity line under the brand, and retrying a
scan at 180 degrees. The full write-up with every count is in
[`eval/sroie-merchant-names-2026-11-18.md`](../../ventures/ai-bookkeeper/eval/sroie-merchant-names-2026-11-18.md).
