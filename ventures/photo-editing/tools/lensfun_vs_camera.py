"""How close lensfun's distortion profile comes to the correction a camera wrote into its own DNG.

Some cameras store their lens correction as a WarpRectilinear in OpcodeList3. When lensfun also has a
calibration for that lens, the two are independent measurements of the same distortion: the maker's
and a volunteer's. For each DNG given, this script builds lensfun's correction for the file's camera,
lens and focal length (``shootflow.lens_profiles``, fill zoom off) and compares where each warp sends
every 16th pixel of the full frame, per colour plane of the camera's warp:

- ``raw``: the source points as they are. The camera's warp also sets the framing (its kr0 zooms in),
  lensfun's keeps the centre's scale, so this mostly measures the zoom;
- ``same zoom``: after the single scale that best lines lensfun's points up with the camera's (least
  squares about the centre), which is the comparison of the distortion itself;
- ``correction size``: how far the camera's warp moves points from where a plain zoom would put them,
  so the gap can be read against the size of what is being corrected.

Usage: python3 tools/lensfun_vs_camera.py LENSFUN_DB_DIR FILE.dng [...] [--json out.json]
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from shootflow import dng_opcodes as do  # noqa: E402
from shootflow import lens_profiles as lp  # noqa: E402
from shootflow import raw_develop as rd  # noqa: E402


def source_points(wp, p, xs, ys, w, h):
    return np.array([do.warp_source(wp, p, x, y, w, h) for x, y in zip(xs, ys)])


def best_zoom(a, b, c):
    """k minimising |c + k (a - c) - b|: lensfun's offsets from the centre scaled onto the camera's."""

    da, db = a - c, b - c
    return float((da * db).sum() / (da * da).sum())


def check(db, path, step):
    data = open(path, "rb").read()
    reader = rd._Reader(data)
    ifds = rd._all_ifds(reader)
    ifd0, raw = ifds[0], rd._raw_ifd(ifds)
    exif = rd.exif_ifd(reader, ifd0)
    plan = do.plan(raw, ifd0)
    cam = [wp for wp in plan.warps if isinstance(wp, do.WarpRectilinear)]
    if not cam:
        return {"file": os.path.basename(path), "skipped": "no WarpRectilinear in the file"}
    active = raw.get(rd.TAG_ACTIVE_AREA)
    if active and len(active) == 4:
        h, w = int(active[2] - active[0]), int(active[3] - active[1])
    else:
        w, h = int(raw.one(rd.TAG_WIDTH)), int(raw.one(rd.TAG_HEIGHT))
    info = lp.shot_info(ifd0, exif)
    try:
        corr = lp.correction_for(db, info, w, h, fill=False)
    except lp.LensProfileError as exc:
        return {"file": os.path.basename(path), "camera": f"{info.make} {info.model}", "skipped": str(exc)}
    X, Y = np.meshgrid(np.arange(0, w, step), np.arange(0, h, step))
    xs, ys = X.ravel().astype(float), Y.ravel().astype(float)
    centre = np.array(do._spec_frame(0.5, 0.5, w, h)[:2]) - 0.5
    lf = source_points(corr.warp, 0, xs, ys, w, h)
    ident = np.stack([xs, ys], axis=1)
    planes = []
    for p in range(len(cam[0].terms)):
        cm = source_points(cam[0], p, xs, ys, w, h)
        raw_gap = np.hypot(*(lf - cm).T)
        k = best_zoom(lf, cm, centre)
        zoomed = centre + k * (lf - centre)
        gap = np.hypot(*(zoomed - cm).T)
        # The camera's distortion alone: its points against the plain zoom that best matches them.
        kc = best_zoom(ident, cm, centre)
        size = np.hypot(*((centre + kc * (ident - centre)) - cm).T)
        planes.append({
            "plane": p, "zoom": k,
            "raw_max_px": float(raw_gap.max()), "raw_median_px": float(np.median(raw_gap)),
            "max_px": float(gap.max()), "median_px": float(np.median(gap)), "p99_px": float(np.percentile(gap, 99)),
            "correction_max_px": float(size.max()), "correction_median_px": float(np.median(size)),
        })
    return {
        "file": os.path.basename(path), "camera": f"{info.make} {info.model}", "size": [w, h],
        "focal_mm": info.focal, "lens": corr.lens.name, "lensfun_terms": corr.distortion.terms,
        "model": corr.distortion.model, "notes": corr.notes, "camera_terms": [list(t) for t in cam[0].terms],
        "planes": planes,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("db")
    ap.add_argument("files", nargs="+")
    ap.add_argument("--step", type=int, default=16)
    ap.add_argument("--json")
    args = ap.parse_args(argv)
    db = lp.load_db(args.db)
    print(f"lensfun: {db.files} files, {len(db.lenses)} lenses, {len(db.cameras)} cameras")
    rows = []
    for path in args.files:
        r = check(db, path, args.step)
        rows.append(r)
        if "skipped" in r:
            print(f"{r['file']}: skipped: {r['skipped']}")
            continue
        print(f"{r['file']} ({r['camera']}, {r['size'][0]}x{r['size'][1]}, {r['focal_mm']:g} mm): {r['lens']}")
        for n in r["notes"]:
            print(f"  {n}")
        for q in r["planes"]:
            print(
                f"  plane {q['plane']}: raw gap max {q['raw_max_px']:.2f} px (median {q['raw_median_px']:.2f}); "
                f"same zoom ({q['zoom']:.5f}): max {q['max_px']:.2f} px, p99 {q['p99_px']:.2f}, "
                f"median {q['median_px']:.2f}; camera's distortion itself: max {q['correction_max_px']:.2f} px, "
                f"median {q['correction_median_px']:.2f}"
            )
    if args.json:
        with open(args.json, "w") as fh:
            json.dump(rows, fh, indent=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
