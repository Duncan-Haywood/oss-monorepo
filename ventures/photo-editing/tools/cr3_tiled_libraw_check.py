"""Check the tiled CR3 reader against LibRaw, using a real full-quality CR3 re-stored as tiles.

No public CR3 with several tiles could be fetched (raw.pixls.us refuses this container's proxy; the
metadata-extractor-images files are all one tile). Bodies with wide sensors (the R5 class) store the
sensor as tiles side by side, so this tool makes such files from a real one and asks LibRaw to read them:

1. read a real one-tile, full-quality (lossless) CR3 with ``shootflow.cr3`` and check its sensels equal
   LibRaw's ``raw_image`` (the baseline);
2. re-encode the same sensels as a tiled sample for each tile size given (the lossless CRX coder in
   ``tests/test_cr3.py``, laid out as LibRaw's ``crxReadImageHeaders`` reads it: per tile a 0xFF01 header
   with its index, per plane 0xFF02 and 0xFF03, the data tile after tile and plane after plane);
3. splice that sample into a copy of the real file (appended inside the final ``mdat``, the raw track's
   ``co64`` and ``stsz`` and CMP1's tile size, several-tiles flags and header size patched) and decode the
   copy with LibRaw (rawpy) and with ``shootflow.cr3`` (C and, with ``--engines c,python``, Python).

LibRaw is an independent reader: if it returns the original sensels from our tiled file, our tile layout is
the one LibRaw expects, and if our reader returns them too, our reader reads that layout. The weak point
is stated plainly: both the file and its layout come from this repository's reading of LibRaw, not from a
Canon body, so a real R5 file remains the stronger test.

Usage (from ``ventures/photo-editing``)::

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    PYTHONPATH=src:tests /tmp/v/bin/python tools/cr3_tiled_libraw_check.py FILE.CR3 \
        --tiles 3200x4500,2048x2048,4096x4500 [--engines c,python]

``--tiles`` takes WIDTHxHEIGHT in sensor sensels (even; each tile, and the remainder, at least 44). Prints one
JSON line per layout and exits 1 if any layout's sensels differ from the original, on either reader.
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from shootflow import cr3


def _encode(job):
    from test_cr3 import encode_band

    return encode_band(job)


def tiled_sample(values, width: int, height: int, tile: tuple[int, int], mid: int, workers: int,
                 order: str = "rows") -> tuple[bytes, int]:
    """``order="columns"`` writes the tiles column by column (a deliberately wrong layout, the control)."""

    pw, ph = width // 2, height // 2
    tw, th = tile[0] // 2, tile[1] // 2
    cols, rows = -(-pw // tw), -(-ph // th)
    jobs, shapes = [], []
    cells = [(r, c) for r in range(rows) for c in range(cols)]
    if order == "columns":
        cells = [(r, c) for c in range(cols) for r in range(rows)]
    for r, c in cells:
        if True:
            x0, y0 = c * tw, r * th
            w_, h_ = min(tw, pw - x0), min(th, ph - y0)
            shapes.append((w_, h_))
            for plane in range(4):
                oy, ox = plane >> 1, plane & 1
                jobs.append([[values[(2 * (y0 + y) + oy) * width + 2 * x0 + ox + 2 * x] - mid for x in range(w_)]
                             for y in range(h_)])
    with ProcessPoolExecutor(workers) as pool:
        coded = list(pool.map(_encode, jobs, chunksize=1))
    header, data = b"", b""
    for index in range(len(shapes)):
        bands = coded[4 * index : 4 * index + 4]
        header += struct.pack(">HHIHH", 0xFF01, 8, sum(len(b) for b in bands), index, 0)
        for plane, band in enumerate(bands):
            header += struct.pack(">HHII", 0xFF02, 8, len(band), 0x08000000 | (plane << 28))
            header += struct.pack(">HHII", 0xFF03, 8, len(band), 0)
        data += b"".join(bands)
    header += bytes(4)
    return header + data, len(header)


def _find(data: bytes, start: int, end: int, path: list[bytes]):
    for kind, pos, head, size in cr3._boxes(data, start, end):
        if kind == path[0]:
            if len(path) == 1:
                return pos, head, size
            found = _find(data, pos + head, pos + size, path[1:])
            if found:
                return found
    return None


def splice(data: bytes, box: cr3.Container, sample: bytes, header_size: int, tile: tuple[int, int]) -> bytes:
    """A copy of ``data`` whose full-size raw track points at ``sample`` (appended in the final mdat)."""

    out = bytearray(data)
    boxes = list(cr3._boxes(data, 0, len(data)))
    kind, pos, head, size = boxes[-1]
    if kind != b"mdat" or pos + size != len(data):
        raise SystemExit("the file does not end with its mdat box; cannot append the tiled sample")
    new_at = len(out)
    out += sample
    if head == 16:
        struct.pack_into(">Q", out, pos + 8, size + len(sample))
    else:
        if size + len(sample) >= 1 << 32:
            raise SystemExit("mdat would outgrow a 32-bit size")
        struct.pack_into(">I", out, pos, size + len(sample))
    moov = cr3._child(data, 0, len(data), b"moov")
    target = box.raw
    for kind, tpos, thead, tsize in cr3._boxes(data, *moov):
        if kind != b"trak":
            continue
        t = cr3._track(data, tpos + thead, tpos + tsize)
        if t is None or t.cmp1 != target.cmp1 or t.offset != target.offset:
            continue
        stbl = _find(data, tpos + thead, tpos + tsize, [b"mdia", b"minf", b"stbl"])
        s0, s1 = stbl[0] + stbl[1], stbl[0] + stbl[2]
        co = cr3._child(data, s0, s1, b"co64")
        sz = cr3._child(data, s0, s1, b"stsz")
        struct.pack_into(">Q", out, co[0] + 8, new_at)
        fixed, count = struct.unpack_from(">II", data, sz[0] + 4)
        struct.pack_into(">I", out, sz[0] + 4 if fixed else sz[0] + 12, len(sample))
        cmp1 = data.index(target.cmp1, tpos, tpos + tsize)
        struct.pack_into(">II", out, cmp1 + 16, tile[0], tile[1])
        out[cmp1 + 27] = (out[cmp1 + 27] & 0x3F) | (0x80 if tile[0] < box.head.width else 0) | (
            0x40 if tile[1] < box.head.height else 0)
        struct.pack_into(">I", out, cmp1 + 28, header_size)
        return bytes(out)
    raise SystemExit("could not find the raw track to patch")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--tiles", required=True, help="comma-separated WIDTHxHEIGHT tile sizes, sensor sensels")
    ap.add_argument("--engines", default="c")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--keep", type=Path, help="folder to keep the tiled files in")
    ap.add_argument("--control", action="store_true",
                    help="also write each layout's tiles column by column (wrong): LibRaw and ours must then differ")
    args = ap.parse_args(argv)
    import numpy as np
    import rawpy

    layouts = [tuple(int(v) for v in t.lower().split("x")) for t in args.tiles.split(",")]
    engines = args.engines.split(",")
    failed = False
    for path in args.files:
        data = path.read_bytes()
        box = cr3.Container(data)
        head, values = cr3.decode_sensor(data, box, engine="c")
        if head.levels or head.tile_width != head.width:
            print(json.dumps({"file": path.name, "skipped": "not a one-tile full-quality CR3"}))
            continue
        original = np.frombuffer(values, dtype=np.uint16).reshape(head.height, head.width)
        with rawpy.imread(str(path)) as raw:
            baseline = int((raw.raw_image != original).sum())
        print(json.dumps({"file": path.name, "layout": "original (1 tile)", "size": [head.width, head.height],
                          "libraw_differ": baseline}), flush=True)
        failed |= baseline != 0
        mid = 1 << (head.bits - 1)
        for tile in layouts:
            row = {"file": path.name, "tile": list(tile)}
            t0 = time.time()
            sample, header_size = tiled_sample(values, head.width, head.height, tile, mid, args.workers)
            spliced = splice(data, box, sample, header_size, tile)
            sbox = cr3.Container(spliced)
            grid = cr3.tile_grid(sbox.head)
            row["grid"] = [max(t.col for t in grid) // grid[0].width + 1, max(t.row for t in grid) // grid[0].height + 1]
            row["tiles_plane_wh"] = sorted({(t.width, t.height) for t in grid})
            row["encode_s"] = round(time.time() - t0, 1)
            if args.keep:
                args.keep.mkdir(parents=True, exist_ok=True)
                (args.keep / f"{path.stem}_tiled_{tile[0]}x{tile[1]}.CR3").write_bytes(spliced)
            tmp = Path(f"/tmp/_cr3_tiled_{tile[0]}x{tile[1]}.CR3") if not args.keep else (
                args.keep / f"{path.stem}_tiled_{tile[0]}x{tile[1]}.CR3")
            tmp.write_bytes(spliced)
            try:
                with rawpy.imread(str(tmp)) as raw:
                    row["libraw_differ"] = int((raw.raw_image != original).sum())
            except Exception as exc:  # LibRaw refusing the file is a failure of the layout
                row["libraw_error"] = str(exc)
                row["libraw_differ"] = None
            for engine in engines:
                t1 = time.time()
                _h, got = cr3.decode_sensor(spliced, sbox, engine=engine)
                row[f"ours_{engine}_differ"] = int((np.frombuffer(got, dtype=np.uint16).reshape(original.shape) != original).sum())
                row[f"ours_{engine}_s"] = round(time.time() - t1, 2)
            if not args.keep:
                tmp.unlink()
            ok = row["libraw_differ"] == 0 and all(row[f"ours_{e}_differ"] == 0 for e in engines)
            row["ok"] = ok
            failed |= not ok
            print(json.dumps(row), flush=True)
            if args.control:
                bad, bad_size = tiled_sample(values, head.width, head.height, tile, mid, args.workers, order="columns")
                spliced = splice(data, box, bad, bad_size, tile)
                tmp.write_bytes(spliced)
                ctl = {"file": path.name, "tile": list(tile), "control": "tiles written column by column"}
                try:
                    with rawpy.imread(str(tmp)) as raw:
                        ctl["libraw_differ"] = int((raw.raw_image != original).sum())
                except Exception as exc:
                    ctl["libraw_error"] = str(exc)
                try:
                    _h, got = cr3.decode_sensor(spliced, cr3.Container(spliced), engine="c")
                    ctl["ours_c_differ"] = int((np.frombuffer(got, dtype=np.uint16).reshape(original.shape) != original).sum())
                except Exception as exc:
                    ctl["ours_error"] = str(exc)
                caught = ctl.get("libraw_differ", 1) != 0 and ctl.get("ours_c_differ", 1) != 0
                ctl["caught"] = caught
                failed |= not caught
                print(json.dumps(ctl), flush=True)
                if not args.keep:
                    tmp.unlink()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
