"""Compare our raw reader with a LibRaw build newer than rawpy's, through ``tools/libraw_dump.cpp``'s dump.

``tools/rw2_libraw_check.py`` reads LibRaw through rawpy, whose wheels bundle a release (0.28: LibRaw 0.22.2).
When that release refuses a file (2026-11-18: the Panasonic S1R II's 177 MP RW2, RawFormat 8 in 4 x 2 tiles), a
LibRaw git snapshot built by hand may read it. ``libraw_dump`` writes its ``raw_image`` (``OUT.u16``) and metadata
(``OUT.json``); this compares, the same way ``rw2_libraw_check.py`` does:

* every sensel of the stored sensor;
* the as-shot white balance (R/G, B/G) against ``cam_mul``;
* the black level at each CFA position, the CFA pattern, and the in-camera crop;
* the white level (reported, not gated).

Usage (from ``ventures/photo-editing``; build steps in ``tools/libraw_dump.cpp``)::

    ./libraw_dump FILE.RW2 /tmp/f.u16 > /tmp/f.json
    PYTHONPATH=src python3 tools/libraw_dump_check.py FILE.RW2 /tmp/f.u16 /tmp/f.json [--engines native,python]

Prints one JSON line and exits 1 if any sensel, the balance, the black level, the CFA or the crop differs.
Used on 2026-11-18: ``eval/panasonic-rw2-177mp-libraw-snapshot-2026-11-18.md``.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from shootflow import raw_develop as rd
from shootflow import rw2

CFA_NAMES = {0: "R", 1: "G", 2: "B", 3: "G"}


def check(path: Path, dump: Path, meta: dict, engines: list[str]) -> dict:
    import numpy as np

    out: dict = {"file": path.name, "libraw": meta.get("libraw"), "camera": f"{meta.get('make')} {meta.get('model')}"}
    w, h = meta["raw_width"], meta["raw_height"]
    ref = np.fromfile(dump, dtype="<u2")
    if ref.size != w * h:
        raise SystemExit(f"{dump}: {ref.size} sensels, metadata says {w} x {h}")
    ref = ref.reshape(h, w)
    data = path.read_bytes()
    for engine in engines:
        t = time.perf_counter()
        raw = rw2.parse_rw2(data, engine=engine)
        out[f"read_s_{engine}"] = round(time.perf_counter() - t, 2)
        ours = np.frombuffer(raw.values, dtype=np.uint16).reshape(raw.height, raw.width)
        if ours.shape != ref.shape:
            out[f"sensels_differing_{engine}"] = f"shape {list(ours.shape)} vs {list(ref.shape)}"
            continue
        diff = ours != ref
        out[f"sensels_differing_{engine}"] = int(diff.sum())
        if diff.any():
            ys, xs = np.nonzero(diff)
            out[f"first_difference_{engine}"] = [int(ys[0]), int(xs[0])]
    out["sensels"] = int(ref.size)
    out["storage"] = raw.notes[0] if raw.notes else ""
    e = raw.ifd.entries
    neutral = e.get(rd.TAG_AS_SHOT_NEUTRAL)
    cm = meta["cam_mul"]
    out["wb_ours"] = [round(1 / neutral[0], 4), round(1 / neutral[2], 4)] if neutral else None
    out["wb_libraw"] = [round(cm[0] / cm[1], 4), round(cm[2] / cm[1], 4)] if cm[1] else None
    wb_same = bool(neutral) and bool(cm[1]) and all(abs(1 / neutral[k] - cm[k] / cm[1]) < 1e-6 for k in (0, 2))
    out["cfa_ours"] = "".join(CFA_NAMES[p] for p in e[rd.TAG_CFA_PATTERN])
    out["cfa_libraw"] = "".join(CFA_NAMES[p] for p in meta["cfa"])
    out["black_ours"] = [int(b) for b in e[rd.TAG_BLACK_LEVEL]]
    out["black_libraw"] = [int(meta["black"] + meta["cblack"][p]) for p in meta["cfa"]]
    out["white_ours"], out["white_libraw"] = int(e[rd.TAG_WHITE_LEVEL][0]), int(meta["white"])
    out["crop_ours"] = list(e.get(rd.TAG_CROP_ORIGIN, ())) + list(e.get(rd.TAG_CROP_SIZE, ()))
    out["crop_libraw"] = list(meta["crop"])
    out["ok"] = (
        all(out.get(f"sensels_differing_{en}") == 0 for en in engines)
        and wb_same
        and out["cfa_ours"] == out["cfa_libraw"]
        and out["black_ours"] == out["black_libraw"]
        and out["crop_ours"] == out["crop_libraw"]
    )
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("file", type=Path)
    ap.add_argument("dump", type=Path, help="libraw_dump's OUT.u16")
    ap.add_argument("meta", type=Path, help="libraw_dump's JSON")
    ap.add_argument("--engines", default="native", help="comma-separated: native, python")
    args = ap.parse_args(argv)
    meta = json.loads(args.meta.read_text())
    if "error" in meta:
        print(json.dumps({"file": args.file.name, "libraw": meta.get("libraw"), "libraw_error": meta["error"], "ok": False}))
        return 1
    engines = [x.strip() for x in args.engines.split(",") if x.strip()]
    row = check(args.file, args.dump, meta, engines)
    print(json.dumps(row, sort_keys=True))
    return 0 if row["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
