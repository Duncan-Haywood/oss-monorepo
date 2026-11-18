# cdek-ocr/receipt-ocr-ru: Russian receipt photos, totals labelled

Labels for the receipt-photo scorers from
[cdek-ocr/receipt-ocr-ru](https://huggingface.co/datasets/cdek-ocr/receipt-ocr-ru) (MIT on its
Hugging Face card): phone photos of Russian shop receipts, labelled "human, machine-assisted".
`../receipt_ocr_ru.py` writes one file per parquet file: `val.jsonl` (149 receipts),
`test.jsonl` (151), `train0.jsonl`, `train1.jsonl` and `train2.jsonl` (233 each; `data/train-0000{0,1,2}-of-00003`).
All shards have now been read and used; none is held out any more.

Fields: `id` (the dataset's `image_id`), `total` (as a decimal string, or null when the label
is not one amount) and `items_add_up` (whether the labelled item sums make the labelled total
to the kopeck; null with no items), a check on labels a machine helped write. The dataset has no
tax label. The photos are not committed; the script fetches nothing itself, see its header.

Results and how each split was used: [`../receipt-ocr-ru-2026-11-18.md`](../receipt-ocr-ru-2026-11-18.md)
(val, test, train 0 and 1) and [`../receipt-ocr-ru-train2-2026-11-18.md`](../receipt-ocr-ru-train2-2026-11-18.md) (train 2).
