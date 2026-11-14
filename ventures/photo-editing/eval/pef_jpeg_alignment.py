"""Where on a PEF's stored frame was the camera's own full-size JPEG cut from?

Slides the embedded JPEG (as luminance) over a 2x2-box average of the raw
sensels (black subtracted; a 2x2 box is the same mix of R, G, G and B wherever
it sits, so it needs no demosaic), and prints the offsets with the highest
correlation of the logs, for the whole frame and for each corner separately (the
same best shift in every corner means a pure shift, no scaling or lens
correction in between). A box at (x, y) is centred on raw (x + 0.5, y + 0.5), so
a tie between boxes at x and x + 1 puts JPEG column 0 on raw column x + 1.

Usage (from ``ventures/photo-editing``; rawpy, numpy and Pillow in a venv)::

    PYTHONPATH=src /tmp/v/bin/python eval/pef_jpeg_alignment.py FILE.PEF [--x 10:19] [--y 24:33]

Result on the K-1 Mark II PEF of drewnoakes/metadata-extractor-images
(2026-11-14): boxes (13, 27), (14, 28), (13, 28), (14, 27) tie at r = 0.876, every
corner's best is (13, 27), so the JPEG starts at raw (14, 28):
``pef.MEASURED_CROPS``, ``eval/pentax-pef-reader-2026-11-14.md``.
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path


def main(argv=None) -> int:
    import numpy as np
    from PIL import Image

    from shootflow import pef
    from shootflow import raw_develop as rd

    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("file", type=Path)
    ap.add_argument("--x", default="10:19", help="box x range, start:stop")
    ap.add_argument("--y", default="24:33", help="box y range, start:stop")
    args = ap.parse_args(argv)
    xs = range(*map(int, args.x.split(":")))
    ys = range(*map(int, args.y.split(":")))

    data = args.file.read_bytes()
    reader = rd._Reader(data)
    ifds = rd._all_ifds(reader)
    jpegs = [i for i in ifds if i.one(513) and i.one(514)]
    big = max(jpegs, key=lambda i: i.one(rd.TAG_WIDTH, 0) * i.one(rd.TAG_HEIGHT, 0))
    start, length = big.one(513), big.one(514)
    jp = np.log(np.maximum(np.asarray(Image.open(io.BytesIO(data[start : start + length])).convert("L"), float), 1))
    raw = pef.parse_pef(data)
    black = raw.ifd.entries[rd.TAG_BLACK_LEVEL][0]
    sensor = np.frombuffer(raw.values, dtype=np.uint16).reshape(raw.height, raw.width).astype(float) - black
    box = (sensor[:-1, :-1] + sensor[1:, :-1] + sensor[:-1, 1:] + sensor[1:, 1:]) / 4
    lb = np.log(np.maximum(box, 1))
    h, w = jp.shape
    print(f"JPEG {w}x{h}, frame {raw.width}x{raw.height}")

    def best(window):
        found = []
        for oy in ys:
            for ox in xs:
                a = lb[oy : oy + h, ox : ox + w]
                if a.shape != jp.shape:
                    continue
                r = np.corrcoef(a[window][::3, ::3].ravel(), jp[window][::3, ::3].ravel())[0, 1]
                found.append((round(float(r), 4), ox, oy))
        return sorted(found, reverse=True)

    print("whole frame:", best((slice(100, -100), slice(100, -100)))[:4])
    corners = {
        "top left": (slice(100, 900), slice(100, 1300)),
        "top right": (slice(100, 900), slice(-1300, -100)),
        "bottom left": (slice(-900, -100), slice(100, 1300)),
        "bottom right": (slice(-900, -100), slice(-1300, -100)),
    }
    for name, window in corners.items():
        print(f"{name}:", best(window)[0])
    return 0


if __name__ == "__main__":
    sys.exit(main())
