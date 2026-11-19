"""Milestone 7ag: does a capped tune's rise time follow from its gains alone, out of sample?

7af found, post hoc and on the 36 designs it flew at A_P = 3.5 m/s^2 and a 1 m step, that rise to 90% is a line in kd / A_P
(r = 0.9994). A builder can use that only if it holds where it was not fitted. Here the same 36 designs (7ac's "aware lag39c125",
7ae's "... cint25", 7af's "... cint25 step"; 6 seeds x 2 geometries each) are flown again, no retraining, with the proportional
cap A_P and the step size S changed at evaluation: (A_P, S) in {(2.0, 1), (2.5, 1), (3.5, 1), (5.0, 1), (8.0, 1), (3.5, 0.5),
(3.5, 2.0)}, band b = 0.25 m on, under the three identified laws (33, 36, 39.1 ms D^0). Everything else is 7y's step test
(lever 1, 45 deg tilt limit, integrator feed-forward, wide plant randomisation, held-out sensor noise, seed 9999, 64 episodes, 6 s,
no turbulence or yaw steps). (3.5, 1) under the 36 ms law is the reproduction check against 7af's, 7ae's and 7ad's flights.

Two predictors are scored against the flights, both written before the run (cruise_model.py, predictions in ../../LOG.md):
  line:        7af's fit, rise = 0.90 * 0.9 S * kd / A_P + 0.33 s
  point mass:  x'' = -min(kp|x|, A_P) sgn x - kd x' + ki I with the band, integrated from rest at S; no fitted constant.
A rise of 0 from 7y's argmax (the 90% mark never reached in 6 s) is stored as NaN.

Usage: python3 run.py            (SMOKE=1: 8 episodes on seed 4242; never the held-out seed)
"""
import importlib.util, json, os, time, warnings
from multiprocessing import Pool
import numpy as np

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, sub):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, "..", sub, "run.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


AE = _load("m7ae", "m7ae_cint_train")
AD, Y = AE.AD, AE.Y
L7 = Y.L7
SMOKE = AE.SMOKE
BAND = 0.25
CONDS = [(2.0, 1.0), (2.5, 1.0), (3.5, 1.0), (5.0, 1.0), (8.0, 1.0), (3.5, 0.5), (3.5, 2.0)]
SETS = {"aware lag39c125": None, "aware lag39c125 cint25": "m7ae_cint_train", "aware lag39c125 cint25 step": "m7af_step_obj"}
A_P0, S0, OFF0 = L7.A_P, Y.STEP_M, Y.TESTS["step"]["off"]


def designs():
    out = [d for d in AD.designs_7ac() if d["label"] == "aware lag39c125"]
    for lab, sub in SETS.items():
        if sub:
            out += [d for d in json.load(open(os.path.join(HERE, "..", sub, "results.json")))["designs"]
                    if d["label"] == lab and d["seed"] < AE.NSEED]
    return out


def fly(d, law, a_p, step):
    L7.A_P, Y.STEP_M = a_p, step
    Y.TESTS["step"]["off"] = step
    try:
        r = AD.fly(d, law, "step", BAND)
    finally:
        L7.A_P, Y.STEP_M = A_P0, S0
        Y.TESTS["step"]["off"] = OFF0
    r["rise"] = [None if (v is None or v == 0 or not np.isfinite(v)) else v for v in r["rise"]]
    r.update(a_p=a_p, step=step)
    return {k: r[k] for k in ("set", "geom", "seed", "law_name", "a_p", "step", "dead", "rise", "over", "settle")}


if __name__ == "__main__":
    t0 = time.time()
    ds = designs()
    assert len(ds) == 36 or SMOKE, len(ds)
    gains = [dict(set=d["label"], geom=d["geom"], seed=d["seed"], **dict(zip(("kp", "kd", "ki"), AD.gains(d)))) for d in ds]
    with Pool() as p:
        resp = p.starmap(fly, [(d, law, a, s) for (a, s) in CONDS for law in Y.LAWS for d in ds], chunksize=1)
    sfx = "_smoke" if SMOKE else ""
    json.dump(dict(band=BAND, conds=CONDS, laws=list(Y.LAWS), ep=Y.EP, seed=Y.SEED, gains=gains, resp=Y.rnd(resp),
                   wall=time.time() - t0), open(os.path.join(HERE, f"results{sfx}.json"), "w"), separators=(",", ":"))
    print(f"{len(resp)} flights, wall {time.time() - t0:.0f} s")
