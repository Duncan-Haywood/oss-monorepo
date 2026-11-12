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
    ref_xy = ref.camera_neutral_to_xy(np.array(neutral), *args, epsilon=1e-12)
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
        "xy_err": float(np.max(np.abs(np.array(ours_xy) - ref_xy))),
        "cct_err": abs(ours_cct - their_cct),
        "cct_rel": abs(ours_cct - their_cct) / their_cct,
        "matrix_err": float(np.max(np.abs(np.array(ours_m) - ref_m))),
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--cases", type=int, default=2000)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--json")
    args = ap.parse_args(argv)
    rng = random.Random(args.seed)
    rows = [compare(rng, with_fm=i % 2 == 1) for i in range(args.cases)]
    summary = {}
    for label, sel in (("ColorMatrix path", False), ("ForwardMatrix path", True)):
        part = [r for r in rows if r["fm"] == sel]
        summary[label] = {
            "cases": len(part),
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
    worst = max(r["matrix_err"] for r in rows)
    return 0 if worst < 1e-6 else 1


if __name__ == "__main__":
    raise SystemExit(main())
