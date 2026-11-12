"""Read real .dcp camera profiles and measure what their tables do.

Camera profiles are what Adobe Camera Raw, Lightroom and RawTherapee use to
turn a camera's colour into a finished look: two matrices plus a
hue/saturation map (a 3-D grid of hue shifts and saturation and value
scales) and often a look table. RawTherapee ships 161 of them under
``rtdata/dcpprofiles`` (GPL repository; fetched at run time, not committed):

    git clone --depth=1 --filter=blob:none --sparse https://github.com/Beep6581/RawTherapee.git rt
    git -C rt sparse-checkout set rtdata/dcpprofiles

Then, from ``ventures/photo-editing``::

    PYTHONPATH=src python3 tools/dcp_check.py rt/rtdata/dcpprofiles [--samples 4000] [--json out.json]

For every profile it checks that ``read_dcp`` reads it and every table loads,
that greys stay grey through the tables, that hue is continuous across the
0/360 wrap, and (with numpy) that the numpy engine's table code gives the
pure-Python bytes on random ProPhoto colours. It reports how far each
profile moves hue and saturation on saturated colours, so a reader can see
what "applying the camera profile" changes.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import statistics
import sys
import time
from collections import Counter
from pathlib import Path

from shootflow import dng_colour as dc
from shootflow import raw_develop as rd


def _hue_deg(rgb):
    h, s, _v = dc.rgb_to_hsv(*rgb)
    return h * 60.0, s


def check_profile(path: Path, samples: int, rng: random.Random, np_mod) -> dict:
    out: dict = {"file": path.name}
    ifd = rd.read_dcp(path)
    notes: list[str] = []
    hsm1, hsm2, look = rd._tables(ifd.get, notes)
    out["notes"] = notes
    out["name"] = rd._text(ifd.get(rd.TAG_PROFILE_NAME))
    out["illuminants"] = [int((ifd.get(t) or (0,))[0]) for t in (rd.TAG_ILLUMINANT_1, rd.TAG_ILLUMINANT_2)]
    out["forward_matrix"] = ifd.get(rd.TAG_FORWARD_MATRIX_1) is not None
    out["tone_curve_points"] = len(ifd.get(rd.TAG_PROFILE_TONE_CURVE) or ()) // 2
    out["hsm"] = None if hsm1 is None else "{}x{}x{}".format(*hsm1.dims) + (" srgb" if hsm1.srgb else "")
    out["hsm2"] = hsm2 is not None
    out["look"] = None if look is None else "{}x{}x{}".format(*look.dims) + (" srgb" if look.srgb else "")
    tables = [t for t in (hsm1, look) if t is not None]
    # Greys through every table.
    worst_grey = 0.0
    for t in tables:
        for v in (0.0, 0.002, 0.05, 0.18, 0.5, 0.9, 1.0):
            r, g, b = t.apply(v, v, v)
            worst_grey = max(worst_grey, max(r, g, b) - min(r, g, b))
    out["grey_spread"] = worst_grey
    # Hue continuity across the wrap: a red a hair either side of 0 degrees.
    wrap_gap = 0.0
    for t in tables:
        below = t.apply(0.5, 0.2, 0.2000001)
        above = t.apply(0.5, 0.2000001, 0.2)
        wrap_gap = max(wrap_gap, max(abs(a - b) for a, b in zip(below, above)))
    out["wrap_gap"] = wrap_gap
    # What the tables do to saturated colours (ProPhoto, s 0.3-0.9, v 0.2-0.8).
    shifts, sat_ratio, val_ratio = [], [], []
    colours = []
    for _ in range(samples):
        h = rng.random() * 6.0
        s = 0.3 + 0.6 * rng.random()
        v = 0.2 + 0.6 * rng.random()
        colours.append(dc.hsv_to_rgb(h, s, v))
    for rgb in colours:
        cur = rgb
        for t in tables:
            cur = t.apply(*cur)
        h0, s0 = _hue_deg(rgb)
        h1, s1 = _hue_deg(cur)
        d = (h1 - h0 + 180.0) % 360.0 - 180.0
        shifts.append(abs(d))
        sat_ratio.append(s1 / s0)
        val_ratio.append(max(cur) / max(rgb))
    if tables:
        out["hue_shift_deg"] = {
            "mean": statistics.fmean(shifts),
            "p95": sorted(shifts)[int(0.95 * len(shifts))],
            "max": max(shifts),
        }
        out["sat_ratio"] = {"mean": statistics.fmean(sat_ratio), "min": min(sat_ratio), "max": max(sat_ratio)}
        out["val_ratio"] = {"mean": statistics.fmean(val_ratio), "min": min(val_ratio), "max": max(val_ratio)}
    # numpy engine against the pure path, on the same colours.
    if np_mod is not None and tables:
        from shootflow import raw_develop_np as rnp

        arr = np_mod.asarray(colours, dtype=np_mod.float64)
        r, g, b = arr[:, 0], arr[:, 1], arr[:, 2]
        mismatches = 0
        for t in tables:
            rr, gg, bb = rnp._table_apply(t, r, g, b)
            for i, rgb in enumerate(colours):
                want = t.apply(*rgb)
                if (float(rr[i]), float(gg[i]), float(bb[i])) != want:
                    mismatches += 1
        out["numpy_mismatches"] = mismatches
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("folder", help="Folder of .dcp files")
    ap.add_argument("--samples", type=int, default=4000)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--json", help="Write per-profile results here")
    args = ap.parse_args(argv)
    try:
        import numpy as np_mod
    except ImportError:
        np_mod = None
    rng = random.Random(args.seed)
    files = sorted(Path(args.folder).glob("*.dcp"))
    results, failures = [], []
    t0 = time.time()
    for path in files:
        try:
            results.append(check_profile(path, args.samples, rng, np_mod))
        except Exception as exc:  # report and keep going
            failures.append({"file": path.name, "error": f"{type(exc).__name__}: {exc}"})
    elapsed = time.time() - t0
    shapes = Counter((r["hsm"], r["hsm2"], r["look"]) for r in results)
    print(f"profiles: {len(files)}, read: {len(results)}, failed: {len(failures)} ({elapsed:.1f} s)")
    for f in failures:
        print("  FAILED", f["file"], f["error"])
    print("table shapes (HueSatMap, second map, LookTable): count")
    for k, v in shapes.most_common():
        print(f"  {k}: {v}")
    with_tables = [r for r in results if "hue_shift_deg" in r]
    print(f"with tables: {len(with_tables)}; notes on {sum(1 for r in results if r['notes'])}")
    print(f"tone curves: {sum(1 for r in results if r['tone_curve_points'])} (not applied by the developer)")
    print(f"worst grey spread through the tables: {max(r['grey_spread'] for r in results):.3g}")
    print(f"worst jump across the hue wrap: {max(r['wrap_gap'] for r in results):.3g}")
    if with_tables:
        means = sorted(r["hue_shift_deg"]["mean"] for r in with_tables)
        print(
            "mean |hue shift| per profile, degrees: median {:.2f}, range {:.2f}-{:.2f}; worst single colour {:.1f}".format(
                statistics.median(means), means[0], means[-1], max(r["hue_shift_deg"]["max"] for r in with_tables)
            )
        )
        sats = sorted(r["sat_ratio"]["mean"] for r in with_tables)
        print("mean saturation ratio per profile: median {:.3f}, range {:.3f}-{:.3f}".format(statistics.median(sats), sats[0], sats[-1]))
        for group in ("2d", "3d"):
            sel = [r for r in with_tables if (r["hsm"] or "").split(" ")[0].endswith("x1") == (group == "2d")]
            if sel:
                print(
                    f"  HueSatMap {group}: {len(sel)} profiles, median mean |hue shift| "
                    f"{statistics.median(r['hue_shift_deg']['mean'] for r in sel):.2f} deg, median sat ratio "
                    f"{statistics.median(r['sat_ratio']['mean'] for r in sel):.3f}"
                )
    if np_mod is not None:
        mism = sum(r.get("numpy_mismatches", 0) for r in results)
        print(f"numpy engine vs pure path: {mism} mismatching colours over {len(with_tables)} profiles")
    if args.json:
        Path(args.json).write_text(json.dumps({"results": results, "failures": failures}, indent=1))
    bad = failures or any(r["grey_spread"] > 1e-12 for r in results) or any(r.get("numpy_mismatches") for r in results)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
