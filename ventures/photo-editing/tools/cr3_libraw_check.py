"""Check the Canon CR3 reader against LibRaw on real files.

For each CR3: read it with ``shootflow.cr3.parse_cr3`` (the C decoder and the
pure-Python reference with ``--engines c,python``), and compare with LibRaw
through ``rawpy``:

* every sensel of the stored sensor against LibRaw's ``raw_image``;
* the as-shot white balance (R/G, B/G) against ``camera_whitebalance``;
* the black level at each CFA position against ``black_level_per_channel``
  (gated within 1: ShootFlow measures the optical-black columns, LibRaw reads a
  stated level);
* the CFA pattern at the crop's origin against ``raw_pattern``.

The crop is reported, not gated: ShootFlow uses SensorInfo (the same rectangle
as IAD1's crop), LibRaw a wider visible area. C-RAW (wavelet) files are read
since 2026-11-15 (``eval/canon-cr3-craw-2026-11-15.md``); a file the reader
refuses (several tiles) is reported as refused and does not fail the run.

Usage (from ``ventures/photo-editing``)::

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    PYTHONPATH=src /tmp/v/bin/python tools/cr3_libraw_check.py FILE.CR3 [...] [--engines c,python]

Prints one JSON line per file and exits 1 if any read file's sensels, balance,
black level or CFA differ. Real files used on 2026-11-15: the five CR3s in
drewnoakes/metadata-extractor-images (``cr3/``),
``eval/canon-cr3-reader-2026-11-15.md``.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from shootflow import cr3
from shootflow import raw_develop as rd

CFA_NAMES = {0: "R", 1: "G", 2: "B", 3: "G"}


def check(path: Path, engines: list[str]) -> dict:
    import numpy as np
    import rawpy

    data = path.read_bytes()
    lib = rawpy.imread(str(path))
    ref = lib.raw_image
    out: dict = {"file": path.name, "camera": cr3.camera_model(data)}
    head = cr3.Container(data).head
    out["cmp1"] = {"version": hex(head.version), "levels": head.levels, "bits": head.bits, "size": [head.width, head.height],
                   "tile": [head.tile_width, head.tile_height]}
    cd = cr3.colour_data(data, cr3.Container(data))
    out["colordata_len"] = len(cd) if cd else None
    out["colordata_version"] = int(cd[0]) if cd else None
    bl = [int(v) for v in lib.black_level_per_channel]
    # Where ColorData stores LibRaw's per-channel black as R, G, G, B (LibRaw's order is R, G, B, G2): the
    # index a new ColorData length needs in cr3._BLACK_INDEX (eval/canon-cr3-r5-real-2026-11-18.md).
    want = (bl[0], bl[1], bl[3], bl[2])
    out["black_index_found"] = [hex(i) for i in range(len(cd) - 3) if tuple(cd[i : i + 4]) == want] if cd else None
    raw = None
    for engine in engines:
        t = time.perf_counter()
        try:
            raw = cr3.parse_cr3(data, engine=engine)
        except rd.DevelopError as exc:
            out["refused"] = str(exc)
            out["ok"] = None
            return out
        out[f"read_s_{engine}"] = round(time.perf_counter() - t, 2)
        ours = np.frombuffer(raw.values, dtype=np.uint16).reshape(raw.height, raw.width)
        same_shape = ours.shape == ref.shape
        out[f"sensels_differing_{engine}"] = int((ours != ref).sum()) if same_shape else "shape differs"
    assert raw is not None
    out["sensels"] = int(ref.size)
    e = raw.ifd.entries
    neutral = e.get(rd.TAG_AS_SHOT_NEUTRAL)
    cw = lib.camera_whitebalance
    out["wb_ours"] = [round(1 / neutral[0], 4), round(1 / neutral[2], 4)] if neutral else None
    out["wb_libraw"] = [round(cw[0] / cw[1], 4), round(cw[2] / cw[1], 4)] if cw[1] else None
    wb_same = bool(neutral) and bool(cw[1]) and all(abs(1 / neutral[k] - cw[k] / cw[1]) < 1e-6 for k in (0, 2))
    top, left, bottom, right = (int(v) for v in e[rd.TAG_ACTIVE_AREA])
    sz = lib.sizes
    pattern = lib.raw_pattern
    # LibRaw's pattern is relative to its visible origin (top_margin, left_margin); turn it to the crop's origin.
    at_crop = [int(pattern[(top + y - sz.top_margin) % 2][(left + x - sz.left_margin) % 2]) for y in (0, 1) for x in (0, 1)]
    out["black_ours"] = [int(b) for b in e[rd.TAG_BLACK_LEVEL]]
    out["black_libraw"] = [int(lib.black_level_per_channel[p]) for p in at_crop]
    out["cfa_ours"] = "".join(CFA_NAMES[p] for p in e[rd.TAG_CFA_PATTERN])
    out["cfa_libraw"] = "".join(CFA_NAMES[p] for p in at_crop)
    out["white_ours"], out["white_libraw"] = int(e[rd.TAG_WHITE_LEVEL][0]), int(lib.white_level)
    out["crop_ours"] = [left, top, right - left, bottom - top]
    out["crop_libraw"] = [sz.left_margin, sz.top_margin, sz.width, sz.height]
    out["notes"] = [n for n in raw.notes if not n.startswith("CR3: CFA ")]
    out["ok"] = (
        all(out[f"sensels_differing_{en}"] == 0 for en in engines)
        and wb_same
        and all(abs(a - b) <= 1 for a, b in zip(out["black_ours"], out["black_libraw"]))
        and out["cfa_ours"] == out["cfa_libraw"]
    )
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--engines", default="c", help="comma-separated: c, python")
    args = ap.parse_args(argv)
    engines = [e.strip() for e in args.engines.split(",") if e.strip()]
    bad = 0
    for path in args.files:
        row = check(path, engines)
        bad += row["ok"] is False
        print(json.dumps(row, sort_keys=True))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
