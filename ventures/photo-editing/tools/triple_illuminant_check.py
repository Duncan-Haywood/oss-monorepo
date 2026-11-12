"""Check the DNG 1.6 pieces of dng_colour against colour-science.

    python -m venv v && v/bin/pip install colour-science
    PYTHONPATH=src v/bin/python tools/triple_illuminant_check.py

1. ``temperature_tint`` on 5,000 random whites from 1,700 to 25,000 K, up to
   0.02 uv off the Planckian locus, against colour-science's Robertson (1968)
   ``uv_to_CCT_Robertson1968``: temperature, and tint against 3000 * Duv.
2. ``spectrum_to_xy`` (the IlluminantData spectrum path) on colour-science's
   CIE illuminant spectra (A, D50, D65, FL1-FL12, LED-B1..B5), resampled to the
   steps a DNG writer might use, against ``sd_to_XYZ`` and the published xy.
3. ``triple_weights``: partition, one-hot at each light, and the largest jump
   in weight over a fine walk across the plane (the blend should be continuous).
"""

from __future__ import annotations

import random
import sys
import warnings

warnings.filterwarnings("ignore")

import colour  # noqa: E402
import numpy as np  # noqa: E402

from shootflow import dng_colour as dc  # noqa: E402


def check_temperature(n=5000, seed=7):
    rng = random.Random(seed)
    worst_t = worst_tint = 0.0
    for _ in range(n):
        t = 1e6 / rng.uniform(40, 590)
        duv = rng.uniform(-0.02, 0.02)
        uv = colour.temperature.CCT_to_uv_Robertson1968(np.array([t, duv]))
        xy = tuple(colour.UCS_uv_to_xy(uv))
        ref_t, ref_duv = colour.temperature.uv_to_CCT_Robertson1968(uv)
        got_t, got_tint = dc.temperature_tint(xy)
        worst_t = max(worst_t, abs(got_t - ref_t) / ref_t)
        worst_tint = max(worst_tint, abs(got_tint - 3000.0 * ref_duv))
    print(f"temperature/tint, {n} whites: worst relative temperature difference {worst_t:.2e}, "
          f"worst tint difference {worst_tint:.2e}")


def check_spectra():
    names = ["A", "D50", "D65"] + [f"FL{i}" for i in range(1, 13)] + [f"LED-B{i}" for i in range(1, 6)]
    cmfs = colour.MSDS_CMFS["CIE 1931 2 Degree Standard Observer"]
    worst = 0.0
    rows = []
    for name in names:
        sd = colour.SDS_ILLUMINANTS.get(name)
        if sd is None:
            continue
        for step in (1, 5, 10):
            s = sd.copy().align(colour.SpectralShape(380, 780, step))
            xy_ref = colour.XYZ_to_xy(colour.sd_to_XYZ(s, cmfs, method="Integration"))
            xy = dc.spectrum_to_xy(380.0, float(step), list(s.values))
            d = max(abs(xy[0] - xy_ref[0]), abs(xy[1] - xy_ref[1]))
            worst = max(worst, d)
            if step == 5:
                pub = colour.CCS_ILLUMINANTS["CIE 1931 2 Degree Standard Observer"].get(name)
                rows.append((name, xy, pub))
    print(f"spectrum -> xy on {len(rows)} CIE illuminants at 1/5/10 nm: worst difference from "
          f"colour-science sd_to_XYZ {worst:.2e}")
    for name, xy, pub in rows:
        tail = "" if pub is None else f"  published ({pub[0]:.5f}, {pub[1]:.5f})"
        print(f"  {name:7s} ({xy[0]:.5f}, {xy[1]:.5f}){tail}")


def check_weights():
    lights = (dc.illuminant_xy(17), dc.illuminant_xy(21), dc.illuminant_xy(2))
    for i, light in enumerate(lights):
        w = dc.triple_weights(light, *lights)
        assert abs(w[i] - 1.0) < 1e-9, (i, w)
    biggest = 0.0
    for tint in range(-40, 41, 4):
        prev = None
        for k in range(0, 2001):
            t = 1e6 / (100 + 0.2 * k)  # 10,000 K to 2,000 K in 0.2 mired steps
            w = dc.triple_weights(dc.xy_from_temperature_tint(t, tint), *lights)
            assert abs(sum(w) - 1.0) < 1e-12 and min(w) >= 0.0
            if prev is not None:
                biggest = max(biggest, max(abs(a - b) for a, b in zip(w, prev)))
            prev = w
    print(f"weights (A, D65, F2): one-hot at each light; partition everywhere; largest change "
          f"over a 0.2-mired step {biggest:.4f}")


if __name__ == "__main__":
    check_temperature()
    check_spectra()
    check_weights()
    sys.exit(0)
