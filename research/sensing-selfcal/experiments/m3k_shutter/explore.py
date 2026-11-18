"""Milestone 3k, post hoc (written after analyse.py's verdicts were read; not pre-registered):
separate the rotational and translational parts of part B's hand-held shift, and try a lower rate.

  rot0.1:   omega N(0, 0.1^2) per axis, u = 0
  rot0.3:   omega N(0, 0.3^2) per axis, u = 0
  trans0.3: omega = 0, u N(0, 0.3^2) m/s per axis
30 seeds each, the same windows and solver as run.py. Writes explore.json.
    OMP_NUM_THREADS=1 python3 explore.py [n_workers]
"""
import json, os, sys
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run  # noqa: E402

CASES = {"rot0.1": (0.1, 0.0), "rot0.3": (0.3, 0.0), "trans0.3": (0.0, 0.3)}


def specs():
    out = []
    for name, (sw, su) in CASES.items():
        for s in range(30):
            g = np.random.default_rng(40_000 + s)
            out.append({"part": "X", "case": name, "seed": 100 + s,
                        "w": (g.normal(0, 1, (run.NKF, 3)) * sw).tolist(),
                        "u": (g.normal(0, 1, (run.NKF, 3)) * su).tolist()})
    return out


if __name__ == "__main__":
    nw = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    with Pool(nw) as p:
        res = list(p.imap(run.job, specs()))
    f = run.INTR[0]
    summ = {}
    for name in CASES:
        js = [j for j in res if j["case"] == name]
        e = np.array([(j["rs"]["intr"][0] - j["gs"]["intr"][0]) / f for j in js])
        summ[name] = {"n": len(js), "converged": int(sum(j["rs"]["status"] > 0 for j in js)),
                      "median_abs_e": float(np.median(np.abs(e))),
                      "share_abs_e_over_2pct": float(np.mean(np.abs(e) > 0.02)), "e": e.tolist()}
        print(name, {k: v for k, v in summ[name].items() if k != "e"})
    json.dump({"summary": summ, "jobs": res}, open(os.path.join(HERE, "explore.json"), "w"), indent=1)
    print("EXIT")
