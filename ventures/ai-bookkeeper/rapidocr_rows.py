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
#
# `--rapidocr` runs this file with `python3`, or with the interpreter in RAPIDOCR_PYTHON
# (a virtual environment's python). `--selftest` checks the row grouping without RapidOCR.
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


def selftest():
    box = lambda x, y, w=40, h=10: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
    got = rows([(box(200, 52), "96,000", 0.9), (box(10, 50), "Total", 0.9), (box(10, 30), "VAT 10%", 0.9), (box(200, 31), "8,728", 0.9)])
    assert got == "VAT 10%  8,728\nTotal  96,000\n", repr(got)
    assert rows([]) == "" and rows(None) == ""
    print("ok")


def main(argv):
    if argv[1:] == ["--selftest"]:
        return selftest()
    if len(argv) != 2:
        sys.exit("usage: python3 rapidocr_rows.py PHOTO")
    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError:
        sys.exit("rapidocr_rows.py needs RapidOCR: pip install rapidocr-onnxruntime (or set RAPIDOCR_PYTHON to a python that has it)")
    results, _ = RapidOCR()(argv[1])
    sys.stdout.write(rows(results))


if __name__ == "__main__":
    main(sys.argv)
