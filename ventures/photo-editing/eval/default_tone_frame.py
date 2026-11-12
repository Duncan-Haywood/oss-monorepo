"""On a real frame: the default curve's 20-knot fit against the curve itself.

Usage (numpy needed; from ``ventures/photo-editing``)::

    PYTHONPATH=src python3 eval/default_tone_frame.py FRAME.dng PROFILE.dcp CURVE.dcp

Renders FRAME.dng at half size with PROFILE.dcp's matrices and tables three
ways: with no tone curve; with the ProfileToneCurve taken from CURVE.dcp (a
profile embedding Adobe's ACR3 default, e.g. RawTherapee's ``Canon EOS
6D.dcp``); and with PROFILE.dcp's curve removed and ``default_tone="always"``
(shootflow's fitted knots). Reports the difference in 8-bit steps.
Results: eval/default-tone-curve-2026-11-12.md.
"""

from __future__ import annotations

import argparse
import json
import time

import numpy as np

from shootflow import raw_develop as rd


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("dng")
    ap.add_argument("dcp")
    ap.add_argument("curve_dcp")
    args = ap.parse_args()
    raw = rd.parse_raw(open(args.dng, "rb").read())
    curve = rd.read_dcp(args.curve_dcp).get(rd.TAG_PROFILE_TONE_CURVE)
    with_curve = rd.read_dcp(args.dcp)
    with_curve.entries[rd.TAG_PROFILE_TONE_CURVE] = curve
    without = rd.read_dcp(args.dcp)
    without.entries.pop(rd.TAG_PROFILE_TONE_CURVE, None)
    runs = {
        "no curve": dict(dcp=without, default_tone="never"),
        "ACR3 curve from profile": dict(dcp=with_curve),
        "default (20-knot fit)": dict(dcp=without, default_tone="always"),
    }
    out = {}
    imgs = {}
    for name, kw in runs.items():
        t = time.time()
        w, h, px, rep = rd.develop(raw, rd.DevelopSettings(half=True, engine="numpy", **kw))
        img = np.frombuffer(px.tobytes(), dtype=np.uint16).reshape(h, w, 3).astype(np.float64) / 257.0
        imgs[name] = img
        out[name] = {
            "seconds": round(time.time() - t, 2),
            "profile": rep.profile,
            "mean_8bit": round(float(img.mean()), 2),
            "p5_p50_p95": [round(float(v), 1) for v in np.percentile(img, [5, 50, 95])],
        }
    d = np.abs(imgs["default (20-knot fit)"] - imgs["ACR3 curve from profile"])
    out["fit vs curve, 8-bit steps"] = {
        "mean": float(d.mean()),
        "p99": float(np.percentile(d, 99)),
        "max": float(d.max()),
        "share_over_0.5": float((d > 0.5).mean()),
        "share_over_1": float((d > 1.0).mean()),
    }
    t = np.abs(imgs["ACR3 curve from profile"] - imgs["no curve"])
    out["curve vs no curve, 8-bit steps"] = {"mean": float(t.mean()), "max": float(t.max())}
    out["size"] = [w, h]
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
