"""Render a DNG with a .dcp profile, tone curve on and off, and compare.

Usage (numpy needed; from ``ventures/photo-editing``)::

    PYTHONPATH=src python3 eval/tone_frame.py FRAME.dng PROFILE.dcp [--python] [--tone-from OTHER.dcp]

``--tone-from`` takes the ProfileToneCurve from another profile (for a
camera whose own profile's curve is a straight line). ``--python`` also
renders with the pure-Python engine and checks the bytes match numpy.
Results: eval/tone-curve-2026-11-12.md.
"""

from __future__ import annotations

import argparse
import time

import numpy as np

from shootflow import raw_develop as rd


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("dng")
    ap.add_argument("dcp")
    ap.add_argument("--python", action="store_true")
    ap.add_argument("--tone-from")
    args = ap.parse_args()
    raw = rd.parse_raw(open(args.dng, "rb").read())
    prof = rd.read_dcp(args.dcp)
    if args.tone_from:
        donor = rd.read_dcp(args.tone_from).get(rd.TAG_PROFILE_TONE_CURVE)
        prof.entries[rd.TAG_PROFILE_TONE_CURVE] = donor
        print("tone curve from", args.tone_from.rsplit("/", 1)[-1], len(donor) // 2, "points")
    res = {}
    for name, kw in (("tables", {"tone_curve": False}), ("tone", {})):
        t = time.time()
        w, h, px, rep = rd.develop(raw, rd.DevelopSettings(half=True, engine="numpy", dcp=prof, **kw))
        res[name] = np.frombuffer(px.tobytes(), dtype=np.uint16).reshape(h, w, 3)
        print(name, w, h, f"{time.time() - t:.1f}s", rep.profile, rep.matrix)
    a, b = (res[k] / 257.0 for k in ("tone", "tables"))
    d = np.abs(a - b)
    print(
        "8-bit steps tone vs tables: mean %.1f p50 %.1f p99 %.1f max %.1f; >5 steps %.0f%%"
        % (d.mean(), np.median(d), np.percentile(d, 99), d.max(), 100 * (d.max(axis=2) > 5).mean())
    )
    for name in ("tables", "tone"):
        x = res[name] / 257.0
        lum = x.mean(axis=2)
        print(
            name,
            "mean level %.1f, p5 %.1f p50 %.1f p95 %.1f, clipped %.2f%%"
            % (lum.mean(), *np.percentile(lum, [5, 50, 95]), 100 * (x.max(axis=2) >= 254.5).mean()),
        )
    if args.python:
        t = time.time()
        _w, _h, px2, _ = rd.develop(raw, rd.DevelopSettings(half=True, engine="python", dcp=prof))
        print("python engine %.1fs, same bytes as numpy: %s" % (time.time() - t, px2.tobytes() == res["tone"].tobytes()))


if __name__ == "__main__":
    main()
