"""Milestone 6b, post hoc (written after H39 was refuted): does the *envelope* of seated tilts
converge with the number of feet, even though single seats move?

    python experiments/m6b_bowed_edge/envelope.py > experiments/m6b_bowed_edge/envelope.txt

24 holder errors U(-1, 1) deg (seed 21), mu 0.4, F_n 5 and 50 N, parabolic 1/16 in bow,
n = 25 to 401 feet, both engines. Writes envelope.json. About three minutes on four CPUs.
"""
import json
import math
import os
import sys
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
sys.path.insert(0, HERE)
from run import _seat  # noqa: E402
from buildbot_sheathing import bowed_edge as B  # noqa: E402

deg = math.degrees


def main():
    th0 = np.random.default_rng(21).uniform(-1, 1, 24)
    ns, fns = (25, 49, 97, 193, 401), (5.0, 50.0)
    keys = [(sim, n, fn, float(t)) for sim in ("drake", "mujoco") for n in ns for fn in fns for t in th0]
    with Pool(4) as pool:
        th = pool.map(_seat, [dict(sim=s, theta0=math.radians(t), mu=0.4, f_n=fn, profile=dict(p=2.0, n=n))
                              for s, n, fn, t in keys], chunksize=4)
    rows = {}
    for (s, n, fn, _), v in zip(keys, th):
        rows.setdefault((s, n, fn), []).append(deg(v))
    out = []
    print("# Envelope of seated tilts on a parabolic 1/16 in bow, 24 holder errors U(-1,1) deg, mu 0.4\n")
    print("sim     n    F_n | band_deg  max_abs_deg  sd_deg  share_within_band+0.005")
    for (s, n, fn), v in rows.items():
        a = np.abs(v)
        band = deg(B.stick_band(0.4, fn))
        share = float(np.mean(a <= band + 0.005))
        out.append({"sim": s, "n": n, "f_n": fn, "band_deg": band, "max_abs_deg": float(a.max()),
                    "sd_deg": float(np.std(v)), "share_within": share})
        print(f"{s:6s} {n:4d} {fn:5.0f} | {band:8.4f}  {a.max():11.4f}  {np.std(v):6.4f}  {share:.2f}")
    json.dump(out, open(os.path.join(HERE, "envelope.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
