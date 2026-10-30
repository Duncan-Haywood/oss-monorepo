"""Does the 3D-designed hanger's end radius stop growing once the cap is lifted? Caps 10 and 15 cm, eight seeds each.

python3 experiments/run.py     (needs numpy; run in the background, several minutes on 4 cores)
Writes results.txt next to this file. Caps 3 and 6 cm come from hanger-3dseeds (control_results.txt, results.txt).
"""
import multiprocessing as mp
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
R = HERE.parents[1]
sys.path[:0] = [str(R / "hanger-3dseeds" / "experiments"), str(R / "hanger-3dseeds" / "src"), str(R / "hanger-3d" / "src"),
                str(R / "hanger-fit" / "src")]
import run as base  # noqa: E402  (hanger-3dseeds: objective, budget, seeds)
from hanger_fit.model import Hanger  # noqa: E402
from hanger_fit.opt import cmaes  # noqa: E402
from hanger3dseeds.bounds import WIDE  # noqa: E402

CAPS = (10.0, 15.0)


def to_cap(u, cap):
    b = WIDE.copy()
    b[3, 1] = cap
    v = b[:, 0] + np.clip(u, 0, 1) * (b[:, 1] - b[:, 0])
    return Hanger(w=float(v[0]), slope=float(v[1]), bow=float(v[2]), r=float(v[3]))


def loop(job):
    cap, seed = job
    u, fb, hist = cmaes(lambda u: base.obj3(to_cap(u, cap))[0], 4, base.BUDGET, seed)
    h = to_cap(u, cap)
    return cap, seed, h, base.obj3(h)[1]


def main():
    jobs = [(c, s) for c in CAPS for s in base.SEEDS]
    rs = mp.Pool().map(loop, jobs, chunksize=1)
    out = ["3D loop, bow -2..5, end radius 0.15..cap, M tee, 3 cm half-depth, 64 drapes on err_all",
           "cap seed err err_all crease sag design"]
    for cap, s, h, sc in rs:
        out.append(f"{cap:g} {s} {sc['err']:.3f} {sc['err_all']:.3f} {sc['crease']:.1f} {sc['sag']:.2f} {base.fmt(h)}")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
