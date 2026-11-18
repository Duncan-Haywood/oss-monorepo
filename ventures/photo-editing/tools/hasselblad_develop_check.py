"""Develop real 3FRs end to end with their own ColorMatrix1 and compare the average colour with LibRaw's render.

A 3FR carries a ColorMatrix1 in IFD0, so unlike the other makers' raws it develops with no ``.dcp``. This
develops each file at half size (one RGB pixel per 2x2 quad, no interpolation, to keep 100 MP frames in
memory) with the file's own matrix and as-shot neutral, and compares with
``rawpy.postprocess(use_camera_wb=True, no_auto_bright=True, output_bps=16, half_size=True, gamma=(1, 1))``:
the mean linear-light value per channel over the pixels unclipped in both (every channel under 0.95), and the
largest gap in chromaticity (r/(r+g+b), b/(r+g+b)) between the two means. The crops differ by a few
sensels (ours is the file's DefaultCrop, LibRaw's its own margins), so the two renders are cut to the
sensor area both cover, unrotated, before the pixels clipped in either are left out. The brightness
differs by LibRaw's scaling, so the gate is colour: the means' chromaticities within 0.02, as for the MRW check. ``--colour=dng,dcraw``
also develops with the dcraw colour method (the as-shot multipliers, then the matrix taken as D65 with no
chromatic adaptation: what LibRaw does), reported, not gated, to tell a reading fault from the colour model.

LibRaw's output is asked for in linear light because its default curve is BT.709 (power 2.222, slope 4.5),
not sRGB: undoing it with the sRGB curve, as the MRW check did, skews the channels by up to 0.03 in
chromaticity on dark frames (``eval/hasselblad-3fr-reader-2026-11-18.md``).

Usage (from ``ventures/photo-editing``)::

    PYTHONPATH=src /tmp/v/bin/python tools/hasselblad_develop_check.py [--colour=dng,dcraw] FILE.3FR [...]
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from shootflow import hasselblad
from shootflow import raw_develop as rd


def lin(v):
    import numpy as np

    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


def chroma(m):
    s = sum(m)
    return (m[0] / s, m[2] / s) if s else (0.0, 0.0)


def check(path: Path, colour: str = "dng") -> dict:
    import numpy as np
    import rawpy

    data = path.read_bytes()
    camera = hasselblad.camera_model(data)
    with rawpy.imread(str(path)) as lr:
        theirs = lr.postprocess(
            use_camera_wb=True, no_auto_bright=True, output_bps=16, user_flip=0, half_size=True, gamma=(1, 1)
        )
        left, top = lr.sizes.left_margin, lr.sizes.top_margin
    raw = hasselblad.parse_3fr(data)
    raw.ifd0.entries[rd.TAG_ORIENTATION] = (1,)  # LibRaw's render is unrotated (user_flip=0)
    t = time.perf_counter()
    w, h, rgb, report = rd.develop(raw, rd.DevelopSettings(half=True, colour=colour))
    secs = time.perf_counter() - t
    ours = lin(np.frombuffer(rgb, dtype=np.uint16).reshape(h, w, 3).astype(np.float32) / 65535)
    theirs = theirs.astype(np.float32) / 65535  # already linear: gamma=(1, 1)
    # The same sensor area in both: each crop's corner in sensor sensels, halved.
    x0, y0 = (raw.ifd.get(rd.TAG_CROP_ORIGIN) or (0, 0))[:2]
    dx, dy = (int(x0) - left) // 2, (int(y0) - top) // 2
    ox, oy, tx, ty = max(0, -dx), max(0, -dy), max(0, dx), max(0, dy)
    cw = min(w - ox, theirs.shape[1] - tx)
    ch = min(h - oy, theirs.shape[0] - ty)
    ours, theirs = ours[oy : oy + ch, ox : ox + cw], theirs[ty : ty + ch, tx : tx + cw]
    # Only pixels unclipped in both renders (0.95 linear, about 0.98 encoded): the two clip differently.
    keep = (ours.max(axis=2) < 0.95) & (theirs.max(axis=2) < 0.95)
    lo, lt = ours[keep], theirs[keep]
    m_ours = [float(lo[:, c].mean()) for c in range(3)]
    m_theirs = [float(lt[:, c].mean()) for c in range(3)]
    co, ct = chroma(m_ours), chroma(m_theirs)
    gap = max(abs(co[0] - ct[0]), abs(co[1] - ct[1]))
    return {
        "file": path.name,
        "camera": camera,
        "size": [w, h],
        "colour": colour,
        "matrix": report.matrix,
        "cct": report.cct,
        "profile": report.profile,
        "develop_s": round(secs, 2),
        "mean_ours": [round(v, 4) for v in m_ours],
        "mean_libraw": [round(v, 4) for v in m_theirs],
        "compared": [cw, ch],
        "unclipped_share": round(float(keep.mean()), 4),
        "chroma_gap": round(gap, 4),
        "ok": gap < 0.02,
    }


def main(argv=None) -> int:
    args = list(argv if argv is not None else sys.argv[1:])
    colours = ["dng"]
    if args and args[0].startswith("--colour="):
        colours = args.pop(0).split("=", 1)[1].split(",")
    bad = 0
    for name in args:
        for colour in colours:
            row = check(Path(name), colour)
            print(json.dumps(row), flush=True)
            bad += colour == "dng" and not row["ok"]
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
