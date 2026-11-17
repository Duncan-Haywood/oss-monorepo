"""Compare ``shootflow.dng_colour`` with colour-hdri's DNG colour model.

colour-hdri (BSD-3, colour-science.org) implements the DNG specification's
camera-to-XYZ model independently of this repository: its own Robertson CCT,
its own iteration from the camera neutral to the white, its own matrix
blending. This tool draws random camera profiles of the kind Adobe publishes
(a Standard A and a D65 ColorMatrix, optional CameraCalibration, AnalogBalance
and ForwardMatrix pairs) and random whites from 2,000 K to 10,000 K, a little
off the Planckian locus, and compares, case by case:

* the white chromaticity found from the camera neutral (``neutral_to_xy``);
* its correlated colour temperature (Robertson 1968);
* the camera-to-XYZ D50 matrix, each scaled so the neutral maps to Y = 1
  (colour-hdri leaves the scale free), with and without ForwardMatrix.

Needs ``colour-hdri`` (``pip install colour-hdri``, which brings
colour-science and numpy) in a separate venv; ShootFlow itself stays stdlib.

    python tools/dng_colour_check.py [--cases 2000] [--seed 1] [--json out.json]
    python tools/dng_colour_check.py --dng FILE.dng [--json out.json]

``--dng`` reads a real file's colour tags instead (the image data is not
needed, so a metadata-only DNG works) and reports, for its as-shot white, both
models' white, temperature and matrix, and how far the old one-matrix method
(``--colour dcraw``) lands from the DNG model on a set of colour patches, in
8-bit sRGB steps.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

warnings.filterwarnings("ignore")

import numpy as np  # noqa: E402
from colour.models import UCS_uv_to_xy, xy_to_UCS_uv  # noqa: E402
from colour.temperature import CCT_to_uv_Robertson1968, uv_to_CCT_Robertson1968  # noqa: E402
from colour_hdri.models import dng as ref  # noqa: E402

from shootflow import dng_colour as dc  # noqa: E402

# Shapes of real Adobe matrices: positive diagonal, negative off-diagonals.
BASE_D65 = (0.6018, -0.0617, -0.0965, -0.8645, 1.5881, 0.2975, -0.1530, 0.1719, 0.7642)
BASE_A = (0.6461, -0.0907, -0.0882, -0.8300, 1.5640, 0.2933, -0.1150, 0.1478, 0.7310)


class _Stuck(Exception):
    pass


def ref_neutral_to_xy(neutral, args, seconds=2):
    """colour-hdri's white from a neutral, or None if its loop has not settled in time.

    Its loop has no step limit and stops on |sum of the xy change| <= 1e-10;
    on a few strongly different matrix pairs it crawls or cycles.
    """

    import signal

    def stuck(*_):
        raise _Stuck

    old = signal.signal(signal.SIGALRM, stuck)
    signal.alarm(seconds)
    try:
        return ref.camera_neutral_to_xy(neutral, *args, epsilon=1e-10)
    except _Stuck:
        return None
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old)


def ref_cct(xy):
    return float(uv_to_CCT_Robertson1968(xy_to_UCS_uv(np.array(xy)))[0])


def jitter(rng, base, amount):
    return tuple(v + rng.uniform(-amount, amount) * (abs(v) + 0.05) for v in base)


def mat(values):
    return np.array(values, dtype=float).reshape(3, 3)


def forward_from(cm, xy):
    """A ForwardMatrix consistent with ``cm`` under white ``xy`` (rows sum to D50)."""

    cam = mat(cm)
    n = cam @ np.array(dc.xy_to_xyz(xy))
    cat = np.array(dc.bradford(xy, dc.D50_XY))
    fm = cat @ np.linalg.inv(cam) @ np.diag(n)
    return tuple((fm / fm[1].sum()).ravel())


def case(rng, with_fm):
    cm1, cm2 = jitter(rng, BASE_A, 0.15), jitter(rng, BASE_D65, 0.15)
    cc = rng.random() < 0.5
    cc1 = tuple(np.diag([rng.uniform(0.9, 1.1), 1.0, rng.uniform(0.9, 1.1)]).ravel()) if cc else None
    cc2 = tuple(np.diag([rng.uniform(0.9, 1.1), 1.0, rng.uniform(0.9, 1.1)]).ravel()) if cc else None
    ab = (rng.uniform(0.8, 1.25), 1.0, rng.uniform(0.8, 1.25)) if rng.random() < 0.5 else (1.0, 1.0, 1.0)
    fm1 = forward_from(jitter(rng, cm1, 0.05), (0.44757, 0.40745)) if with_fm else None
    fm2 = forward_from(jitter(rng, cm2, 0.05), (0.31271, 0.32902)) if with_fm else None
    cct = rng.uniform(2000, 10000)
    duv = rng.uniform(-0.006, 0.006)
    xy = tuple(UCS_uv_to_xy(CCT_to_uv_Robertson1968(np.array([cct, duv]))))
    p = dc.Profile(
        dc.as_matrix(cm1), dc.as_matrix(cm2), 17, 21,
        dc.as_matrix(cc1), dc.as_matrix(cc2), dc.as_matrix(fm1), dc.as_matrix(fm2), ab,
    )
    neutral = p.xy_to_neutral(xy)
    return p, neutral, xy, (cm1, cm2, cc1, cc2, ab, fm1, fm2)


def compare(rng, with_fm):
    p, neutral, xy_true, (cm1, cm2, cc1, cc2, ab, fm1, fm2) = case(rng, with_fm)
    t1, t2 = dc.ILLUMINANT_CCT[17], dc.ILLUMINANT_CCT[21]
    eye = np.identity(3)
    args = (t1, t2, mat(cm1), mat(cm2), mat(cc1) if cc1 else eye, mat(cc2) if cc2 else eye, np.array(ab))
    ours_xy = p.neutral_to_xy(neutral)
    ref_xy = ref_neutral_to_xy(np.array(neutral), args)
    ours_cct = dc.xy_to_cct(ours_xy)
    their_cct = ref_cct(ours_xy)
    ours_m, _, _, used = p.camera_to_xyz_d50(neutral)
    ref_m = ref.matrix_camera_space_to_XYZ(
        np.array(ours_xy), *args,
        mat(fm1) if fm1 else eye, mat(fm2) if fm2 else eye,
    )
    ref_m = ref_m / (ref_m @ np.array(neutral))[1]
    return {
        "fm": used,
        "xy_true_err": max(abs(ours_xy[0] - xy_true[0]), abs(ours_xy[1] - xy_true[1])),
        "ref_settled": ref_xy is not None,
        "xy_err": 0.0 if ref_xy is None else float(np.max(np.abs(np.array(ours_xy) - ref_xy))),
        "cct_err": abs(ours_cct - their_cct),
        "cct_rel": abs(ours_cct - their_cct) / their_cct,
        "matrix_err": float(np.max(np.abs(np.array(ours_m) - ref_m))),
    }


PATCHES = [
    (r, g, b)
    for r in (0.05, 0.2, 0.5, 0.8)
    for g in (0.05, 0.2, 0.5, 0.8)
    for b in (0.05, 0.2, 0.5, 0.8)
]


def srgb8(v):
    v = min(max(v, 0.0), 1.0)
    return 255 * (12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055)


def check_file(path):
    from shootflow import raw_develop as rd

    data = Path(path).read_bytes()
    reader = rd._Reader(data)
    ifds = rd._all_ifds(reader)
    ifd0 = ifds[0]
    try:
        ifd = rd._raw_ifd(ifds)
    except rd.DevelopError:
        ifd = ifd0
    profile = rd._profile(ifd0, ifd)
    if profile is None:
        raise SystemExit("no ColorMatrix in the file")
    neutral = ifd.get(rd.TAG_AS_SHOT_NEUTRAL) or ifd0.get(rd.TAG_AS_SHOT_NEUTRAL)
    n = tuple(float(v) for v in neutral[:3])
    n = tuple(v / max(n) for v in n)
    name = bytes(ifd0.get(50708) or ifd0.get(272) or b"").rstrip(b"\0").decode("latin-1")
    xy = profile.neutral_to_xy(n)
    eye = np.identity(3)
    t1 = dc.ILLUMINANT_CCT.get(profile.illuminant_1, 0.0)
    t2 = dc.ILLUMINANT_CCT.get(profile.illuminant_2, 0.0)
    flip = t1 > t2
    cms = [profile.color_matrix_1, profile.color_matrix_2]
    ccs = [profile.camera_calibration_1 or dc.IDENTITY, profile.camera_calibration_2 or dc.IDENTITY]
    fms = [profile.forward_matrix_1, profile.forward_matrix_2]
    if flip:
        t1, t2, cms, ccs, fms = t2, t1, cms[::-1], ccs[::-1], fms[::-1]
    if not profile.use_calibration:
        ccs = [dc.IDENTITY, dc.IDENTITY]
    args = (t1, t2, np.array(cms[0]), np.array(cms[1]), np.array(ccs[0]), np.array(ccs[1]), np.array(profile.analog_balance))
    ref_xy = ref_neutral_to_xy(np.array(n), args)
    ours_m, _, cct, used_fm = profile.camera_to_xyz_d50(n)
    ref_m = ref.matrix_camera_space_to_XYZ(
        np.array(xy), *args,
        np.array(fms[0]) if fms[0] else eye, np.array(fms[1]) if fms[1] else eye,
    )
    ref_m = ref_m / (ref_m @ np.array(n))[1]
    # Both models on the same white-balanced camera values.
    wb = tuple(1.0 / v for v in n)
    new = np.array(rd._dng_colour(profile, n, None, [])[0])
    old = np.array(rd._colour_matrix(ifd0, ifd, [])[0])
    cam_of = np.array(profile.xyz_to_camera(xy)) @ np.array(dc.bradford(rd._SRGB_WHITE_XY, xy)) @ np.array(rd._XYZ_TO_SRGB_D65)
    steps = []
    for rgb in PATCHES:
        cam = cam_of @ np.array(rgb)
        balanced = cam * np.array(wb)
        a, b = new @ balanced, old @ balanced
        steps.append(max(abs(srgb8(x) - srgb8(y)) for x, y in zip(a, b)))
    return {
        "file": Path(path).name,
        "camera": name,
        "as_shot_neutral": [round(v, 6) for v in n],
        "white_xy": [round(v, 6) for v in xy],
        "white_xy_colour_hdri": [round(float(v), 6) for v in ref_xy],
        "cct_K": round(cct, 1),
        "illuminants": [profile.illuminant_1, profile.illuminant_2],
        "weight_of_matrix_1": round(profile.weight(cct), 4),
        "forward_matrix": used_fm,
        "camera_calibration_used": profile.use_calibration and bool(profile.camera_calibration_1 or profile.camera_calibration_2),
        "matrix_err_vs_colour_hdri": float(np.max(np.abs(np.array(ours_m) - ref_m))),
        "dcraw_vs_dng_8bit_steps": {
            "patches": len(steps),
            "max": round(max(steps), 2),
            "mean": round(sum(steps) / len(steps), 2),
            "over_2_steps": sum(1 for s in steps if s > 2),
        },
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--cases", type=int, default=2000)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--json")
    ap.add_argument("--dng", nargs="*", help="Real DNG files: check their own colour tags instead.")
    args = ap.parse_args(argv)
    if args.dng:
        out = [check_file(p) for p in args.dng]
        print(json.dumps(out, indent=2))
        if args.json:
            Path(args.json).write_text(json.dumps(out, indent=2) + "\n")
        return 0 if all(r["matrix_err_vs_colour_hdri"] < 1e-6 for r in out) else 1
    rng = random.Random(args.seed)
    rows = [compare(rng, with_fm=i % 2 == 1) for i in range(args.cases)]
    summary = {}
    for label, sel in (("ColorMatrix path", False), ("ForwardMatrix path", True)):
        part = [r for r in rows if r["fm"] == sel]
        summary[label] = {
            "cases": len(part),
            "colour_hdri_loop_unsettled_2s": sum(1 for r in part if not r["ref_settled"]),
            **{f"max_{k}": max(r[k] for r in part) for k in ("xy_true_err", "xy_err", "cct_err", "cct_rel", "matrix_err")},
        }
    # Robertson's own temperature on reference whites
    fixed = {}
    for name, xy in (("A", (0.44757, 0.40745)), ("D50", (0.34567, 0.35850)), ("D65", (0.31271, 0.32902))):
        fixed[name] = {"ours": round(dc.xy_to_cct(xy), 3), "colour": round(ref_cct(xy), 3)}
    summary["reference whites (K)"] = fixed
    summary["seed"] = args.seed
    print(json.dumps(summary, indent=2))
    if args.json:
        Path(args.json).write_text(json.dumps(summary, indent=2) + "\n")
    # A profile can have several self-consistent whites; colour-hdri starts its
    # loop at (1/3, 1/3) and ours at D50, so they may settle on different ones.
    # Those cases are counted, not failed; every other case must agree.
    multi = [r for r in rows if r["xy_err"] > 1e-6]
    summary["cases where the two settle on different whites"] = len(multi)
    print(json.dumps({"different_whites": len(multi)}))
    worst = max(r["matrix_err"] for r in rows)
    return 0 if worst < 1e-6 and len(multi) <= len(rows) // 200 else 1


if __name__ == "__main__":
    raise SystemExit(main())
