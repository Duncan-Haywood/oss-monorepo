"""Milestone 7ae: does training with conditional integration on buy back the rise time that 7ad's after-the-fact fix cost?

7ad found that the co-designed tunes that never settle on a 1 m step owe it to the position integrator's slow pole, and that
conditional integration (the position integrator runs only while |error| < b) at b = 0.25 m fixes every one of them on 7ac's
72 designs, at no cost in crashes, but slows the median rise to 90% of the step by about 10% (1.74 -> 1.91 s): the fix was
applied after training, so the tuner never had the chance to raise kp to make up for the integrator's missing push.

Here 7ac's 125 ms-ceiling training (7ab's patch and train: arm "aware src_li", closure src_li, 45 deg tilt limit, A_P cap, wide kp
box, integrator feed-forward, margin constraint, TWR 2, 3200 CMA-ES evaluations, 6 seeds x 2 starts x 2 geometries, plant lag
39.1 ms x U(1, 125/39.1), certificate corners 33, 39.1 and 125 ms) is rerun with poshold.PINT_BAND = 0.25 m during training
(label "aware lag39c125 cint25"). Same random stream, so tau and mass draws are 7ac's. The band is not sourced: it is 7ad's.
Scoring, with the band on and off: 7z's held-out stress set (seed 9999, 64 episodes, four capped conditions, eight laws) and 7y's
step, wind3 and wind6 response tests (lever 1, 45 deg, calm, seed 9999, 64 episodes, three identified laws). Comparator: 7ac's
"aware lag39c125" designs, whose b = 0.25 and b = None scores are in 7ad's and 7ac's results.json; their b = 0.25 response
tests are re-flown here as the reproduction check.
Predictions in ../../LOG.md, committed before the full-budget run.

Usage: python3 run.py            (SMOKE=1: 64 evaluations, 2 seeds, 8 test episodes on seed 4242, never the held-out seed)
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


AD = _load("m7ad", "m7ad_settle")    # 7ad: its fly/evaluate with a band, model calls; loads 7ac, 7ab, 7aa, 7z, 7x, 7y
AC = AD.AC
AB = AC.AB
Z, X, Y = AD.Z, AD.X, AD.Y
R, M7, U, M6, P = AD.R, AD.M7, AD.U, AD.M6, AD.P
SMOKE = AD.SMOKE
NSEED = AD.NSEED
ORDER = Z.ORDER
BAND = 0.25
ARM = "aware lag39c125 cint25"
AB.CEILS = {ARM: 0.125}
AB.CACHE = os.path.join(HERE, ".cache_smoke" if SMOKE else ".cache")


def train(args):
    P.PINT_BAND = BAND   # read by poshold's rollout at call time, so P.score inside CMA-ES trains with the band on
    try:
        return AB.train(args)
    finally:
        P.PINT_BAND = None


def check_band():
    """The band reaches the training score: one fixed design scored with and without it must differ."""
    x = np.array([0.5] * 12)[None]
    R.set_closure("src_li"); AB.patch(0.125)
    j = []
    for b in (None, BAND):
        P.PINT_BAND = b
        j.append(float(np.mean(P.score(x, 4, 4242, lever_scale=1.0, ff=1.0, ff_mode="integ", **M6.cond("aware"))[0])))
    P.PINT_BAND = None; AB.patch(None)
    assert j[0] != j[1], j
    return f"band check: training score of x=0.5 (4 episodes, seed 4242) {j[0]:.4f} without band, {j[1]:.4f} with b = {BAND} m"


def fly(d, law, test, band):
    return AD.fly(d, law, test, band)


def evaluate(law, d, band):
    return AD.evaluate(law, d, band)


def base_designs():
    return [d for d in AD.designs_7ac() if d["label"] == "aware lag39c125"]


if __name__ == "__main__":
    t0 = time.time()
    pc = AB.check_patch(); print(pc, flush=True)
    bc = check_band(); print(bc, flush=True)
    jobs = [(ARM, g, s, k) for g in R.GEOMS for s in range(NSEED) for k in range(len(M6.STARTS))]
    with Pool() as p:
        tr = p.map(train, jobs, chunksize=1)
    t_train = time.time() - t0
    new = []
    for g in R.GEOMS:
        for s in range(NSEED):
            b = max((t for t in tr if t[1] == g and t[2] == s), key=lambda t: t[4])
            new.append(dict(label=ARM, closure="src_li", geom=g, seed=s, x=b[5], kp_hi=M7.KP_HI_WIDE, emax=None))
    base = base_designs()
    calls = dict(new=AD.model_call(new), new_b=AD.model_call(new, BAND), base=AD.model_call(base), base_b=AD.model_call(base, BAND))
    with Pool() as p:
        resp = p.starmap(fly, [(d, law, test, b) for b in (None, BAND) for test in Y.TESTS for law in Y.LAWS for d in new]
                         + [(d, law, test, BAND) for test in Y.TESTS for law in Y.LAWS for d in base], chunksize=1)
    t_r = time.time() - t0 - t_train; print(f"response {t_r:.0f} s", flush=True)
    with Pool() as p:
        runs = p.starmap(evaluate, [(law, d, b) for b in (None, BAND) for law in ORDER for d in new], chunksize=1)
    t_s = time.time() - t0 - t_train - t_r
    sfx = "_smoke" if SMOKE else ""
    json.dump(dict(band=BAND, arm=ARM, checks=[pc, bc], laws=U.LAWS, budget=R.BUDGET, test_ep=M7.TEST_EP, test_seed=M7.TEST_SEED,
                   resp_ep=Y.EP, resp_seed=Y.SEED,
                   train=[dict(arm=t[0], geom=t[1], seed=t[2], start=t[3], best=t[4], x=t[5], rejected=t[6]) for t in tr],
                   designs=new, calls=calls, resp=AD.compact(Y.rnd(resp)), runs=runs,
                   wall=dict(train=t_train, resp=t_r, stress=t_s)),
              open(os.path.join(HERE, f"results{sfx}.json"), "w"), separators=(",", ":"))
    print(f"wall {time.time() - t0:.0f} s (train {t_train:.0f}, response {t_r:.0f}, stress {t_s:.0f})")
