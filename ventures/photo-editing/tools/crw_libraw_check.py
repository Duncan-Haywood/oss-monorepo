"""Check the Canon CRW reader against LibRaw on real files.

For each CRW: read it with ``shootflow.crw.parse_crw`` and compare with LibRaw through ``rawpy``:

* every sensel of the stored sensor against LibRaw's ``raw_image`` (gated);
* the CFA pattern at the picture's corner against ``raw_pattern`` (gated; LibRaw's margins and
  SensorInfo's picture corner are both even on every body checked, so the two corners share a phase);
* the as-shot white balance (R/G, B/G) against ``camera_whitebalance`` (gated: equal when LibRaw has
  one, and none from us when LibRaw has none, i.e. its first value is -1 or 0);
* the black level per 2x2 position against ``black_level_per_channel`` (gated within 2: ours is the
  median of the masked columns left of the picture, LibRaw's the mean of the left and right ones).

Reported, not gated: the white level (ours is the clip pile when the frame has one, else the stream's
full scale; LibRaw takes 4,000 for the EOS bodies from a per-model table) and the picture area (ours is
SensorInfo's, LibRaw's from a per-model table).

Usage (from ``ventures/photo-editing``)::

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    PYTHONPATH=src /tmp/v/bin/python tools/crw_libraw_check.py FILE.CRW [...]

Prints one JSON line per file and exits 1 if anything gated differs. Files refused with a reason
(the cyan-magenta-yellow-green bodies) print that reason and do not fail the run. Real files used on
2026-11-16: raw.pixls.us (``data/Canon/<body>/``) and drewnoakes/metadata-extractor-images (``crw/``),
``eval/canon-crw-reader-2026-11-16.md``.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from shootflow import crw
from shootflow import raw_develop as rd

CFA_NAMES = {0: "R", 1: "G", 2: "B", 3: "G"}


def check(path: Path) -> dict:
    import numpy as np
    import rawpy

    data = path.read_bytes()
    out: dict = {"file": path.name, "camera": crw.camera_model(data)}
    t = time.perf_counter()
    try:
        raw = crw.parse_crw(data)
    except rd.DevelopError as exc:
        out["refused"] = str(exc)
        out["ok"] = True
        return out
    out["read_s"] = round(time.perf_counter() - t, 2)
    lib = rawpy.imread(str(path))
    ref = lib.raw_image
    ours = np.frombuffer(raw.values, dtype=np.uint16).reshape(raw.height, raw.width)
    out["sensels"] = int(ref.size)
    out["sensels_differing"] = int((ours != ref).sum()) if ours.shape == ref.shape else "shape differs"
    out["storage"] = raw.notes[0]
    e = raw.ifd.entries
    out["cfa_ours"] = "".join(CFA_NAMES[p] for p in e[rd.TAG_CFA_PATTERN])
    out["cfa_libraw"] = "".join(CFA_NAMES[int(p)] for p in lib.raw_pattern.ravel())
    neutral = e.get(rd.TAG_AS_SHOT_NEUTRAL)
    cw = list(lib.camera_whitebalance)
    lib_has = cw[0] > 0 and cw[1] > 0 and cw[2] > 0
    out["wb_ours"] = [round(1 / neutral[0], 4), round(1 / neutral[2], 4)] if neutral else None
    out["wb_libraw"] = [round(cw[0] / cw[1], 4), round(cw[2] / cw[1], 4)] if lib_has else None
    if lib_has and neutral:
        # LibRaw scales by G1 alone; we by the mean of the two greens: allow that difference.
        g_mean = (cw[1] + cw[3]) / 2 if cw[3] > 0 else cw[1]
        wb_ok = all(abs(1 / neutral[k] - cw[k] / g_mean) < 1e-4 for k in (0, 2))
    else:
        wb_ok = (not lib_has) and not neutral
    top, left, bottom, right = e[rd.TAG_ACTIVE_AREA]
    out["black_ours"] = [round(float(b), 1) for b in e[rd.TAG_BLACK_LEVEL]]
    pat = lib.raw_pattern
    out["black_libraw"] = [int(lib.black_level_per_channel[int(pat[(top + y) % 2, (left + x) % 2])]) for y in (0, 1) for x in (0, 1)]
    black_ok = all(abs(a - b) <= 2 for a, b in zip(out["black_ours"], out["black_libraw"]))
    out["white_ours"], out["white_libraw"] = int(e[rd.TAG_WHITE_LEVEL][0]), int(lib.white_level)
    sz = lib.sizes
    out["picture_ours"] = [left, top, right - left, bottom - top]
    out["picture_libraw"] = [sz.left_margin, sz.top_margin, sz.width, sz.height]
    out["ok"] = out["sensels_differing"] == 0 and out["cfa_ours"] == out["cfa_libraw"] and wb_ok and black_ok
    out["wb_ok"], out["black_ok"] = wb_ok, black_ok
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("files", nargs="+", type=Path)
    args = ap.parse_args(argv)
    bad = 0
    for path in args.files:
        row = check(path)
        bad += not row["ok"]
        print(json.dumps(row, sort_keys=True), flush=True)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
