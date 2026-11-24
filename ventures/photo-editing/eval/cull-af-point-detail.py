"""Detail at the camera's AF point vs the rest of the preview.

For each file with an AF point (eval/cull-af-point.mjs), the variance of a
4-neighbour Laplacian in a square window (6% of the preview's width, or the
AF box when larger) centred on the point, ranked among the same window slid
over the whole preview on a 24 x 16 grid. A correct reading on an in-focus
frame should rank high: the camera focused on something with edges. For
Canon, the same rank at the point mirrored top-to-bottom tests the sign of
the Y positions. Prints a TSV and a summary.
"""
import json
import sys

import numpy as np
from PIL import Image


def lap_var(g, cx, cy, half):
    h, w = g.shape
    x0, x1 = max(1, int(cx - half)), min(w - 1, int(cx + half))
    y0, y1 = max(1, int(cy - half)), min(h - 1, int(cy + half))
    if x1 - x0 < 4 or y1 - y0 < 4:
        return 0.0
    s = g[y0 - 1:y1 + 1, x0 - 1:x1 + 1]
    lap = s[:-2, 1:-1] + s[2:, 1:-1] + s[1:-1, :-2] + s[1:-1, 2:] - 4 * s[1:-1, 1:-1]
    return float(lap.var())


def main(path):
    with open(path) as fh:
        rows = [json.loads(line) for line in fh if line.strip()]
    print("file\tsource\tx\ty\tin_focus\trank\trank_mirrored")
    ranks, mranks = [], []
    for r in rows:
        af = r.get("af")
        if not af or "x" not in af or not r.get("jpg"):
            continue
        im = Image.open(r["jpg"]).convert("L")
        g = np.asarray(im, dtype=np.float32)
        h, w = g.shape
        box = max([p.get("w", 0) * w for p in af["points"]] + [0.06 * w])
        half = box / 2
        grid = [lap_var(g, (i + 0.5) * w / 24, (j + 0.5) * h / 16, half) for i in range(24) for j in range(16)]
        grid = np.array(grid)
        v = lap_var(g, af["x"] * w, af["y"] * h, half)
        rank = float((grid < v).mean())
        mr = ""
        if af["source"].startswith("Canon") and abs(af["y"] - 0.5) > 0.02:
            mv = lap_var(g, af["x"] * w, (1 - af["y"]) * h, half)
            mr = float((grid < mv).mean())
            mranks.append((rank, mr))
        ranks.append(rank)
        print("\t".join(str(c) for c in [r["file"], af["source"], round(af["x"], 3), round(af["y"], 3),
                                         int(bool(af.get("inFocus"))), round(rank, 3), mr if mr == "" else round(mr, 3)]))
    if ranks:
        print(f"# {len(ranks)} files with an AF point; median rank of detail at the point {np.median(ranks):.3f} "
              f"(0.5 = no better than a random spot); {sum(r >= 0.75 for r in ranks)} of {len(ranks)} in the top quarter")
    for a, b in mranks:
        print(f"# Canon Y sign: rank as read {a:.3f}, mirrored {b:.3f}")


if __name__ == "__main__":
    main(sys.argv[1])
