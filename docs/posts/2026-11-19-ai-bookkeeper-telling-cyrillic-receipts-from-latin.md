---
title: "Telling a Russian receipt from an English one by its misread capitals"
seo_title: "Detecting Cyrillic receipts from a Latin OCR reading"
date: 2026-11-19
description: "The bookkeeper's receipt reader now picks Latin or Cyrillic from the photo: 148 of 151 held-out Russian slips and every Latin receipt tested."
tags: [ai-bookkeeper, receipts, ocr, browser]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads receipt photos on your own machine
and matches each one to a bank line. This morning its page learned to read Russian slips with a
Cyrillic recogniser ([post](2026-11-19-ai-bookkeeper-russian-receipts-in-the-browser.md)), but only
if you picked "Cyrillic" from a menu. The default was Latin. On a Russian slip the Latin reader still
gets the total, so nothing looks broken. It just loses the seller and the item names: it took the
seller on 16 of 146 held-out slips, against 106 with Cyrillic picked. Most people would never
think to change the menu.

So the page now picks the alphabet itself. The new default, **From the photo**, reads each photo
with the Latin recogniser, decides from that text whether the slip is Cyrillic, and if so reads it
again with the Cyrillic one.

## The tell: lower case in the wrong place

When a Latin-only OCR model meets Cyrillic, it prints the nearest Latin shapes. Upper-case Cyrillic
mostly has look-alikes among Latin capitals: А В Е К М Н О Р С Т Х. But seven Cyrillic letters
look like Latin *lower case*: а е о р с у х. On a printed slip, where the Cyrillic text is set in
mixed case or in fonts whose small letters stand out, these come out as lower-case Latin letters
in the middle of capitals:

- `CyMMA` for СУММА (amount)
- `nPHXOA` for ПРИХОД (sale)
- `KACCOBbIA` for КАССОВЫЙ (cash register), with ы read as `bI`

English receipts glue words too, since OCR drops spaces, but the case runs the other way:
`ChickenFried`, `BevSubtotal`, `ShowusyourreviewonTripAdvisor`. A lower-case letter followed by
*two* capitals is rare. The rule counts those words. Three or more, and the slip is Cyrillic. Brand
prefixes such as `McDONALD'S`, `iPHONE` and `eBAY` are set aside first, so a fast-food receipt with
three McSomethings stays Latin.

## How well it picks

The threshold was set on two development sets, then the rule was scored once on held-out sets:

| set | receipts | picked right |
|---|---|---|
| Russian slips, val (development) | 149 | 147 Cyrillic |
| US receipts, SRD (development) | 200 | 200 Latin |
| Russian slips, test (held out) | 151 | 148 Cyrillic |
| Indonesian receipts, CORD (held out) | 100 | 100 Latin |
| US, European and Asian receipts, WildReceipt (held out) | 472 | WR_RESULT |

On the development slips the count ran from 3 to 30. No US receipt had more than 2. Every slip the
rule missed is short, 5 to 43 words, so there are only a few words to count. Some of those
readings do contain `KACCA` and `HAC 5%` (НДС, the VAT line), so a rule based on known words might
catch them. We saw those words only by looking at the held-out misses, though, so building that
rule now would mean fitting it to the test. It waits for a fresh set.

## What a visitor gets

On the 151 held-out Russian slips, with the menu left alone:

| reading | totals right | seller taken | item names found |
|---|---|---|---|
| Latin (the old default) | 137 of 148 | 16 of 146 | 81 of 459 |
| From the photo (new default) | 136 of 148 | 106 of 146 | 379 of 459 |

That matches picking Cyrillic by hand. One total is lost, on a short slip the rule left on Latin.
The rule only looks at text, so we also checked the browser's own OCR on 57 of the photos in
headless Chromium. It picked right on all 57.

Cost: a Russian photo is read twice, about five seconds more in the browser. The Cyrillic model
(about 8 MB, hash-checked) downloads only when a photo needs it. A batch of English receipts never
fetches it.

## A bug found on the way

The test for the command line's new hint ("this receipt looks Cyrillic; set
`RAPIDOCR_REC_MODEL`") failed for a reason unrelated to the hint. `receipts photo.jpg --rapidocr`
was not running RapidOCR at all. The CLI's flag reader removes each flag as it reads it, and the
receipt command checked `--rapidocr` twice. The first check consumed the flag, and the photo went
to tesseract. With `--four-pass` added it worked. The evaluations read photos through their own scripts or in
that mode, so no measured number changes. Running `--rapidocr` on its own now does what it says.

Method, every number and how to reproduce:
[`eval/receipt-script-2026-11-19.md`](../../ventures/ai-bookkeeper/eval/receipt-script-2026-11-19.md).
