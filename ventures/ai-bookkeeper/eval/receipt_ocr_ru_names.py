# The seller and item names cdek-ocr/receipt-ocr-ru labels on each receipt, for
# eval/receipt-ru-names.mjs. Sole traders (ИП) are labelled by their full personal name, so
# this file's output stays on your machine: write it outside the repository and commit only
# the scorer's counts (eval/receipt-ocr-ru-eslav-2026-11-18.md).
#   v/bin/python -I eval/receipt_ocr_ru_names.py val-00000-of-00001.parquet /tmp/names-val.jsonl
import json, sys
import pyarrow.parquet as pq


def main(src, dst):
    rows = pq.read_table(src, columns=["image_id", "seller_text", "item_texts"]).to_pylist()
    with open(dst, "w") as fh:
        for r in rows:
            fh.write(json.dumps({"id": r["image_id"].replace(" ", "_"), "seller": r["seller_text"] or None, "items": r["item_texts"] or []}, ensure_ascii=False) + "\n")
    print(f"{len(rows)} receipts: seller labelled on {sum(bool(r['seller_text']) for r in rows)}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
