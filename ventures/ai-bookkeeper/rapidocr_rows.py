#!/usr/bin/env python3
# Reads a receipt photo with RapidOCR (PaddleOCR's detection and recognition models run
# through ONNX Runtime, on your machine; nothing is uploaded) and prints the text as rows,
# top to bottom and left to right, the way tesseract prints a page, so receipts.mjs can
# parse it. On 200 CORD train photos of Indonesian receipts it reads the total right on
# 172 against 122 for tesseract read four ways, with the parser unchanged (README,
# "A second OCR engine for photos").
#
#   pip install rapidocr-onnxruntime        (Apache-2.0; about 50 MB with ONNX Runtime)
#   python3 rapidocr_rows.py photo.jpg
#   node cli.mjs receipts photo.jpg --rapidocr
#   python3 rapidocr_rows.py --bands photo.jpg   (three bands enlarged twice: a second look
#                                                 for a Russian slip's seller, ocr.mjs)
#
# `--rapidocr` runs this file with `python3`, or with the interpreter in RAPIDOCR_PYTHON
# (a virtual environment's python). `--selftest` checks the row grouping without RapidOCR.
# RAPIDOCR_REC_MODEL and RAPIDOCR_REC_KEYS swap in another recognition model (.onnx) and
# its character list, keeping RapidOCR's detector: for Russian receipts PaddleOCR's East
# Slavic PP-OCRv5 model reads Cyrillic where the default prints Latin look-alikes
# (README, "Russian slips with a Cyrillic recogniser").
import os
import sys


def rows(results):
    """RapidOCR's [(box, text, score), ...] as text lines. A box joins the first line whose
    vertical span holds the box's centre; lines are ordered by their top edge and words in a
    line by their left edge, two spaces apart (cleanOcr and the parser read gaps as columns)."""
    boxes = []
    for box, text, _score in results or []:
        ys = [p[1] for p in box]
        xs = [p[0] for p in box]
        boxes.append((min(ys), max(ys), min(xs), text))
    boxes.sort(key=lambda b: (b[0] + b[1]) / 2)
    lines = []
    for b in boxes:
        centre = (b[0] + b[1]) / 2
        for line in lines:
            if line["top"] <= centre <= line["bottom"]:
                line["items"].append(b)
                break
        else:
            lines.append({"top": b[0], "bottom": b[1], "items": [b]})
    lines.sort(key=lambda l: l["top"])
    return "".join("  ".join(t for *_, t in sorted(l["items"], key=lambda b: b[2])) + "\n" for l in lines)


# The bands `--bands` reads, as (top, bottom) fractions of the photo's height, each enlarged
# twice. A Russian slip prints its seller (ИП, ООО ...) anywhere from the top to the fiscal
# block near the foot (on val the line sat 10% to 91% down), in small type the detector
# misses at the photo's own size; on the 19 val slips whose first reading had no seller the
# three bands put it in the text on 6 (the photo read once: 1) and the parser took it on 5,
# losing none (README, "A second look for the seller").
BANDS = ((0.0, 0.4), (0.3, 0.7), (0.6, 1.0))
BAND_SCALE = 2


def band_rows(engine, path, bands=BANDS, scale=BAND_SCALE):
    """The photo read again as overlapping horizontal bands, each enlarged `scale` times
    (Lanczos), as text lines band after band, top to bottom."""
    import numpy as np
    from PIL import Image
    im = Image.open(path).convert("RGB")
    w, h = im.size
    out = []
    for top, bottom in bands:
        crop = im.crop((0, int(h * top), w, int(h * bottom)))
        crop = crop.resize((int(w * scale), int(h * (bottom - top) * scale)), Image.LANCZOS)
        # RapidOCR takes an array in OpenCV's channel order, as cv2.imread gives it
        out.append(rows(engine(np.array(crop)[:, :, ::-1])[0]))
    return "".join(out)


def rec_options(env=os.environ):
    """RapidOCR keyword arguments for a swapped-in recognition model, from the environment."""
    names = (("rec_model_path", "RAPIDOCR_REC_MODEL"), ("rec_keys_path", "RAPIDOCR_REC_KEYS"))
    opts = {k: env[e] for k, e in names if env.get(e)}
    if "rec_model_path" in opts and "rec_keys_path" not in opts:
        sys.exit("RAPIDOCR_REC_MODEL needs RAPIDOCR_REC_KEYS, the model's character list (one per line)")
    return opts


def selftest():
    box = lambda x, y, w=40, h=10: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
    got = rows([(box(200, 52), "96,000", 0.9), (box(10, 50), "Total", 0.9), (box(10, 30), "VAT 10%", 0.9), (box(200, 31), "8,728", 0.9)])
    assert got == "VAT 10%  8,728\nTotal  96,000\n", repr(got)
    assert rows([]) == "" and rows(None) == ""
    assert rec_options({}) == {}
    assert rec_options({"RAPIDOCR_REC_MODEL": "m.onnx", "RAPIDOCR_REC_KEYS": "d.txt"}) == {"rec_model_path": "m.onnx", "rec_keys_path": "d.txt"}
    print("ok")


def main(argv):
    if argv[1:] == ["--selftest"]:
        return selftest()
    bands = "--bands" in argv[1:]
    args = [a for a in argv[1:] if a != "--bands"]
    if len(args) != 1:
        sys.exit("usage: python3 rapidocr_rows.py [--bands] PHOTO")
    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError:
        sys.exit("rapidocr_rows.py needs RapidOCR: pip install rapidocr-onnxruntime (or set RAPIDOCR_PYTHON to a python that has it)")
    engine = RapidOCR(**rec_options())
    sys.stdout.write(band_rows(engine, args[0]) if bands else rows(engine(args[0])[0]))


if __name__ == "__main__":
    main(sys.argv)
