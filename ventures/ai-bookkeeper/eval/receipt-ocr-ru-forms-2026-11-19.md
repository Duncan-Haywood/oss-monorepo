# Russian slips: the seller's legal form as the OCR misreads it (2026-11-19)

Flagship item (5), receipts OCR. The open item from
[`receipt-ocr-ru-eslav-2026-11-18.md`](receipt-ocr-ru-eslav-2026-11-18.md), "What is left on the
merchant": with PaddleOCR's East Slavic recogniser the seller's name is in the reading on 86% of
slips, but the parser takes it only when the line opens with a legal form it knows (ИП, ООО, АО ...).
When the engine misreads the form, the slip's seller is lost even though the name is right there.

**Short answer: held-out test 104 to 106 of 146 sellers (71.2% to 72.6%), val 113 to 117, no
slip lost on either split, totals unchanged.** A small, safe gain; most of what is left is the
OCR's, not the parser's.

## What val's misses were

Read on val only (149 photos, the development split), by printing each miss's best-matching line
locally (the labels name sole traders, so they stay out of the repository). Of the 33 misses
before this change:

| class | val slips | this change |
|---|---|---|
| form misread at the start of a column: `AD "…"` and `до "…"` for АО, `ИЛ ФАМИЛИЯ Ю.С.` for ИП, `ЗДО …` for ЗАО | 4 | taken |
| spelled-out ООО form with the name wrapped to the next line (`ОТВЕТСТВЕННОСТ` / `ЬЮ "…"`), or misread `ОБЦЕСТВО` | 2 | read, but the label prints `ООО "…"`, so still scored a miss (below) |
| seller not in the reading at 80% (misread, cut off, or a store sign only) | about 15 | OCR-bound |
| label carries no legal form (a shop sign, a brand) or reads "не распознано" | 5 | not a parser question |
| right line, misread name (`ООО "ГHта"` for ЛЕНТА, `АО "DKCM T”` for ДИКСИ) | 4 | OCR-bound |
| a second ИП with a full name where the label has initials, or the reverse | 3 | not changed |

## The rule

`receipts.mjs`, `ruForm` and `RU_MISREAD`. Each misreading is taken only where what follows rules
out an ordinary word, so a slip's other lines do not become sellers:

- `ЗДО` (or `ЗDО`) for ЗАО, followed by a word: ЗДО is not a Russian word.
- `АD`, `АД`, `DО`, `ДО` for АО, only before a quoted name: "до" alone is "until" (`до 31.12`).
- `ИЛ` for ИП, only before a surname and initials (`ИЛ ПЕТРОВА Ю.С.`) or a three-part capitalised
  name: "ил" is also a word.
- `ОБЦЕСТВО` for ОБЩЕСТВО, and `ОТВЕТСТВЕННОСТ` cut off at the line's end: when a spelled-out form
  is the last thing on its line, the next line's first column is the name, with a leading `ЬЮ`
  (the form's last letters) dropped. The form is printed as the slip spells it, corrected.

A variant that printed every spelled-out form short (`ООО "…"`, `АО "…"`) was measured on val and
dropped: it gained the two wrapped slips but lost three whose labels spell the form out (116, not
117). The dataset's labels follow the slip; so does the parser.

## Scores

Reading: RapidOCR 1.4.4 with the East Slavic PP-OCRv5 recogniser (`rec.onnx` sha256
dc6bf0e8…c9cdee, `dict.txt` 3e95f158…e5e6eb, the same files as 2026-11-18), re-read this run; the
labels rebuilt from the parquet files matched `eval/receipt-ocr-ru/{val,test}.jsonl` byte for byte.
How to run: as in the 2026-11-18 note.

| split | reading | totals right | seller taken as the merchant, main | this change |
|---|---|---|---|---|
| val (development) | East Slavic | 139 / 145 | 113 / 146 (77.4%) | **117 (80.1%)** |
| val | default RapidOCR | 140 / 145 | 20 / 146 | 20 |
| test (held out, scored once after the rule was committed) | East Slavic | 137 / 148 | 104 / 146 (71.2%) | **106 (72.6%)** |

On test the two gains are one `д0 "…"` (АО) and one spelled-out АКЦИОНЕРНОЕ ОБЩЕСТВО line; no slip
the old rule got right was lost on either split. CORD, SROIE and WildReceipt never reach this code
(it needs Cyrillic text or an ИТОГ line); the whole suite passes (3,406 tests).

## What is left

- Spelled-out or short form: three val slips and at least one test slip print the form
  spelled out on one line and short on another; the labels pick one. Not worth chasing as a score.
- About half the remaining misses are the OCR's: the name is not in the reading at 80%. A second
  reading of the header crop at a larger scale is the next thing to try, measured on val first.
- The page's JavaScript RapidOCR port still loads the default (Latin and Chinese) model only, so
  in the browser Russian slips get totals but not names. The East Slavic model is on Hugging Face,
  not on the npm CDN the page uses; moving it means a CDN or self-hosted copy and a page option.
