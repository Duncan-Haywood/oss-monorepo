"""Fit the default tone curve's knots from a camera profile that carries it.

Many camera profiles carry no ``ProfileToneCurve``. Adobe's raw converters
then apply their default curve, the "ACR3 default" (a 1,025-entry table in
Adobe's DNG SDK). 68 of RawTherapee's 161 profiles embed it resampled to
8,192 points and two carry it at 1,025 points; ``eval/default-tone-curve-
2026-11-12.md`` records how that was established.

shootflow does not copy that table. It ships ``dng_colour.DEFAULT_TONE_KNOTS``:
20 knots of its own, a natural cubic spline fitted here by weighted least
squares, with the knots spaced as ``(i / 19) ** 2.75`` so they crowd into
the shadows where the curve bends fastest. The weights are the sRGB curve's
slope (capped at 50), so the fit minimises error in output steps, not in
linear light. This tool reproduces those knots from any profile carrying the
curve and reports how far they sit from it:

    git clone --depth=1 --filter=blob:none --sparse https://github.com/Beep6581/RawTherapee.git rt
    git -C rt sparse-checkout set rtdata/dcpprofiles
    PYTHONPATH=src python3 tools/default_tone_fit.py "rt/rtdata/dcpprofiles/Canon EOS 1300D.dcp"

Pure Python, under a second. ``--knots`` and ``--power`` try other spacings.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from shootflow import dng_colour as dc
from shootflow import raw_develop as rd

SAMPLES = 4096


def _solve(a, b):
    """Gaussian elimination with partial pivoting (small dense systems)."""

    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(m[r][c]))
        m[c], m[p] = m[p], m[c]
        for r in range(n):
            if r != c:
                f = m[r][c] / m[c][c]
                for k in range(c, n + 1):
                    m[r][k] -= f * m[c][k]
    return [m[i][n] / m[i][i] for i in range(n)]


def srgb_steps(curve, reference_ys) -> float:
    """Worst difference in 8-bit sRGB output steps over the sample grid."""

    worst = 0.0
    for k, r in enumerate(reference_ys):
        y = min(1.0, max(0.0, curve.evaluate(k / SAMPLES)))
        worst = max(worst, abs(255.0 * (dc.srgb_encode(y) - dc.srgb_encode(r))))
    return worst


def fit(reference: dc.ToneCurve, knots: int = 20, power: float = 2.75, digits: int = 6):
    """(xs, ys) of the least-squares natural spline through fixed knot inputs."""

    xs = [round((i / (knots - 1)) ** power, digits) for i in range(knots)]
    grid = [k / SAMPLES for k in range(SAMPLES + 1)]
    ref = [reference.evaluate(x) for x in grid]
    # The spline is linear in its knot values: fix y=0 at 0 and y=1 at 1,
    # and build one basis column per inner knot.
    base = dc.ToneCurve.from_points(xs, [0.0] * (knots - 1) + [1.0])
    b0 = [base.evaluate(x) for x in grid]
    cols = []
    for j in range(1, knots - 1):
        ys = [0.0] * knots
        ys[j] = 1.0
        c = dc.ToneCurve.from_points(xs, ys)
        cols.append([c.evaluate(x) for x in grid])
    w = []
    for r in ref:
        lo, hi = max(0.0, r - 1e-4), min(1.0, r + 1e-4)
        w.append(min(50.0, (dc.srgb_encode(hi) - dc.srgb_encode(lo)) / (hi - lo)) ** 2)
    m = len(cols)
    rows = range(0, SAMPLES + 1, 2)
    a = [[sum(w[k] * cols[i][k] * cols[j][k] for k in rows) for j in range(m)] for i in range(m)]
    b = [sum(w[k] * cols[i][k] * (ref[k] - b0[k]) for k in rows) for i in range(m)]
    ys = [0.0] + [round(v, digits) for v in _solve(a, b)] + [1.0]
    return xs, ys


def report(reference: dc.ToneCurve, xs, ys) -> dict:
    curve = dc.ToneCurve.from_points(xs, ys)
    grid = [k / SAMPLES for k in range(SAMPLES + 1)]
    ref = [reference.evaluate(x) for x in grid]
    table = curve.table
    return {
        "knots": len(xs),
        "worst_linear": max(abs(curve.evaluate(x) - r) for x, r in zip(grid, ref)),
        "worst_srgb_8bit_steps": srgb_steps(curve, ref),
        "table_non_decreasing": all(b >= a for a, b in zip(table, table[1:])),
        "mid_grey": {"reference": reference.evaluate(0.18), "fitted": curve.evaluate(0.18)},
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("dcp", type=Path, help="a .dcp whose ProfileToneCurve is the default curve")
    ap.add_argument("--knots", type=int, default=20)
    ap.add_argument("--power", type=float, default=2.75)
    ap.add_argument("--json", type=Path, help="write the knots and report here")
    args = ap.parse_args(argv)
    values = rd.read_dcp(args.dcp).get(rd.TAG_PROFILE_TONE_CURVE)
    if not values:
        print(f"{args.dcp}: no ProfileToneCurve", file=sys.stderr)
        return 2
    reference = dc.ToneCurve.from_tags(values)
    xs, ys = fit(reference, args.knots, args.power)
    out = report(reference, xs, ys)
    shipped = report(reference, *zip(*dc.DEFAULT_TONE_KNOTS))
    out["points_in_profile"] = reference.points
    out["knots_xy"] = list(zip(xs, ys))
    out["matches_shipped_knots"] = [tuple(p) for p in out["knots_xy"]] == list(dc.DEFAULT_TONE_KNOTS)
    out["shipped"] = shipped
    print(json.dumps(out, indent=2))
    if args.json:
        args.json.write_text(json.dumps(out, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
