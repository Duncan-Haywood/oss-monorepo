"""Check the Nikon NEF reader against LibRaw on real files.

For each NEF: read it with ``shootflow.nef.parse_nef`` (the C decoder and the
pure-Python reference with ``--engines native,python``), and compare with
LibRaw through ``rawpy``:

* every sensel of the stored sensor against LibRaw's ``raw_image``;
* the as-shot white balance (R/G, B/G) against ``camera_whitebalance``;
* the per-channel black level against ``black_level_per_channel``;
* the CFA pattern against ``raw_pattern``;
* the visible area (the ActiveArea ``masked_margins`` finds from the sensels)
  against LibRaw's ``sizes`` (left margin and width, which LibRaw takes from
  a per-model table).

Usage (from ``ventures/photo-editing``)::

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    PYTHONPATH=src /tmp/v/bin/python tools/nef_libraw_check.py FILE.NEF [...] [--engines native,python]

Rows LibRaw leaves undecoded under the bottom of its per-model height are left out of the sensel and visible-height gates and
reported as ``rows_libraw_leaves_undecoded`` (the Nikon 1 J5: 2 rows, which
carry picture; ``eval/nikon-nef-split-row-2026-11-15.md``).

Prints one JSON line per file and exits 1 if any sensel, the balance, the
black level, the CFA or the visible area differs (the white level is reported, not gated: LibRaw
takes some bodies' from a per-model table). Real files used on 2026-11-14: the
seven NEFs in drewnoakes/metadata-extractor-images (``nef/``),
``eval/nikon-nef-reader-2026-11-14.md``; visible area added 2026-11-15,
``eval/nikon-nef-visible-area-2026-11-15.md``.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from shootflow import nef
from shootflow import raw_develop as rd

CFA_NAMES = {0: "R", 1: "G", 2: "B", 3: "G"}


def check(path: Path, engines: list[str]) -> dict:
    import numpy as np
    import rawpy

    data = path.read_bytes()
    lib = rawpy.imread(str(path))
    ref = lib.raw_image.copy()
    sz = lib.sizes
    # LibRaw's Nikon loader decodes rows 0..height-1 only (its per-model height) and never writes the
    # rows under them (the Nikon 1 J5: 3,726 stored rows, 3,724 decoded; the rest is 0 in a fresh
    # process and leftover memory after other files). Those rows are left out of the sensel gate
    # and reported.
    skipped = max(0, ref.shape[0] - int(sz.top_margin) - int(sz.height))
    decoded = ref.shape[0] - skipped
    out_skip = skipped
    out: dict = {"file": path.name, "camera": nef.camera_model(data)}
    for engine in engines:
        t = time.perf_counter()
        raw = nef.parse_nef(data, engine=engine)
        out[f"read_s_{engine}"] = round(time.perf_counter() - t, 2)
        ours = np.frombuffer(raw.values, dtype=np.uint16).reshape(raw.height, raw.width)
        same_shape = ours.shape == ref.shape
        out[f"sensels_differing_{engine}"] = (
            int((ours[:decoded] != ref[:decoded]).sum()) if same_shape else "shape differs"
        )
    out["sensels"] = int(ref.size)
    out["storage"] = raw.notes[0] if raw.notes else ""
    e = raw.ifd.entries
    neutral = e.get(rd.TAG_AS_SHOT_NEUTRAL)
    ours_wb = [round(1 / neutral[0], 4), round(1 / neutral[2], 4)] if neutral else None
    cw = lib.camera_whitebalance
    lib_wb = [round(cw[0] / cw[1], 4), round(cw[2] / cw[1], 4)] if cw[1] else None
    out["wb_ours"], out["wb_libraw"] = ours_wb, lib_wb
    out["black_ours"] = [int(b) for b in e[rd.TAG_BLACK_LEVEL]]
    out["black_libraw"] = [int(b) for b in lib.black_level_per_channel]
    pat = e[rd.TAG_CFA_PATTERN]
    out["cfa_ours"] = "".join(CFA_NAMES[p] for p in pat)
    out["cfa_libraw"] = "".join(CFA_NAMES[int(p)] for p in lib.raw_pattern.ravel())
    top, left, bottom, right = (int(v) for v in e[rd.TAG_ACTIVE_AREA])
    out["visible_ours"] = [left, right - left, bottom - top]
    out["visible_libraw"] = [int(sz.left_margin), int(sz.width), int(sz.height)]
    out["rows_libraw_leaves_undecoded"] = out_skip
    vis_lib = [int(sz.left_margin), int(sz.width), int(sz.height) + out_skip]
    out["white_ours"], out["white_libraw"] = int(e[rd.TAG_WHITE_LEVEL][0]), int(lib.white_level)
    out["ok"] = (
        all(out[f"sensels_differing_{en}"] == 0 for en in engines)
        and ours_wb == lib_wb
        and out["black_ours"] == out["black_libraw"]
        and out["cfa_ours"] == out["cfa_libraw"]
        and out["visible_ours"] == vis_lib
    )
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--engines", default="native", help="comma-separated: native, python")
    args = ap.parse_args(argv)
    engines = [e.strip() for e in args.engines.split(",") if e.strip()]
    bad = 0
    for path in args.files:
        row = check(path, engines)
        bad += not row["ok"]
        print(json.dumps(row, sort_keys=True))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
