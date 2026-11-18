# Russian slips: a Cyrillic recogniser for RapidOCR, and the seller as the merchant (2026-11-18)

Flagship item (5), receipts OCR. The open item from
[`receipt-ocr-ru-rus-vote-2026-11-18.md`](receipt-ocr-ru-rus-vote-2026-11-18.md): RapidOCR's
default recognition model has no Cyrillic and prints ИТОГ as `HTOr`; would a Cyrillic model read
these slips better?

**Short answer: the same totals, but now the words.** With PaddleOCR's East Slavic PP-OCRv5
recogniser swapped in (RapidOCR's detector unchanged), totals stay where they were (val 140 of 145
before the parser change below, test 137 of 148, both as the default model), but the seller's name
is in the reading on 86% of slips against 30%, and the labelled item names on 83-86% against
15-18%. The parser's merchant rules looked for Latin shop names and picked the seller on **0 of
146** Russian slips; a rule for the legal form that opens a Russian seller's name (ИП, ООО, АО ...)
takes it on **104 of 146 held-out test slips (71.2%)**.

## The models

| model | where | licence | result |
|---|---|---|---|
| `eslav_PP-OCRv5_mobile_rec`, ONNX (7.9 MB, 517 characters: Russian, Ukrainian, Belarusian, Bulgarian and Latin) | Hugging Face `monkt/paddleocr-onnx`, `languages/eslav/rec.onnx` and `dict.txt` (revision 7b02d0a3) | Apache-2.0 (PaddleOCR's) | scored below |
| `cyrillic_PP-OCRv3_rec` (PaddleOCR's own inference model, converted with paddle2onnx 2.x) | `paddleocr.bj.bcebos.com/PP-OCRv3/multilingual/cyrillic_PP-OCRv3_rec_infer.tar` | Apache-2.0 | read one test photo as mostly Latin noise (`Hfhyle neaghe ithe ord shet.`), where the v5 model read the same lines; not scored. The conversion, not the model, may be at fault; not chased, since v5 is newer and reads well |

sha256: `rec.onnx` dc6bf0e855247decce214ba6dae5bc135fa0ad725a5918a7fcfb59fad6c9cdee,
`dict.txt` 3e95f1581557162870cacdba5af91a4c6be2890710d395b0c3c7578e7ee5e6eb. Neither file is in
the repository: a user fetches them (README, "Russian slips with a Cyrillic recogniser").

## How it was run

```
python3 -m venv v && v/bin/pip install pyarrow rapidocr-onnxruntime==1.4.4
curl -L -o eslav.onnx https://huggingface.co/monkt/paddleocr-onnx/resolve/main/languages/eslav/rec.onnx
curl -L -o eslav_dict.txt https://huggingface.co/monkt/paddleocr-onnx/resolve/main/languages/eslav/dict.txt
curl -LO https://huggingface.co/datasets/cdek-ocr/receipt-ocr-ru/resolve/main/data/val-00000-of-00001.parquet
v/bin/python -I eval/receipt_ocr_ru.py val-00000-of-00001.parquet val.jsonl photos-val   # byte-for-byte the committed labels
v/bin/python -I eval/receipt_ocr_ru_names.py val-00000-of-00001.parquet /tmp/names-val.jsonl   # seller and item names, kept out of the repo
for k in 1 2 3 4; do OMP_NUM_THREADS=1 RAPIDOCR_REC_MODEL=eslav.onnx RAPIDOCR_REC_KEYS=eslav_dict.txt v/bin/python eval/rapidocr-photos.py photos-val es-val $k 4 & done; wait
for k in 1 2 3 4; do OMP_NUM_THREADS=1 v/bin/python eval/rapidocr-photos.py photos-val df-val $k 4 & done; wait
node eval/cord-receipts.mjs eval/receipt-ocr-ru/val.jsonl --ocr es-val
node eval/receipt-ru-names.mjs /tmp/names-val.jsonl --ocr es-val
```

The same for test. `RAPIDOCR_REC_MODEL` and `RAPIDOCR_REC_KEYS` are new: `rapidocr_rows.py` (the
CLI's `--rapidocr`) and `eval/rapidocr-photos.py` pass them to RapidOCR as `rec_model_path` and
`rec_keys_path`. One photo takes about 2.0-2.2 s with either model on this container (one core).

`eval/receipt-ru-names.mjs` scores names. Both sides are folded first (upper case, Ё as Е, the
Latin letters that look like Cyrillic ones and 0 read as Cyrillic, punctuation dropped), so the
default model is not marked down for printing `OOO "LENTA"`-style look-alikes. A name is "in the
text" when some stretch of one line matches it at 80% or better (1 - edit distance / length);
"taken as the merchant" compares `parseReceipt`'s merchant with the label the same way.
Sole traders (ИП) are labelled by their own full names, so the names file stays outside the
repository and the scorer's `--misses` prints only what the parser picked.

## Val (development set), 149 photos

| reading | totals right (of 145) | seller in the text (of 146) | items in the text (of 482) | seller taken as the merchant |
|---|---|---|---|---|
| default RapidOCR, main | 140 | 44 (30.1%) | 71 (14.7%) | 5 (3.4%) |
| East Slavic model, main | 140 | 125 (85.6%) | 412 (85.5%) | 0 |
| default, this change | 140 | 44 | 71 | 20 (13.7%) |
| East Slavic, this change | **139** | 125 | 412 | **113 (77.4%)** |

The two models miss different totals (default: `IMG_2003`, `1031`, `0821`, `1061`, `1480`; East
Slavic: `0905`, `1031`, `1061`, `0805`, `2003`), but no vote of the two (either one leading,
neither, or the page's settled text) got more than 140: where they disagree, neither reading's
arithmetic settles it.

## Test (held out), 151 photos, scored once after every rule was written

| reading | totals right (of 148) | seller in the text (of 146) | items in the text (of 459) | seller taken as the merchant |
|---|---|---|---|---|
| default RapidOCR, this change | 137 | 43 (29.5%) | 81 (17.6%) | 16 (11.0%) |
| East Slavic, main | 137 | 125 (85.6%) | | 0 |
| East Slavic, this change | **137** | 125 (85.6%) | 379 (82.6%) | **104 (71.2%)** |
| default leading the East Slavic, or the reverse, or two-reading vote | 137 | | | |

## The parser changes

1. **The seller is the line that starts with a legal form** (`receipts.mjs` `russianSeller`). On a
   slip with Cyrillic text or an ИТОГ line, the first column (a run of text between two-space gaps)
   that starts with ИП, ООО, АО, ПАО, ЗАО, ОАО, ГУП, МУП, ФГУП or the spelled-out forms
   (ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ, АКЦИОНЕРНОЕ ОБЩЕСТВО, ОБЩЕСТВО С ОГРАНИЧЕННОЙ
   ОТВЕТСТВЕННОСТЬЮ) is the merchant. The form is matched on a folded copy (`000`, `O0O` and `AO`
   are how the engines print ООО and АО) and printed in Cyrillic; a quoted name ends at its closing
   quote (`ООО "КЛАУДС БАР" 191036, г. ...` is the bar); a form with no name after it (an ИНН
   line) is skipped. Lines naming a bank (`ПАО СБЕРБАНК`, on the card terminal's slip) or a fiscal
   data operator (ОФД: Ярус, Петер-Сервис Спецтехнологии, Такском, Тензор, Эвотор, Контур) are
   skipped: val's first version took them on four slips.
2. **ИТОГ with a Cyrillic Н or М for the И** (`НТОГ` on 10 of val's slips, `МТОГО` on one) is a
   total word. The default model prints the Latin `H` and `M`, which were already in. This change
   cost one total on val (140 to 139) and none on test: on `IMG_1528` the total's amount drifted a
   row and the ИТОГ line now carries the VAT amount (`НТОГ =37.39` over `СУММА НДС 5% =785.00`),
   and on `IMG_0905` it took the card line's misread `183.00` over ИТОГ's right `1183.00` (before,
   neither was read as the total and the slip's pre-discount sum was taken, also wrong). It is kept
   because the word is what the slip prints; a dropped leading digit on the card line is an open
   item.

Unchanged: CORD's hand-corrected text (train 767/779, validation 97/98, test 94/95), SROIE's 626
merchants, dates and totals (531 exact merchants, 601 dates, 609 totals), RapidOCR's default reading
on val (140) and test (137). Tests: `receipt-russian-seller.test.mjs` (7). The whole ai-bookkeeper
suite passes (3,402 tests).

## What is left on the merchant

Of the 42 test misses, read after scoring: on 21 the seller's name is not in the reading at 80%
(the engine misread it or the photo cut it off). On the other 21 it is, and the parser took
something else: six labels carry no legal form at all (a brand, a shop sign or a person's name
without ИП, where the slip's own form line names the legal entity, e.g. `Магазин ...` against
`ООО "Вкусвилл"`); on most of the rest the form is misread (`ИЛ` for ИП, `ЗДО` for ЗАО, `AD` for
АО, `ЬЮ` for ООО) or does not open a column, so no line starts with one; two quoted names lost
their closing quote and were cut short. A looser form match would have to be measured against
false hits on the slips' other lines before it goes in.

## What a user should run

For Russian receipt photos: fetch the two files above and run
`RAPIDOCR_REC_MODEL=eslav.onnx RAPIDOCR_REC_KEYS=eslav_dict.txt node cli.mjs receipts photo.jpg --rapidocr`.
Totals are as good as with the default model, and the merchant and the item lines come out in
readable Russian, which is what a bank line is matched against and what a person checks.
Not done: the page's JavaScript RapidOCR port still loads the default model only.
