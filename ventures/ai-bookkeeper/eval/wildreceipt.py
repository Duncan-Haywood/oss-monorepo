# WildReceipt's test set for the receipt-photo scorers (Sun et al. 2021, arXiv 2103.14470;
# 472 receipts, mostly US and European shops and restaurants, photographed and scanned;
# Apache-2.0 on its Hugging Face card). Reads the Hugging Face parquet export
# kaydee/wildreceipt (data/test-00000-of-00001.parquet, 427 MB, the full-size photos plus
# the dataset's own labelled word boxes) and writes:
#   <labels>  one JSON line per receipt: id (the photo's hash name), total, subtotal, tax
#   <photos>/<id>.png  when a photos folder is given
# for eval/rapidocr-photos.py, eval/srd-cli.mjs and eval/cord-receipts.mjs.
#
# Labels are the boxes tagged Total_value, Subtotal_value or Tax_value. A receipt whose
# Total_value boxes print two different amounts (a total and a total-with-tip, a second
# currency) has no single answer, so its total is left null and counted; the same for tax
# (two tax rates). Nothing from the dataset but these amounts goes in the repository.
# Half the photos are small (226 of 472 under 600 px on the long side): that is the
# dataset, not the export (podbilabs/wildreceipt-donut has the same sizes as JPEG).
#   python3 -m venv v && v/bin/pip install pyarrow
#   curl -LO https://huggingface.co/datasets/kaydee/wildreceipt/resolve/main/data/test-00000-of-00001.parquet
#   v/bin/python -I eval/wildreceipt.py test-00000-of-00001.parquet eval/wildreceipt/test.jsonl photos
import json, os, re, sys
import pyarrow.parquet as pq

TOTAL, SUBTOTAL, TAX = 23, 17, 19  # the dataset's class list (ner_tags names)


def cents(s):
    """'$60.44', '12,00', 'EUR1.234,50' -> minor units; None when there is no two-decimal amount."""
    m = re.search(r"(\d[\d.,\s]*?)[.,]\s?(\d{2})(?!\d)", s)
    if not m:
        return None
    return int(re.sub(r"\D", "", m.group(1))) * 100 + int(m.group(2))


def one(words, tags, tag):
    vals = {c for w, t in zip(words, tags) if t == tag for c in [cents(w)] if c is not None}
    if not vals:
        return None, False
    if len(vals) > 1:
        return None, True
    v = vals.pop()
    return f"{v // 100}.{v % 100:02d}", False


def main(src, dst, photos=None):
    rows, two = [], {"total": 0, "tax": 0}
    if photos:
        os.makedirs(photos, exist_ok=True)
    for r in pq.read_table(src).to_pylist():
        rid = os.path.basename(r["image"]["path"]).rsplit(".", 1)[0]
        row = {"id": rid}
        for key, tag in (("total", TOTAL), ("subtotal", SUBTOTAL), ("tax", TAX)):
            row[key], amb = one(r["words"], r["ner_tags"], tag)
            if amb and key in two:
                two[key] += 1
        rows.append(row)
        if photos:
            with open(os.path.join(photos, rid + ".png"), "wb") as fh:
                fh.write(r["image"]["bytes"])
    with open(dst, "w") as fh:
        fh.write("".join(json.dumps(x) + "\n" for x in rows))
    n = lambda k: sum(x[k] is not None for x in rows)
    print(f"{len(rows)} receipts: total {n('total')} (two amounts {two['total']}), tax {n('tax')} (two amounts {two['tax']}), subtotal {n('subtotal')}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
