"""Read noise from the optical-black (masked) sensels against the frame's own patch-PCA read term (2026-11-22).

``--noise-from-frame`` fits variance = shot * level + read through brightness bins of the picture area
(``shootflow.noise_pca.estimate_noise_pca``). The read term is the line's intercept, extrapolated to level 0
from bins that may all sit well above black, and ``fit_line`` clamps a negative one to 0. The masked sensels
at the sensor's edge see no light, so their spread is the read noise itself, independent of the scene.

For each raw (LibRaw through rawpy, so every format reads the same way): the per-colour robust sigma of the
masked margins, all four sides (a standard deviation clipped at 6 robust sigmas, after removing each line's mean so banding does not count; a per-colour mean
of the four), in units of white - black; the frame estimate on the normalised picture-area mosaic; and the
ratio sqrt(read_frame) / sigma_ob. Under 1: the frame line reads less read noise than the sensor has.

Usage (from ``ventures/photo-editing``)::

    PYTHONPATH=src python tools/optical_black_floor.py FILES... > rows.jsonl
    python tools/optical_black_floor.py --summary rows.jsonl
"""

from __future__ import annotations

import argparse
import json
import math
import sys

import numpy as np

SKIP = 4  # sensels skipped at each edge of a margin (readout ramps, the picture's own spill)
MIN_SAMPLES = 2000
QUIET_DN = 0.5  # under half a DN a margin is zeroed or digitally filled, not a sensor's read noise
BLACK_TOL = 0.005  # a masked column's median within 0.5% of white - black of the black level  # a margin with fewer usable sensels per colour gives no reading


def margin_sigma(raw: np.ndarray, colors: np.ndarray, top: int, left: int, h: int, w: int,
                 black: float | None = None, tol: float | None = None) -> dict | None:
    """Robust sigma (raw DN) of the masked margins, per CFA colour index, and how many sensels it used.

    ``raw`` is the full sensor, ``colors`` LibRaw's per-sensel colour index, (top, left, h, w) the visible
    area. Each of the four margins is used when it is at least 2 * SKIP + 8 sensels deep. Columns (rows) of a
    single value are padding, not masked sensels (a D800E ends in thirty columns of 1: README, "The edge
    columns that hold no picture"), and are dropped."""

    H, W = raw.shape
    strips = []
    if left >= 2 * SKIP + 8:
        strips.append(("v", slice(top + SKIP, top + h - SKIP), slice(SKIP, left - SKIP)))
    if W - (left + w) >= 2 * SKIP + 8:
        strips.append(("v", slice(top + SKIP, top + h - SKIP), slice(left + w + SKIP, W - SKIP)))
    if top >= 2 * SKIP + 8:
        strips.append(("h", slice(SKIP, top - SKIP), slice(left + SKIP, left + w - SKIP)))
    if H - (top + h) >= 2 * SKIP + 8:
        strips.append(("h", slice(top + h + SKIP, H - SKIP), slice(left + SKIP, left + w - SKIP)))
    if not strips:
        return None
    vals: dict[int, list[np.ndarray]] = {}
    for orient, sy, sx in strips:
        a = raw[sy, sx].astype(np.float64)
        col = colors[sy, sx]
        if orient == "h":  # work on lines across the margin's depth: rows of a top/bottom strip are lines
            a, col = a.T, col.T
        live = np.ptp(a, axis=0) > 0  # a constant column is padding
        if black is not None and tol is not None:
            live &= np.abs(np.median(a, axis=0) - black) <= tol
        a, col = a[:, live], col[:, live]
        if a.size == 0:
            continue
        for c in np.unique(col):
            m = col == c
            # per-line mean removed per colour: line banding is pattern noise, not per-sensel read noise
            rows = np.where(m, a, np.nan)
            ok = m.sum(axis=1) >= 2
            d = rows[ok] - np.nanmean(rows[ok], axis=1, keepdims=True)
            # each line's mean costs one degree of freedom: scale its residuals by sqrt(n / (n - 1))
            n = m[ok].sum(axis=1, keepdims=True)
            d = (d * np.sqrt(n / (n - 1)))[m[ok]]
            vals.setdefault(int(c), []).append(d)
    out = {}
    for c, parts in vals.items():
        d = np.concatenate(parts)
        if d.size < MIN_SAMPLES:
            continue
        # a standard deviation, not a MAD: on integer sensels at 1-3 DN the MAD is quantised (sigma 2.0 reads
        # 1.48); hot and dead masked sensels are clipped at 6 robust sigmas (at least 6 DN) first
        s0 = max(1.4826 * float(np.median(np.abs(d))), 1.0)
        d = d[np.abs(d) < 6 * s0]
        out[c] = (float(np.sqrt(np.mean(d * d))), int(d.size))
    return out or None


