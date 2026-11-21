"""Milestones 1 and 2 at ten seeds: seeds 5-9 added to the five each milestone ran, nothing else changed.

Milestone 1 (`../m1_allocation/run.py`, 15 arms) and milestone 2 (`../m2_polytope/run.py`, 20 arms) are rerun with their own
`cell` functions for seeds 5-9 (CMA-ES seed s + 1, training seed 100 + s, held-out seed 9999, as before). Milestone 2's
three-start study (`../m2_polytope/restarts.py`) is rerun for its lam = 1 arms at seeds 5-9; its lam = 0.3 arms at seeds 5-9
are milestone 4's PID arms (`../m4_controllers/run.py` uses restarts.py's CMA-ES seeds and starts), so they are read from
`../m4_controllers/results.json`, and this script checks that claim by flying one of them again. Two more reproduction checks
refly seed 0 of one milestone-1 and one milestone-2 arm and compare with the stored numbers.

Predictions are in ../../LOG.md, written and committed before the full run. Outputs results.json (the new runs and the checks);
stats.py merges them with the stored seeds 0-4 and writes results.txt.
Usage (from this directory): python3 run.py            # full: 75 + 100 + 30 CMA-ES runs + 3 checks
                             python3 run.py --checks   # the 3 reproduction checks only
"""
import json, os, sys
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import importlib.util


def load(name, path):
    sys.path.insert(0, os.path.dirname(path))
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    sys.modules[name] = m
    return m


M1 = load("m1run", os.path.join(HERE, "..", "m1_allocation", "run.py"))
M2 = load("run", os.path.join(HERE, "..", "m2_polytope", "run.py"))          # restarts.py imports it as `run`
R = load("m2restarts", os.path.join(HERE, "..", "m2_polytope", "restarts.py"))
NEW = range(5, 10)
R_ARMS = [("prio", cap, 1.0) for cap in (0, 80)]


def held_out(arm, s, cand):
    """restarts.py's selection and held-out score for one seed (best training score of the three starts)."""
    _, _, k, tb, bx = max(cand, key=lambda r: r[3])
    bx = np.array(bx); cond = M2.cond_of(*arm)
    J, sz, ax = M2.A.score(bx[None, :3], bx[None, 3:], M2.TEST_EP, M2.TEST_SEED, per_axis=True, **cond)
    return dict(mix=arm[0], cap=arm[1], lam=arm[2], seed=s, start=k, J=float(J[0]), rms=float(np.sqrt((ax[0] ** 2).mean())),
                alpha_deg=float(np.rad2deg(cond["alpha_max"] * np.clip(bx[2], 0, 1))), power=float(sz["power"][0]),
                train=[round(c[3], 2) for c in sorted(cand, key=lambda r: r[2])])


def job(j):
    kind, a = j
    if kind == "m1":
        return kind, M1.cell(a)
    if kind == "m2":
        return kind, M2.cell(a)
    return kind, R.one(a)


def checks(p):
    m1 = json.load(open(os.path.join(HERE, "..", "m1_allocation", "results.json")))["runs"]
    m2 = json.load(open(os.path.join(HERE, "..", "m2_polytope", "results.json")))["runs"]
    m4 = json.load(open(os.path.join(HERE, "..", "m4_controllers", "results.json")))["runs"]
    a1, a2 = (80, "2", "hover"), ("prio", 80, 0.3)
    r4 = [r for r in m4 if r["ctrl"] == "pid" and r["cap"] == 80 and r["seed"] == 7][0]
    out = p.map(job, [("m1", (a1, 0)), ("m2", (a2, 0))] + [("r", (a2, 7, k)) for k in range(3)])
    s1 = [r for r in m1 if (r["cap"], r["twr_arm"], r["act"]) == a1 and r["seed"] == 0][0]
    s2 = [r for r in m2 if (r["mix"], r["cap"], r["lam"]) == a2 and r["seed"] == 0][0]
    h = held_out(a2, 7, [o[1] for o in out[2:]])
    rows = [dict(check="m1 hover TWR2 cant<=80 seed 0", stored=s1["rms"], flown=out[0][1]["rms"]),
            dict(check="m2 prio lam0.3 cant<=80 seed 0", stored=s2["rms"], flown=out[1][1]["rms"]),
            dict(check="m2 restarts prio lam0.3 cant<=80 seed 7 = m4 pid cant<=80 seed 7", stored=r4["rms"], flown=h["rms"],
                 stored_start=r4["start"], flown_start=h["start"])]
    for r in rows:
        r["equal"] = abs(r["stored"] - r["flown"]) < 1e-9
    return rows


if __name__ == "__main__":
    with Pool() as p:
        chk = checks(p)
        for r in chk:
            print(r)
        if "--checks" in sys.argv:
            sys.exit(0 if all(r["equal"] for r in chk) else 1)
        jobs = [("m1", (a, s)) for a in M1.ARMS for s in NEW] + [("m2", (a, s)) for a in M2.ARMS for s in NEW]
        jobs += [("r", (a, s, k)) for a in R_ARMS for s in NEW for k in range(len(R.STARTS))]
        out = p.map(job, jobs, chunksize=1)
    m1 = [o for k, o in out if k == "m1"]; m2 = [o for k, o in out if k == "m2"]; rr = [o for k, o in out if k == "r"]
    rest = [held_out(a, s, [r for r in rr if r[0] == a and r[1] == s]) for a in R_ARMS for s in NEW]
    json.dump(dict(seeds=list(NEW), checks=chk, m1=m1, m2=m2, restarts_lam1=rest), open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print("done", len(m1), len(m2), len(rest))
