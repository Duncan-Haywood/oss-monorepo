# WildReceipt receipts (amounts only)

`test.jsonl` (472), `train0.jsonl` (634, the first of two train shards) and `train1.jsonl`
(633, the second, read 2026-11-17 from `data/train-00001-of-00002.parquet`) hold the hand-labelled
total, subtotal and tax of each receipt photo in **WildReceipt** (Sun et al., "Spatial
Dual-Modality Graph Reasoning for Key Information Extraction", arXiv 2103.14470, 2021; released
with OpenMMLab's MMOCR), licensed **Apache-2.0** on its Hugging Face card. Read 2026-11-17 from
the Hugging Face export `kaydee/wildreceipt` (`data/test-00000-of-00001.parquet`,
`data/train-00000-of-00002.parquet`), which carries the photos and the dataset's own labelled
word boxes. The receipts are photographed and scanned shop, restaurant, fuel and hotel receipts,
mostly from the US and Europe, with some from Asia and Australia; half the photos are small
(226 of the 472 test photos are under 600 px on their long side).

Each line: `id` (the photo's hash name, or the dataset's own number for a few), `total`,
`subtotal`, `tax` (the amount on the boxes tagged `Total_value`, `Subtotal_value`,
`Tax_value`, as `12.34`, or null). A receipt whose boxes of one tag print two different
amounts (a total and a total with tip; two tax rates) has null there: test 4 totals and 24 taxes,
train0 4 and 36, train1 4 and 44. Changes from the source: photos, text and every other field dropped.
`../wildreceipt.py` writes these files and, given a folder, the photos.

What it is and is not evidence of:

- It tests **OCR and parsing together** on receipts the parser was not written for: US and
  European layouts, dollar, euro, franc and rupee amounts, German, French, Spanish,
  Croatian and other languages.
- The labels are not perfect. 7 test and 11 train0 totals are `0.00` (one checked is a USPS prepaid
  label whose total really is $0.00; the rest were not checked); a Malaysian slip's total is labelled before
  its 5-sen rounding while the parser reports what was paid; some printed tax lines are not
  tagged at all (so "tax read where none labelled" counts include real taxes).
- `test.jsonl` is the held-out set: scored once before and once after a change, never used to
  choose one. `train0.jsonl` and `train1.jsonl` are for development.
