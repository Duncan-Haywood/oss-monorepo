"""How far a WarpRectilinear (even powers of r only) falls short of real lens profiles that WarpRectilinear2 holds exactly.

Lensfun's database (https://github.com/lensfun/lensfun, data/db/*.xml, CC BY-SA 3.0; this script reads its numbers and
keeps none of its files) stores most distortion calibrations in the Hugin "ptlens" model,

    r_d = r_u * (a r_u^3 + b r_u^2 + c r_u + 1 - a - b - c),

with r = 1 at half the image height (lensfun libs/lensfun/modifier.cpp, "About coordinate systems"), mapping a corrected
point r_u to the distorted point r_d it reads from: the direction a DNG warp opcode maps. Rescaled to the DNG's
r = 1 at the farthest pixel (r_lf = s r, s = that distance / half height), the radial factor is

    f(r) = (1 - a - b - c) + c s r + b s^2 r^2 + a s^3 r^3,

so WarpRectilinear2 carries it exactly as kr0..kr3 (odd and even powers). WarpRectilinear has only
kr0 + kr1 r^2 + kr2 r^4 + kr3 r^6. For each ptlens entry this script fits those four even terms by least squares on
the displacement, over the pixel centres of a frame ``--width`` pixels wide at the lens's calibration aspect ratio,
optical centre in the middle, and reports the largest and RMS displacement left, in pixels. It also checks, on
``--check`` entries, that ``dng_opcodes.warp_source`` with the rescaled WarpRectilinear2 terms lands where lensfun's
formula says (written out here in lensfun's own units).

Usage: python3 tools/lensfun_warp_fit.py DIR_OF_LENSFUN_XML [--width 6000] [--json out.json]
"""

from __future__ import annotations

import argparse
import glob
import json
import math
import os
import sys
import xml.etree.ElementTree as ET

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from shootflow import dng_opcodes as do  # noqa: E402


def aspect_of(lens) -> float:
    el = lens.find("aspect-ratio")
    if el is None or not (el.text or "").strip():
        return 1.5  # lensfun's default, 3:2
    t = el.text.strip()
    if ":" in t:
        a, b = t.split(":")
        v = float(a) / float(b)
    else:
        v = float(t)
    return max(v, 1.0 / v)


def entries(xml_dir: str):
    for path in sorted(glob.glob(os.path.join(xml_dir, "*.xml"))):
        root = ET.parse(path).getroot()
        for lens in root.iter("lens"):
            model = (lens.findtext("model") or "?").strip()
            kind = (lens.findtext("type") or "rectilinear").strip()
            aspect = aspect_of(lens)
            cal = lens.find("calibration")
            if cal is None:
                continue
            for d in cal.iter("distortion"):
                if d.get("model") != "ptlens":
                    continue
                a, b, c = (float(d.get(k, "0")) for k in "abc")
                yield os.path.basename(path), model, kind, float(d.get("focal", "nan")), aspect, a, b, c


def frame(width: int, aspect: float, step: int):
    h = int(round(width / aspect))
    xs = np.arange(0, width, step) + 0.5
    ys = np.arange(0, h, step) + 0.5
    X, Y = np.meshgrid(xs, ys)
    cx, cy = width / 2.0, h / 2.0
    m = math.hypot(cx, cy)
    r = np.hypot(X - cx, Y - cy).ravel() / m
    return h, m, r


def fit_even(r, f_true, m):
    """Least squares on the displacement m * r * (f_true - g(r)), g = e0 + e1 r^2 + e2 r^4 + e3 r^6."""

    A = np.stack([r * r ** (2 * k) for k in range(4)], axis=1)
    e, *_ = np.linalg.lstsq(A, r * f_true, rcond=None)
    resid = m * (r * f_true - A @ e)
    return e, float(np.max(np.abs(resid))), float(np.sqrt(np.mean(resid**2)))


def minimax_even(r, f_true, m, iters: int = 60) -> float:
    """Lawson's iteratively reweighted least squares toward the even fit with the smallest largest displacement."""

    A = np.stack([r * r ** (2 * k) for k in range(4)], axis=1)
    y = r * f_true
    w = np.full(r.size, 1.0 / r.size)
    best = math.inf
    for _ in range(iters):
        sw = np.sqrt(w)
        e, *_ = np.linalg.lstsq(A * sw[:, None], y * sw, rcond=None)
        resid = np.abs(m * (y - A @ e))
        best = min(best, float(resid.max()))
        w = w * resid
        tot = w.sum()
        if tot <= 0:
            break
        w /= tot
    return best


