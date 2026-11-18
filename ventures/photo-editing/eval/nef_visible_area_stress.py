"""Stress masked_margins on picture-only crops and darkened copies (eval/nikon-nef-visible-area-2026-11-15.md).

Usage: PYTHONPATH=src python eval/nef_visible_area_stress.py DIR [MORE.NEF ...]
(DIR holds mei/nef/Nikon*.nef; needs numpy; further files from raw.pixls.us were added on 2026-11-15,
eval/nikon-nef-split-row-2026-11-15.md)
"""

import glob
import sys
from array import array

import numpy as np

from shootflow import nef
from shootflow import raw_develop as rd

root = sys.argv[1]
print("file | crop | stops under | found (left, right)")
for path in sorted(glob.glob(root + "/mei/nef/Nikon*.nef")) + sys.argv[2:]:
    raw = nef.parse_nef(open(path, "rb").read())
    _, left, _, right = raw.ifd.entries[rd.TAG_ACTIVE_AREA]
    full = np.frombuffer(raw.values, dtype=np.uint16).reshape(raw.height, raw.width)
    black = float(raw.ifd.entries[rd.TAG_BLACK_LEVEL][0])
    pic = full[:, left:right].astype(float)
    for stops in (0, 3, 6):
        for name, frame in (("picture only", pic), ("stored", full.astype(float))):
            a = np.clip(np.round(black + (frame - black) / (2**stops)), 0, 65535).astype(np.uint16)
            h, w = a.shape
            res = nef.masked_margins(array("H", a.tobytes()), w, h, 16383)
            print(path.split("/")[-1], "|", name, "|", stops, "|", res)
