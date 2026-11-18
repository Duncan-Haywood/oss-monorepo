"""Fit and score blend rules on ``xtrans_frame_choice.py`` rows, fitted on "tune" files, scored on "held".

Rules, each against the directional default (a = 1), in colour PSNR:

* **frame, est / known**: one weight for the tile, a = clip((q - q_low) / (q_high - q_low), 0, 1), q the
  median block ratio with the noise estimated or known, read off the row's blend grid (nearest 0.05);
* **fixed a**: the best single weight for every tile (no measure at all), the baseline a measure must beat;
* **local, est / known**: per-block weights, the best (q_low, q_high) of the tool's grid;
* **oracle**: the best fixed weight per tile, the ceiling for any frame-level rule.

    python tools/xtrans_frame_choice_fit.py rows.jsonl [more.jsonl ...]
"""

from __future__ import annotations

import json
import sys

import numpy as np


def load(paths):
    rows = []
    for path in paths:
        rows += [json.loads(line) for line in open(path) if line.strip()]
    return [r for r in rows if "skipped" not in r]


def _at(r, a):
    a = round(round(float(np.clip(a, 0.0, 1.0)) / 0.05) * 0.05, 2)
    return r["blend_cpsnr"][f"{a:.2f}"] - r["default"]["cpsnr"]


def frame_gain(r, src, lo, hi):
    q = r["q"] if src == "est" else r["known"]["q"]
    return _at(r, (q - lo) / max(hi - lo, 1e-9))


def stats(g):
    g = np.asarray(g, dtype=float)
    return {
        "mean": round(float(g.mean()), 3), "median": round(float(np.median(g)), 3), "worst": round(float(g.min()), 2),
        "worse_0.1": int((g < -0.1).sum()), "better_0.1": int((g > 0.1).sum()), "n": int(g.size),
    }


def fit(tune):
    grid = np.round(np.arange(0.2, 4.01, 0.1), 2)
    out = {}
    for src in ("est", "known"):
        out[f"frame {src}"] = max(
            ((float(lo), float(hi)) for lo in grid for hi in grid if hi > lo),
            key=lambda p: np.mean([frame_gain(r, src, *p) for r in tune]),
        )
        keys = [k for k in tune[0]["local"] if k.startswith(src + " ")]
        out[f"local {src}"] = max(keys, key=lambda k: np.mean([r["local"][k] - r["default"]["cpsnr"] for r in tune]))
    out["fixed a"] = max(
        (round(a, 2) for a in np.arange(0.0, 1.0001, 0.05)), key=lambda a: np.mean([_at(r, a) for r in tune])
    )
    return out


def score(rows, rules):
    res = {}
    for name, p in rules.items():
        if name.startswith("frame"):
            g = [frame_gain(r, name.split()[1], *p) for r in rows]
        elif name.startswith("local"):
            g = [r["local"][p] - r["default"]["cpsnr"] for r in rows]
        else:
            g = [_at(r, p) for r in rows]
        res[name] = stats(g)
    res["oracle"] = stats([r["oracle"]["cpsnr"] - r["default"]["cpsnr"] for r in rows])
    res["bilinear"] = stats([r["bilinear"]["cpsnr"] - r["default"]["cpsnr"] for r in rows])
    return res


def main(argv=None) -> int:
    rows = load(argv or sys.argv[1:])
    tune = [r for r in rows if r["split"] == "tune"]
    held = [r for r in rows if r["split"] == "held"]
    rules = fit(tune)
    print(json.dumps({"rules": rules, "files": {
        "tune": len({r["file"] for r in tune}), "held": len({r["file"] for r in held})}}))
    for part_name, part in (("tune", tune), ("held", held)):
        for snr in [None] + sorted({r["snr"] for r in part}):
            sub = part if snr is None else [r for r in part if r["snr"] == snr]
            label = f"{part_name} all" if snr is None else f"{part_name} snr {snr:g}"
            print(json.dumps({"set": label, **score(sub, rules)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