def row_for(path: str) -> dict:
    import rawpy

    from shootflow.noise_pca import estimate_noise_pca

    name = path.rsplit("/", 1)[-1]
    with rawpy.imread(path) as r:
        if r.raw_pattern is None or r.raw_pattern.shape != (2, 2):
            return {"file": name, "skipped": "not a 2x2 Bayer mosaic"}
        s = r.sizes
        raw = np.array(r.raw_image, copy=True)
        colors = np.array(r.raw_colors, copy=True)
        black = float(np.mean(r.black_level_per_channel))
        white = float(r.white_level)
        top, left, h, w = s.top_margin, s.left_margin, s.height, s.width
        ob = margin_sigma(raw, colors, top, left, h, w, black=black, tol=BLACK_TOL * (white - black))
        if ob is None:
            return {"file": name, "skipped": f"no masked margin (sensor {s.raw_width}x{s.raw_height}, picture {w}x{h} at {left},{top})"}
        vis = np.array(r.raw_image_visible, dtype=np.float64)
        pat = tuple(int(v) for v in r.raw_pattern.flatten())
    span = white - black
    # LibRaw colour indices: 0 R, 1 G, 2 B, 3 second G; the estimator takes 0/1/2
    pat = tuple(1 if v == 3 else v for v in pat)
    hh, ww = (vis.shape[0] // 2) * 2, (vis.shape[1] // 2) * 2
    c = (vis[:hh, :ww] - black) / span
    shot, read = estimate_noise_pca(c, pat)
    sig_ob = float(np.mean([v[0] for v in ob.values()])) / span
    frame_read = math.sqrt(max(read, 0.0))
    return {
        "file": name,
        "black": round(black, 2),
        "white": white,
        "ob_sensels": int(sum(v[1] for v in ob.values())),
        "sigma_ob_dn": round(sig_ob * span, 3),
        "sigma_ob": sig_ob,
        "shot": shot,
        "read": read,
        "sigma_read_frame": frame_read,
        "ratio": frame_read / sig_ob if sig_ob > 0 else None,
        # what the floor would change: sigma at 1% of white (deep shadow) under each model
        "sigma_1pct_frame": math.sqrt(max(shot * 0.01 + read, 0.0)),
        "sigma_1pct_floored": math.sqrt(max(shot * 0.01 + max(read, sig_ob ** 2), 0.0)),
    }


def summary(path: str) -> int:
    rows = [json.loads(line) for line in open(path) if line.strip()]
    for r in rows:
        if "sigma_ob_dn" in r and r["sigma_ob_dn"] < QUIET_DN:
            r["skipped"] = f"masked margin reads {r['sigma_ob_dn']:.2f} DN, too quiet to be read noise"
    skipped = [r for r in rows if "skipped" in r]
    ok = [r for r in rows if "skipped" not in r and r.get("ratio") is not None]
    print(f"{len(ok)} raws read, {len(skipped)} skipped")
    if not ok:
        return 0
    ratios = np.array([r["ratio"] for r in ok])
    zero = sum(1 for r in ok if r["read"] <= 0)
    print(f"frame read term clamped to 0: {zero} of {len(ok)}")
    print(f"sqrt(read_frame) / sigma_ob: median {np.median(ratios):.2f}, "
          f"under 0.5: {int((ratios < 0.5).sum())}, under 0.8: {int((ratios < 0.8).sum())}, "
          f"0.8-1.25: {int(((ratios >= 0.8) & (ratios <= 1.25)).sum())}, over 1.25: {int((ratios > 1.25).sum())}")
    lift = np.array([r["sigma_1pct_floored"] / r["sigma_1pct_frame"] if r["sigma_1pct_frame"] > 0 else np.inf
                     for r in ok])
    print(f"sigma at 1% of white, floored / frame: median {np.median(lift[np.isfinite(lift)]):.2f}, "
          f"raised over 10%: {int((lift > 1.1).sum())}")
    print()
    print("| file | OB sigma (DN) | OB sigma x1000 | frame read sigma x1000 | ratio | 1% sigma lift |")
    print("|---|---:|---:|---:|---:|---:|")
    for r, lf in sorted(zip(ok, lift), key=lambda t: t[0]["ratio"]):
        print(f"| {r['file']} | {r['sigma_ob_dn']:.2f} | {r['sigma_ob'] * 1000:.3f} | "
              f"{r['sigma_read_frame'] * 1000:.3f} | {r['ratio']:.2f} | {lf:.2f}x |")
    for r in skipped:
        print(f"skipped {r['file']}: {r['skipped']}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("files", nargs="*")
    ap.add_argument("--summary", metavar="ROWS")
    args = ap.parse_args(argv)
    if args.summary:
        return summary(args.summary)
    for p in args.files:
        try:
            rec = row_for(p)
        except Exception as exc:  # noqa: BLE001
            rec = {"file": p.rsplit("/", 1)[-1], "skipped": f"{type(exc).__name__}: {exc}"}
        print(json.dumps(rec), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
