# cdek-ocr/receipt-ocr-ru for the receipt-photo scorers: about 1,000 phone photos of
# Russian shop receipts (Lenta, Perekrestok, Spar, small sole traders, the St Petersburg
# metro), MIT on its Hugging Face card, labelled "human, machine-assisted": seller, INN,
# date, total and item lines. Reads one of the card's parquet files (data/val-*, data/test-*;
# the parquet splits are not the annotations/ folder's splits, and val and test share no
# photo) and writes:
#   <labels>  one JSON line per receipt: id (image_id), total, and items_add_up (true when
#             the labelled item sums make the labelled total to the kopeck, false when they
#             do not, null with no items): a check on the machine-assisted labels
#   <photos>/<id>.jpg  when a photos folder is given
# for eval/rapidocr-photos.py, eval/srd-cli.mjs and eval/cord-receipts.mjs. The dataset has
# no tax label, so only totals are scored. A total like "690.00 РУБ" keeps its digits;
# a total that is not one amount is null. Nothing from the dataset but these amounts goes
# in the repository.
#   python3 -m venv v && v/bin/pip install pyarrow
#   curl -LO https://huggingface.co/datasets/cdek-ocr/receipt-ocr-ru/resolve/main/data/test-00000-of-00001.parquet
#   v/bin/python -I eval/receipt_ocr_ru.py test-00000-of-00001.parquet eval/receipt-ocr-ru/test.jsonl photos
import json, os, re, sys
import pyarrow.parquet as pq


def kopecks(s):
    """'214.98', '690.00 РУБ', '549', '1 230,93' -> kopecks; None when not one amount."""
    if s is None:
        return None
    t = re.sub(r"(?<=\d)\s+(?=\d{3}\b)", "", str(s)).replace(",", ".")
    nums = re.findall(r"\d+(?:\.\d{1,2})?", t)
    if len(nums) != 1:
        return None
    whole, _, frac = nums[0].partition(".")
    return int(whole) * 100 + int(frac.ljust(2, "0"))


def main(src, dst, photos=None):
    rows = []
    if photos:
        os.makedirs(photos, exist_ok=True)
    cols = ["image_id", "image", "total_text", "item_sums"] if photos else ["image_id", "total_text", "item_sums"]
    for r in pq.read_table(src, columns=cols).to_pylist():
        rid = r["image_id"].replace(" ", "_")
        k = kopecks(r["total_text"])
        sums = [kopecks(x) for x in (r["item_sums"] or [])]
        adds = None if not sums or k is None or None in sums else sum(sums) == k
        rows.append({"id": rid, "total": None if k is None else f"{k // 100}.{k % 100:02d}", "items_add_up": adds})
        if photos:
            with open(os.path.join(photos, rid + ".jpg"), "wb") as fh:
                fh.write(r["image"]["bytes"])
    with open(dst, "w") as fh:
        fh.write("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in rows))
    n = sum(x["total"] is not None for x in rows)
    a = sum(x["items_add_up"] is True for x in rows)
    print(f"{len(rows)} receipts: total {n}, item sums make the total on {a}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
