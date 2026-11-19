"""Milestone 7ad: why do a quarter of the co-designed tunes never settle on a 1 m step, and does conditional integration fix it?

7y-7ac found that in every training set one to five of twelve designs end a 1 m position step 5-8 cm short of the hold point.
Before writing predictions, a three-state model of the outer loop alone (model.py: PID on a double integrator, with 7k's cap,
the tilt limit and the integrator clip; no attitude loop, motor lag or side force) was run on 7ac's 72 response-tested designs:
its last-second distance matched the full simulator's (r 0.998) and its 5 cm call matched all 72 (in sample, no fitted
parameter). The tail is the integrator's slow pole near -ki/kp.

Part A (out of sample): 7y's step test (lever 1, 45 deg, calm, seed 9999, 64 episodes) at the three identified laws on 96 designs
never response-tested before: 7t's aware lag36, 7v's aware lagrand, 7w's aware lag45, 7x's aware lag52 and the 7l arm's lag36,
lag39, lagrand and lag45 tunes. The model's call is written to results.json next to the simulator's.
Part B (a fix without retuning): conditional integration, the position integrator runs only while |error| < b, at b = 0.25 m
and b = 0.1 m (neither sourced: they bracket the model's check), on 7ac's 72 designs: 7y's step, wind3 and wind6 tests under
the three identified laws and 7z's held-out stress set (seed 9999, 64 episodes, four capped conditions, eight laws).
b = None re-flies the response tests as a reproduction check against 7ac's results.json.
Predictions in ../../LOG.md, committed before the full-budget run.

Usage: python3 run.py            (SMOKE=1: 8 test episodes on seed 4242, 2 seeds, never the held-out seed)
"""
import importlib.util, json, os, time, warnings
from multiprocessing import Pool
import numpy as np

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
_ms = importlib.util.spec_from_file_location("m7ad_model", os.path.join(HERE, "model.py"))
MO = importlib.util.module_from_spec(_ms); _ms.loader.exec_module(MO)


def _load(name, sub):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, "..", sub, "run.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


AC = _load("m7ac", "m7ac_ceil125")  # 7ac: its designs; loads 7ab, 7aa, 7z, 7x, 7y
Z, X, Y = AC.Z, AC.X, AC.Y
R, M7, U, M6 = AC.R, AC.M7, AC.U, AC.M6
P = M6.P
SMOKE = AC.SMOKE
NSEED = AC.NSEED
ORDER = Z.ORDER
BANDS = (0.25, 0.1)
HELD = {"aware lag36": "m7t_lag_src", "aware lagrand": "m7v_lag_rand", "aware lag45": "m7w_slow45", "aware lag52": "m7x_knee",
        "7l lag36": "m7t_lag_src", "7l lag39": "m7v_lag_rand", "7l lagrand": "m7v_lag_rand", "7l lag45": "m7w_slow45"}


def designs_7ac():
    return [dict(d) for d in json.load(open(os.path.join(HERE, "..", "m7ac_ceil125", "results.json")))["designs"] if d["seed"] < NSEED]


def designs_held():
    out = []
    for lab, sub in HELD.items():
        for d in json.load(open(os.path.join(HERE, "..", sub, "results.json")))["designs"]:
            if d["seed"] < NSEED and d["label"] == lab:
                out.append(dict(d))
    return out


def gains(d):
    """Physical outer-loop kp, kd, ki of a design, decoded under its own kp box (as 7y's fly does)."""
    M7.setup(Y.TILT, d["kp_hi"])
    g = P.phys_gains(np.array(d["x"][:12], float)[None, 3:12])[0, 6:9]
    M7.setup()
    return [float(v) for v in g]


def model_call(ds, band=None):
    g = np.array([gains(d) for d in ds])
    tl, _ = MO.tail(g[:, 0], g[:, 1], g[:, 2], band)
    sr = MO.slow_root(g[:, 0], g[:, 1], g[:, 2])
    return [dict(set=d["label"], geom=d["geom"], seed=d["seed"], kp=gi[0], kd=gi[1], ki=gi[2], model_tail=float(t), slow_root=float(s))
            for d, gi, t, s in zip(ds, g, tl, sr)]


def fly(d, law, test, band):
    P.PINT_BAND = band
    r = Y.fly(d, law, test)
    P.PINT_BAND = None
    r["band"] = band
    return r


KEEP = {"step": ("settle", "rise", "over", "tail_off"), "wind3": ("peak", "resid"), "wind6": ("peak", "resid")}


def compact(rs):
    """Drop the per-episode fields the verdicts never read (rms, tail_pp), keeping results.json near earlier milestones' size."""
    drop = {"rms", "tail_pp"}
    return [{k: v for k, v in r.items() if k not in drop or k in KEEP[r["test"]]} for r in rs]


def evaluate(law, d, band):
    P.PINT_BAND = band
    r = X.evaluate(law, d)
    P.PINT_BAND = None
    r["band"] = band
    return r


if __name__ == "__main__":
    t0 = time.time()
    held, base = designs_held(), designs_7ac()
    print(f"{len(held)} held-out designs, {len(base)} 7ac designs", flush=True)
    calls = dict(held=model_call(held), base=model_call(base), **{f"base_b{b}": model_call(base, b) for b in BANDS})
    with Pool() as p:
        resp_held = p.starmap(fly, [(d, law, "step", None) for law in Y.LAWS for d in held], chunksize=1)
    t_a = time.time() - t0; print(f"part A {t_a:.0f} s", flush=True)
    with Pool() as p:
        resp = p.starmap(fly, [(d, law, test, b) for b in (None,) + BANDS for test in Y.TESTS for law in Y.LAWS for d in base],
                         chunksize=1)
    t_r = time.time() - t0 - t_a; print(f"part B response {t_r:.0f} s", flush=True)
    with Pool() as p:
        runs = p.starmap(evaluate, [(law, d, b) for b in BANDS for law in ORDER for d in base], chunksize=1)
    t_s = time.time() - t0 - t_a - t_r
    sfx = "_smoke" if SMOKE else ""
    json.dump(dict(bands=BANDS, held=HELD, laws=U.LAWS, test_ep=M7.TEST_EP, test_seed=M7.TEST_SEED, resp_ep=Y.EP, resp_seed=Y.SEED,
                   calls=calls, resp_held=compact(Y.rnd(resp_held)), resp=compact(Y.rnd(resp)), runs=runs,
                   wall=dict(a=t_a, resp=t_r, stress=t_s)),
              open(os.path.join(HERE, f"results{sfx}.json"), "w"), separators=(",", ":"))
    print(f"wall {time.time() - t0:.0f} s (A {t_a:.0f}, response {t_r:.0f}, stress {t_s:.0f})")
