# A second OCR engine for receipt photos: PP-OCRv4 (PaddleOCR's detection and recognition
# models, Apache-2.0) run on your machine through RapidOCR and ONNX Runtime. The models ship
# inside the pip wheel, so nothing is downloaded at run time and nothing is uploaded.
# It prints the photo's text as lines, top to bottom and left to right, the shape the
# receipt parser reads (receipts.mjs), so it works as the CLI's OCR command:
#   python3 -m venv v && v/bin/pip install rapidocr_onnxruntime==1.4.4
#   RECEIPT_OCR_CMD="v/bin/python tools/rapidocr_receipt.py" node cli.mjs receipts photo.jpg
# or as a fifth reading next to tesseract's four (cli.mjs `--four-pass`; README, "A second
# OCR engine"). Batch mode, for the evaluations, loads the models once:
#   v/bin/python tools/rapidocr_receipt.py --batch <photos_dir> <out_dir>   (writes <id>.txt)
import os, sys


def lines_from_boxes(boxes):
    """[(box, text, score)] -> text lines: a box joins the row whose middle is within half a
    box height of its own middle, rows run top to bottom, words in a row left to right."""
    items = []
    for box, text, _score in boxes or []:
        ys = [p[1] for p in box]
        xs = [p[0] for p in box]
        items.append(((min(ys) + max(ys)) / 2, max(ys) - min(ys), min(xs), text))
    items.sort(key=lambda t: t[0])
    rows = []
    for mid, h, x, text in items:
        if rows and abs(mid - rows[-1]["mid"]) <= max(h, rows[-1]["h"]) / 2:
            r = rows[-1]
            r["words"].append((x, text))
            n = len(r["words"])
            r["mid"] += (mid - r["mid"]) / n
            r["h"] = max(r["h"], h)
        else:
            rows.append({"mid": mid, "h": h, "words": [(x, text)]})
    return "\n".join(" ".join(t for _, t in sorted(r["words"])) for r in rows)


def engine():
    from rapidocr_onnxruntime import RapidOCR
    return RapidOCR()


def read(eng, path):
    boxes, _ = eng(path)
    return lines_from_boxes(boxes)


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["--batch"]:
        src, out = args[1], args[2]
        os.makedirs(out, exist_ok=True)
        eng = engine()
        names = sorted(f for f in os.listdir(src) if f.lower().endswith((".png", ".jpg", ".jpeg")))
        for i, f in enumerate(names):
            dest = os.path.join(out, os.path.splitext(f)[0] + ".txt")
            if os.path.exists(dest):
                continue
            with open(dest, "w") as fh:
                fh.write(read(eng, os.path.join(src, f)) + "\n")
            if (i + 1) % 50 == 0:
                print(f"{i + 1} of {len(names)}", file=sys.stderr)
    elif len(args) == 1:
        print(read(engine(), args[0]))
    else:
        sys.exit("usage: rapidocr_receipt.py <photo> | --batch <photos_dir> <out_dir>")
