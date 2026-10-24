"""Intervention on the 10 scenes no design holds (all spheres): lower only the hand height (dz_mm -> 0, or -> radius - 5 mm)
and ask whether the best 25 designs (by test success under the codesign-diagnose limits) now hold them. Writes dz_probe.txt."""
import json, os, sys
os.environ.setdefault("OMP_NUM_THREADS", "1")
from concurrent.futures import ProcessPoolExecutor as Pool
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import numpy as np
from codesign_ceiling import Problem
from codesign_ceiling.sim import rollout
from codesign_ceiling.analysis import CONDITIONS, oracle_reach, per_design_best

R = json.load(open(os.path.join(HERE, "reach.json")))
D, S, nt = R["designs"], R["scenes"], R["n_test"]
A = list(CONDITIONS.values())[0]
miss = [s for s, r in zip(S, oracle_reach(D, A)) if not r]
te, _ = per_design_best(D, A, nt)
top = [D[i] for i in np.argsort(-te)[:25]]
VARIANTS = {"as drawn": lambda s: s["dz_mm"], "dz = 0": lambda s: 0.0, "dz = radius": lambda s: s["size"]}


def job(args):
    d, vi, si = args
    x = d["x"]; dd, st = Problem().design(x)
    s = dict(miss[si]); s["dz_mm"] = list(VARIANTS.values())[vi](miss[si])
    fs = [f for f in R["grid"] + [st["f_max"]] if f <= st["f_max"] + 1e-9]
    return vi, si, any(rollout(dd, s, f)["success"] for f in fs)


if __name__ == "__main__":
    jobs = [(d, vi, si) for d in top for vi in range(len(VARIANTS)) for si in range(len(miss))]
    with Pool(4) as p:
        res = p.map(job, jobs, chunksize=8)
    held = {(vi, si): False for vi in range(len(VARIANTS)) for si in range(len(miss))}
    for vi, si, ok in res:
        held[(vi, si)] |= ok
    L = [f"{len(miss)} scenes not held by any of {len(D)} designs; probe with the best {len(top)} designs, all allowed forces"]
    for vi, name in enumerate(VARIANTS):
        n = sum(held[(vi, si)] for si in range(len(miss)))
        L.append(f"  hand height {name:10s}: {n} of {len(miss)} scenes now held by at least one design")
    open(os.path.join(HERE, "dz_probe.txt"), "w").write("\n".join(L) + "\n"); print("\n".join(L))
