"""Where on a RAF's stored frame was the camera's own full-size JPEG cut from?

Renders the raw with LibRaw (``rawpy.postprocess``: its own demosaic, linear,
camera white balance, no auto-brightening; the output covers LibRaw's visible
area, which starts at raw (left_margin, top_margin)), converts both it and the
embedded JPEG to luminance, and slides the JPEG over the render, printing the
offsets with the highest correlation of the logs for the whole frame and for
each corner on its own (the same best shift in every corner means a pure
shift, no scaling or lens correction in between). Offsets are printed in
stored-frame (raw) coordinates, next to the file's own picture area (header
records 0x0110, 0x0111, read by ``shootflow.raf``) and LibRaw's crop.

Usage (from ``ventures/photo-editing``; rawpy, numpy and Pillow in a venv)::

    PYTHONPATH=src /tmp/v/bin/python eval/raf_jpeg_alignment.py FILE.RAF [--search 12]

Results on the three RAFs of drewnoakes/metadata-extractor-images (2026-11-14):
``eval/fujifilm-raf-reader-2026-11-14.md``.
"""

from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path


def best_shift(ref, jpg, x0, y0, search):
    import numpy as np

    h, w = jpg.shape
    a = jpg - jpg.mean()
    best = []
    for dy in range(-search, search + 1):
        for dx in range(-search, search + 1):
            y, x = y0 + dy, x0 + dx
            if y < 0 or x < 0 or y + h > ref.shape[0] or x + w > ref.shape[1]:
                continue
            b = ref[y : y + h, x : x + w]
            b = b - b.mean()
            r = float((a * b).sum() / np.sqrt((a * a).sum() * (b * b).sum()))
            best.append((r, x, y))
    best.sort(reverse=True)
    return best[:3]


def main(argv=None) -> int:
    import numpy as np
    import rawpy
    from PIL import Image

    from shootflow import raf
    from shootflow import raw_develop as rd

    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--search", type=int, default=12, help="pixels either way around the file's own picture origin")
    args = ap.parse_args(argv)
    for path in args.files:
        data = path.read_bytes()
        jo, jl = (int.from_bytes(data[84 + 4 * i : 88 + 4 * i], "big") for i in range(2))
        im = Image.open(io.BytesIO(data[jo : jo + jl])).convert("L")
        stored_jpeg = list(im.size)
        lib = rawpy.imread(str(path))
        sz = lib.sizes
        rgb = lib.postprocess(gamma=(1, 1), no_auto_bright=True, use_camera_wb=True, output_bps=16)
        lum = rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114
        # Into stored-frame coordinates: pad by LibRaw's margins.
        ref = np.zeros((sz.raw_height, sz.raw_width))
        ref[sz.top_margin : sz.top_margin + lum.shape[0], sz.left_margin : sz.left_margin + lum.shape[1]] = lum
        ref = np.log1p(ref)
        e = raf.parse_raf(data).ifd.entries
        ox, oy = e.get(rd.TAG_CROP_ORIGIN, (0, 0))
        cw, ch = e.get(rd.TAG_CROP_SIZE, (0, 0))
        if cw and ch and tuple(im.size) != (cw, ch):
            # A reduced JPEG (the S5500's is 1280x960): scaled up to the picture area's size first.
            im = im.resize((cw, ch), Image.BICUBIC)
        jpg = np.log1p(np.asarray(im, dtype=np.float64))
        h, w = jpg.shape
        row = {
            "file": path.name,
            "jpeg": stored_jpeg,
            "picture_area": [ox, oy, cw, ch],
            "libraw_crop": [sz.crop_left_margin, sz.crop_top_margin, sz.crop_width, sz.crop_height],
            "whole": best_shift(ref, jpg, ox, oy, args.search),
        }
        q = 512
        corners = {}
        for name, (cy, cx) in {"tl": (0, 0), "tr": (0, w - q), "bl": (h - q, 0), "br": (h - q, w - q)}.items():
            sub = jpg[cy : cy + q, cx : cx + q]
            got = best_shift(ref, sub, ox + cx, oy + cy, args.search)
            corners[name] = [got[0][0], got[0][1] - cx, got[0][2] - cy] if got else None
        row["corners"] = corners
        print(json.dumps(row))
    return 0


if __name__ == "__main__":
    sys.exit(main())
