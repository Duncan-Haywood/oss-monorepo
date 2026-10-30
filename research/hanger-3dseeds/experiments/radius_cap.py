"""Does the 3D optimum stop sitting on the end-radius limit when the limit is raised to 9 and 12 cm? Eight seeds each.

python3 experiments/radius_cap.py     (about 20 min on 4 cores; needs numpy)
Writes radius_cap_results.txt next to this file. The 3 and 6 cm rows come from control_results.txt and results.txt.
"""
import multiprocessing as mp
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "src"), str(HERE)]
import run  # noqa: E402  (sets up the import paths and the objective)
from hanger_fit.model import Hanger  # noqa: E402
from hanger_fit.opt import cmaes  # noqa: E402
from hanger3dseeds.bounds import WIDE  # noqa: E402
from hanger3dseeds.stats import paired_summary  # noqa: E402

CAPS = (9.0, 12.0)


def to_cap(u, cap):
    b = WIDE.copy()
    b[3, 1] = cap
    v = b[:, 0] + np.clip(u, 0, 1) * (b[:, 1] - b[:, 0])
    return Hanger(w=float(v[0]), slope=float(v[1]), bow=float(v[2]), r=float(v[3]))


def loop(args):
    cap, seed = args
    u, fb, hist = cmaes(lambda u: run.obj3(to_cap(u, cap))[0], 4, run.BUDGET, seed)
    h = to_cap(u, cap)
    return cap, seed, h, run.obj3(h)[1]


def main():
    rs = mp.Pool().map(loop, [(c, s) for c in CAPS for s in run.SEEDS], chunksize=1)
    out = ["3D loop, M tee, 3 cm half-depth, 64 drapes on err_all, end-radius upper limit raised (other bounds as 3d-wide)",
           "cap seed err err_all crease sag design"]
    for cap, s, h, sc in rs:
        out.append(f"{cap:g} {s} {sc['err']:.3f} {sc['err_all']:.3f} {sc['crease']:.1f} {sc['sag']:.2f} {run.fmt(h)}")
    wide = [float(l.split()[3]) for l in (HERE / "results.txt").read_text().splitlines() if l.startswith("3d-wide")]
    out.append("")
    for cap in CAPS:
        e = [sc["err_all"] for c, _, _, sc in rs if c == cap]
        on = sum(h.r > cap - 0.05 for c, _, h, _ in rs if c == cap)
        out.append(f"cap {cap:g}: on the limit in {on} of {len(e)}; err_all minus 6 cm cap (cm): {paired_summary(e, wide)}")
    (HERE / "radius_cap_results.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
