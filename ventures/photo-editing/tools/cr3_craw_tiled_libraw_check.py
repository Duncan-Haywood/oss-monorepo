"""Check the tiled C-RAW reader against LibRaw, using a real one-tile C-RAW CR3 re-stored as tiles.

No public C-RAW CR3 with several tiles could be fetched (raw.pixls.us refuses this container's proxy; the
metadata-extractor-images files are all one tile). So, as ``tools/cr3_tiled_libraw_check.py`` did for the
full-quality setting, this tool makes tiled files from a real one and asks LibRaw to read them:

1. read a real one-tile C-RAW CR3 with ``shootflow.cr3`` and check its sensels equal LibRaw's
   ``raw_image`` (the baseline);
2. re-code those sensels as a tiled C-RAW sample for each tile size given (``tests/craw_tiled.py``: each
   tile its own 5/3 decomposition from the real sensels around it, its subbands cut to the tile plus the
   edge coefficients ``cr3_wavelet.tile_geometry`` says a neighbour lends);
3. splice it into a copy of the real file (``cr3_tiled_libraw_check.splice``) and decode the copy with
   LibRaw (rawpy) and with ``shootflow.cr3`` (C, and Python with ``--engines c,python``).

Two codings per tile size:

* ``lossless``: every step 1 (QP 0, multiplier 0, base 1). The 5/3 is reversible, so both readers must give
  back the original sensels: this checks the band sizes, the edge coefficients and the inverse at the seams.
* ``quantised`` (``--quantised``): the original file's own step multipliers and bases and its QP grid,
  each tile taking the window of it under the tile; coefficients divided by their step. The readers then
  return a lossy picture, and must return the same one: this checks which step each borrowed edge
  coefficient takes.

LibRaw is an independent reader, but both the file and its layout come from this repository's reading of
LibRaw's ``crx.cpp``, not from a Canon body; a real tiled C-RAW (R5 class) remains the stronger test.

Usage (from ``ventures/photo-editing``)::

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    PYTHONPATH=src:tests:tools /tmp/v/bin/python tools/cr3_craw_tiled_libraw_check.py FILE.CR3 \
        --tiles 3096x4120,2048x2000 [--quantised] [--engines c,python]

``--tiles`` takes WIDTHxHEIGHT in sensor sensels (even; each plane tile, and the remainder, at least 22).
Prints one JSON line per layout and coding; exits 1 if any fails.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from shootflow import cr3
from shootflow import cr3_wavelet as cw


def _encode(job):
    import craw_tiled

    region = job[0].tolist()
    return craw_tiled.encode_tile_plane((region,) + tuple(job[1:]))


def tiled_jobs(planes, tile, levels: int, margin: int, qp, mults):
    """``craw_tiled.tiled_jobs`` with numpy planes (regions sliced here, turned to lists in the worker)."""

    ph, pw = planes[0].shape
    tw, th = tile
    cols, rows = -(-pw // tw), -(-ph // th)
    jobs, tiles = [], []
    for r in range(rows):
        for c in range(cols):
            x, y = c * tw, r * th
            w_, h_ = min(tw, pw - x), min(th, ph - y)
            flags = (cw.RIGHT if c < cols - 1 else 0) | (cw.LEFT if c else 0) | (cw.BOTTOM if r < rows - 1 else 0) | (
                cw.TOP if r else 0)
            ml = min(x, margin) if flags & cw.LEFT else 0
            mr = min(pw - x - w_, margin) if flags & cw.RIGHT else 0
            mt = min(y, margin) if flags & cw.TOP else 0
            mb = min(ph - y - h_, margin) if flags & cw.BOTTOM else 0
            grid = qp(y, x, w_, h_) if qp else None
            tiles.append((len(tiles), y, x, w_, h_, flags, grid))
            for plane in planes:
                region = plane[y - mt : y + h_ + mb, x - ml : x + w_ + mr]
                jobs.append((region, -ml, -mt, w_, h_, levels, flags, grid, mults))
    return jobs, tiles


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--tiles", required=True, help="comma-separated WIDTHxHEIGHT tile sizes, sensor sensels")
    ap.add_argument("--engines", default="c")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--margin", type=int, default=48, help="real sensels kept around each tile for its decomposition")
    ap.add_argument("--quantised", action="store_true", help="also code with the file's own steps (readers must agree)")
    ap.add_argument("--no-lossless", action="store_true")
    ap.add_argument("--keep", type=Path, help="folder to keep the tiled files in")
    args = ap.parse_args(argv)
    import numpy as np
    import rawpy

    import craw_tiled
    from cr3_tiled_libraw_check import splice

    layouts = [tuple(int(v) for v in t.lower().split("x")) for t in args.tiles.split(",")]
    engines = args.engines.split(",")
    codings = ([] if args.no_lossless else ["lossless"]) + (["quantised"] if args.quantised else [])
    failed = False
    tmpdir = args.keep or Path("/tmp")
    tmpdir.mkdir(parents=True, exist_ok=True)
    for path in args.files:
        data = path.read_bytes()
        box = cr3.Container(data)
        head, values = cr3.decode_sensor(data, box, engine="c")
        if not head.levels or head.tile_width != head.width:
            print(json.dumps({"file": path.name, "skipped": "not a one-tile C-RAW CR3"}))
            continue
        original = np.frombuffer(values, dtype=np.uint16).reshape(head.height, head.width)
        with rawpy.imread(str(path)) as raw:
            baseline = int((raw.raw_image != original).sum())
        print(json.dumps({"file": path.name, "layout": "original (1 tile)", "size": [head.width, head.height],
                          "levels": head.levels, "libraw_differ": baseline}), flush=True)
        failed |= baseline != 0
        mid = 1 << (head.bits - 1)
        planes = [original[p >> 1 :: 2, p & 1 :: 2].astype(np.int64) - mid for p in range(4)]
        sample = data[box.raw.offset : box.raw.offset + box.raw.size]
        layout = cw.read_layout(sample, head.header_size, head.levels, head.planes, head.width // 2, head.height // 2)
        grid0 = cw.qp_grid(sample[layout.qp_offset : layout.qp_offset + layout.qp_size], layout.width, layout.height)
        file_mults = [(b.mult, b.base) for b in layout.planes[0].bands]

        def window(y, x, w_, h_):
            rows_, cols_ = len(grid0), len(grid0[0])
            return [[grid0[min(y // 2 + r, rows_ - 1)][min(x // 8 + c, cols_ - 1)] for c in range((w_ + 7) // 8)]
                    for r in range((h_ + 1) // 2)]

        for tile in layouts:
            for coding in codings:
                row = {"file": path.name, "tile": list(tile), "coding": coding}
                qp = window if coding == "quantised" else None
                mults = file_mults if coding == "quantised" else [(0, 1)] * (3 * head.levels + 1)
                t0 = time.time()
                jobs, tiles = tiled_jobs(planes, (tile[0] // 2, tile[1] // 2), head.levels, args.margin, qp, mults)
                with ProcessPoolExecutor(args.workers) as pool:
                    coded = list(pool.map(_encode, jobs, chunksize=1))
                tiled, header_size = craw_tiled.assemble(coded, tiles, head.levels, mults)
                spliced = splice(data, box, tiled, header_size, tile)
                sbox = cr3.Container(spliced)
                grid = cr3.tile_grid(sbox.head)
                row["grid"] = [len({t.col for t in grid}), len({t.row for t in grid})]
                row["tiles_plane_wh"] = sorted({(t.width, t.height) for t in grid})
                row["encode_s"] = round(time.time() - t0, 1)
                row["bytes"] = len(tiled)
                tmp = tmpdir / f"{path.stem}_craw_tiled_{coding}_{tile[0]}x{tile[1]}.CR3"
                tmp.write_bytes(spliced)
                lib = None
                try:
                    with rawpy.imread(str(tmp)) as raw:
                        lib = raw.raw_image.copy()
                    row["libraw_vs_original"] = int((lib != original).sum())
                except Exception as exc:  # LibRaw refusing the file is a failure of the layout
                    row["libraw_error"] = str(exc)
                ok = lib is not None
                for engine in engines:
                    t1 = time.time()
                    try:
                        _h, got = cr3.decode_sensor(spliced, sbox, engine=engine)
                    except Exception as exc:
                        row[f"ours_{engine}_error"] = str(exc)
                        ok = False
                        continue
                    ours = np.frombuffer(got, dtype=np.uint16).reshape(original.shape)
                    row[f"ours_{engine}_s"] = round(time.time() - t1, 2)
                    row[f"ours_{engine}_vs_original"] = int((ours != original).sum())
                    if lib is not None:
                        row[f"ours_{engine}_vs_libraw"] = int((ours != lib).sum())
                        ok &= row[f"ours_{engine}_vs_libraw"] == 0
                    if coding == "lossless":
                        ok &= row[f"ours_{engine}_vs_original"] == 0
                if lib is not None and coding == "quantised":
                    d = lib.astype(np.int64) - original
                    row["libraw_vs_original_rms"] = round(float(np.sqrt((d * d).mean())), 2)
                if lib is not None and coding == "lossless":
                    ok &= row["libraw_vs_original"] == 0
                row["ok"] = bool(ok)
                failed |= not ok
                print(json.dumps(row), flush=True)
                if not args.keep:
                    tmp.unlink()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
