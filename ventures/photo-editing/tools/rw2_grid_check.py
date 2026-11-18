"""Check a RawFormat 8 RW2's tiles without LibRaw: seams and the camera's own preview.

LibRaw 0.22.2 cannot open the S1R II's 177 MP high-resolution frames (4 x 2 tiles, the only real
grid with a second row of tiles; eval/panasonic-rw2-format8-grid-2026-11-18.md), so these two checks
stand in for a sensel-by-sensel comparison:

* **seams**: at every tile edge, the mean step between same-colour sensels that straddle it
  (two columns or two rows apart), divided by the median of the same step at the 32 positions on
  either side. A correctly placed and decoded tile gives about 1; a misplaced, shifted or
  mis-predicted tile gives a jump.
* **preview**: each tile's sensels, binned to the embedded JPEG's size (tag 0x2E), against the
  JPEG's luma over the same area (Spearman's rank correlation of green against luma, so the
  camera's tone curve and clipping do not count against it). A tile decoded
  from the wrong stream or the wrong place loses its correlation.

``--swap`` exchanges two equal-sized blocks of the decoded frame first: the negative control,
to show that both checks see a wrong tile.

Usage (from ``ventures/photo-editing``, with numpy and Pillow)::

    PYTHONPATH=src python tools/rw2_grid_check.py FILE.RW2 [...] [--swap]

Prints one JSON line per file.
"""

from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path

from shootflow import rw2

WINDOW = 32


def seam_ratio(steps, at: int) -> float:
    """``steps[i]`` is the mean step between positions i and i + 2. The seam at ``at`` is crossed by
    steps at at - 2 and at - 1; compare them with the median step in a window either side."""

    import numpy as np

    lo, hi = max(0, at - 2 - WINDOW), min(len(steps), at + WINDOW)
    near = [steps[i] for i in range(lo, hi) if i not in (at - 2, at - 1)]
    base = float(np.median(near))
    return round(float(max(steps[at - 2], steps[at - 1])) / base, 3) if base else float("inf")


def check(path: Path, swap: bool) -> dict:
    import numpy as np
    from PIL import Image

    data = path.read_bytes()
    raw = rw2.parse_rw2(data)
    img = np.frombuffer(raw.values, dtype=np.uint16).reshape(raw.height, raw.width).astype(np.float64)
    _, ifds = rw2._ifds(data)
    p = rw2.C8Params(ifds[0], raw.width, raw.height, len(data))
    tiles = [(left, top, w, h) for _, _, left, top, w, h in p.tiles]
    if swap:
        # Exchange the top-left quarter of the first tile with the same block of the last.
        l0, t0, w0, h0 = tiles[0]
        l1, t1, w1, h1 = tiles[-1]
        bw, bh = min(w0, w1) // 2 // 2 * 2, min(h0, h1) // 2 // 2 * 2
        a = img[t0 : t0 + bh, l0 : l0 + bw].copy()
        img[t0 : t0 + bh, l0 : l0 + bw] = img[t1 : t1 + bh, l1 : l1 + bw]
        img[t1 : t1 + bh, l1 : l1 + bw] = a

    col_steps = np.abs(img[:, 2:] - img[:, :-2]).mean(axis=0)
    row_steps = np.abs(img[2:, :] - img[:-2, :]).mean(axis=1)
    xs = sorted({left for left, _, _, _ in tiles if left})
    ys = sorted({top for _, top, _, _ in tiles if top})
    seams = {f"x={x}": seam_ratio(col_steps, x) for x in xs}
    seams.update({f"y={y}": seam_ratio(row_steps, y) for y in ys})

    out: dict = {"file": path.name, "camera": rw2.camera_model(data), "size": [raw.width, raw.height],
                 "tiles": len(tiles), "swap": swap, "seam_ratios": seams}
    at = ifds[0].offsets.get(rw2.PANA_JPG_FROM_RAW)
    blob = ifds[0].entries.get(rw2.PANA_JPG_FROM_RAW)
    if at is not None and blob:
        jpg = Image.open(io.BytesIO(data[at : at + len(blob)])).convert("L")
        luma = np.asarray(jpg, dtype=np.float64)
        green = np.sqrt(np.maximum(img[0::2, 1::2] + img[1::2, 0::2] - 2 * raw.ifd.entries[rw2.rd.TAG_BLACK_LEVEL][0], 0))
        # The preview shows the crop, not the whole sensor: bin the cropped green to its size.
        e = raw.ifd.entries
        cx, cy = (int(v) for v in e.get(rw2.rd.TAG_CROP_ORIGIN, (0, 0)))
        cw, ch = (int(v) for v in e.get(rw2.rd.TAG_CROP_SIZE, (raw.width, raw.height)))
        g = green[cy // 2 : (cy + ch) // 2, cx // 2 : (cx + cw) // 2]
        small = np.asarray(Image.fromarray(g.astype(np.float32)).resize(jpg.size, Image.BILINEAR), dtype=np.float64)
        sx, sy = jpg.size[0] / cw, jpg.size[1] / ch
        per_tile = []
        for left, top, w, h in tiles:
            x0, x1 = int(max(0, left - cx) * sx), int(min(cw, left + w - cx) * sx)
            y0, y1 = int(max(0, top - cy) * sy), int(min(ch, top + h - cy) * sy)
            a, b = small[y0:y1, x0:x1].ravel(), luma[y0:y1, x0:x1].ravel()
            ra, rb = a.argsort().argsort(), b.argsort().argsort()
            per_tile.append(round(float(np.corrcoef(ra, rb)[0, 1]), 4) if a.size > 1 and a.std() and b.std() else None)
        out["preview_size"] = list(jpg.size)
        out["preview_rank_r_per_tile"] = per_tile
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--swap", action="store_true", help="swap two blocks first (negative control)")
    args = ap.parse_args(argv)
    for path in args.files:
        print(json.dumps(check(path, args.swap), sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