def check_exact(width: int, aspect: float, a: float, b: float, c: float) -> float:
    """Largest gap, in pixels, between warp_source on the rescaled WarpRectilinear2 and lensfun's own formula."""

    h = int(round(width / aspect))
    # The DNG frame (do._spec_frame: centre between the corner pixels, m to the farthest pixel's centre), with
    # lensfun's half height measured the same way, between pixel centres (lensfun's Width/Height are size - 1).
    cx, cy, m = do._spec_frame(0.5, 0.5, width, h)
    half = (h - 1) / 2.0
    s = m / half
    kr = (1 - a - b - c, c * s, b * s * s, a * s**3) + (0.0,) * 11
    wp = do.WarpRectilinear2((kr + (0.0, 0.0, 0.0, 1.0),), 0.5, 0.5, False)
    worst = 0.0
    for x, y in ((0, 0), (width - 1, h - 1), (width // 3, h // 5), (width - 7, 3), (width // 2, h // 2), (11, h // 2)):
        sx, sy = do.warp_source(wp, 0, x, y, width, h)
        # lensfun: corrected point in half-height units about the centre, distorted point = it times the ptlens factor
        ux, uy = (x + 0.5 - cx) / half, (y + 0.5 - cy) / half
        ru = math.hypot(ux, uy)
        k = a * ru**3 + b * ru**2 + c * ru + 1 - a - b - c
        lx, ly = cx + half * ux * k - 0.5, cy + half * uy * k - 0.5
        worst = max(worst, abs(sx - lx), abs(sy - ly))
    return worst


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("xml_dir")
    ap.add_argument("--width", type=int, default=6000)
    ap.add_argument("--step", type=int, default=40, help="sample every STEP pixels (default 40)")
    ap.add_argument("--check", type=int, default=200, help="entries to check exactly against lensfun's formula")
    ap.add_argument("--minimax", action="store_true", help="also fit for the smallest largest displacement (Lawson)")
    ap.add_argument("--json")
    args = ap.parse_args(argv)

    rows, frames, exact = [], {}, 0.0
    for i, (src, model, kind, focal, aspect, a, b, c) in enumerate(entries(args.xml_dir)):
        key = round(aspect, 4)
        if key not in frames:
            frames[key] = frame(args.width, aspect, args.step)
        h, m, r = frames[key]
        s = m / (h / 2.0)
        f_true = (1 - a - b - c) + c * s * r + b * s * s * r * r + a * s**3 * r**3
        _, mx, rms = fit_even(r, f_true, m)
        mm = minimax_even(r, f_true, m) if args.minimax else None
        odd = a != 0.0 or c != 0.0
        rows.append({"file": src, "lens": model, "type": kind, "focal": focal, "aspect": aspect, "a": a, "b": b, "c": c,
                     "odd": odd, "max_px": mx, "rms_px": rms, "minimax_px": mm})
        if i < args.check:
            exact = max(exact, check_exact(args.width, aspect, a, b, c))

    odd = np.array([q["odd"] for q in rows])
    lenses = {(q["file"], q["lens"]) for q in rows}
    print(f"ptlens entries: {len(rows)} ({len(lenses)} lenses), {int(odd.sum())} with an odd term (a or c not zero)")
    print(f"frame: {args.width} px wide at each lens's aspect ratio, sampled every {args.step} px")
    print(f"WarpRectilinear2 vs lensfun's formula, first {min(args.check, len(rows))} entries: largest gap {exact:.2e} px")
    rect = [q for q in rows if q["type"] == "rectilinear"]
    for label, group in (("all ptlens entries", rows), ("rectilinear lenses only", rect)):
        mxs = np.array([q["max_px"] for q in group])
        print(f"WarpRectilinear least-squares fit, largest displacement left (px), {label} ({len(group)}):")
        for p in (50, 75, 90, 95, 99, 100):
            print(f"  p{p:>3}: {np.percentile(mxs, p):8.3f}")
        for t in (0.25, 0.5, 1.0, 2.0, 5.0):
            print(f"  share over {t:>4} px: {np.mean(mxs > t) * 100:5.1f}%  ({int(np.sum(mxs > t))} entries)")
        if args.minimax:
            mms = np.array([q["minimax_px"] for q in group])
            print(f"  minimax even fit (best largest displacement WarpRectilinear can reach), {label}:")
            print("    " + ", ".join(f"p{p} {np.percentile(mms, p):.3f}" for p in (50, 75, 90, 95, 99, 100)))
            print("    " + ", ".join(f">{t} px {np.mean(mms > t) * 100:.1f}%" for t in (0.25, 0.5, 1.0, 2.0, 5.0)))
    worst = sorted(rect, key=lambda q: -q["max_px"])[:8]
    print("largest, rectilinear:")
    for q in worst:
        print(f"  {q['max_px']:7.2f} px (rms {q['rms_px']:.2f})  {q['lens']} @ {q['focal']:g} mm  [{q['file']}]")
    if args.json:
        with open(args.json, "w") as fh:
            json.dump({"width": args.width, "step": args.step, "exact_gap_px": exact, "rows": rows}, fh, indent=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
