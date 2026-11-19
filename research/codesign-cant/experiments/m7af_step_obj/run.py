"""Milestone 7af: does a set-point step in the training objective buy back the rise time that conditional integration costs?

7ad's conditional integration (the position integrator runs only while |error| < b, b = 0.25 m) fixed every unsettled design but
slowed the median rise to 90% of a 1 m step by about 10%; 7ae retrained with the band on and found the tuner does not buy the rise
time back: it drops the integrator (ki/kp 0.057 -> 0.005) and keeps kp. The training objective (gusts with a 3 m/s mean wind,
+-0.5 m start offsets, yaw steps, at levers 0, 1 and 2) never contains a set-point step, so rise time is never asked for.

Here 7ae's training is rerun with one more training condition: a 1 m position step on x in calm air (no turbulence, no yaw
steps, no wind step), lever 1, scored like the other conditions, J = -sqrt((pos / 0.10 m)^2 + (yaw / 10 deg)^2) - lam P / 100 W
with pos the RMS distance from the hold point over the 6 s episode (dead flights at poshold.DEAD_POS), and averaged with the
three lever conditions at equal weight: train score = (3 * mean over levers + J_step) / 4. 6 episodes, the training seed
(M6.TRAIN_SEED + s) and the training plant draw (lag 39.1 ms x U(1, 125/39.1)); the held-out seed 9999 is never used in
training. Everything else is 7ae's (label "aware lag39c125 cint25 step"): band b = 0.25 m on in training, 7ab's patch and train,
closure src_li, 45 deg tilt limit, A_P cap, wide kp box, integrator feed-forward, margin constraint, TWR 2, 3200 CMA-ES
evaluations, 6 seeds x 2 starts x 2 geometries, certificate corners 33, 39.1 and 125 ms, same random stream.
The equal weight is not sourced: it is the plain choice of adding the step as one more condition.

Scoring, as 7ae (band on and off): 7z's held-out stress set (seed 9999, 64 episodes, four capped conditions, eight laws) and 7y's
step, wind3 and wind6 tests (lever 1, 45 deg, calm, seed 9999, 64 episodes, three identified laws). Comparators: 7ac's
"aware lag39c125" (base, from 7ad's results at b = 0.25 m and 7ac's at b = None) and 7ae's "aware lag39c125 cint25" (from 7ae's
results.json); cint25's b = 0.25 m response flights are re-flown here as the reproduction check.
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


AE = _load("m7ae", "m7ae_cint_train")   # 7ae: band training, fly/evaluate with a band; loads 7ad, 7ac, 7ab, ...
AD, AB = AE.AD, AE.AB
Z, X, Y = AE.Z, AE.X, AE.Y
R, M7, U, M6, P = AE.R, AE.M7, AE.U, AE.M6, AE.P
A = X.A
SMOKE = AE.SMOKE
NSEED = AE.NSEED
ORDER = Z.ORDER
BAND = AE.BAND
ARM = "aware lag39c125 cint25 step"
PREV = AE.ARM                           # 7ae's label
STEP_M = 1.0
EP_STEP = M7.EP_PER_LEVER
W_STEP = 1.0                            # weight of the step condition relative to one lever condition
AB.CEILS = {ARM: 0.125}
AB.CACHE = os.path.join(HERE, ".cache_smoke" if SMOKE else ".cache")
_TRAIN_SCORE = M7.train_score


def step_score(xs, s, geom):
    """J of a 1 m step on x in calm air at lever 1 (training seed and plant draw), shaped like poshold.score's J."""
    c = M6.cond("aware")
    Lm = A.L_RANGE[0] + xs[:, 0] * (A.L_RANGE[1] - A.L_RANGE[0])
    D = A.D_RANGE[0] + xs[:, 1] * (A.D_RANGE[1] - A.D_RANGE[0])
    alpha = c["alpha_max"] * np.clip(xs[:, 2], 0, 1)
    sz = A.size(Lm, D, alpha, kappa_per_d=c["kappa_per_d"], twr=None, actuator="hover")
    old = P.reference
    P.reference = Y.ref_patch(STEP_M)
    try:
        o = P.rollout(sz, P.phys_gains(xs[:, 3:12]), c["kappa_per_d"] * D, EP_STEP, M6.TRAIN_SEED + s, gust_std=0.0, gust_mean=0.0,
                      couple=c["couple"], wind_step=0.0, dist_sign=M7.GEOMS[geom], lever_scale=1.0, ff=1.0, ff_mode="integ",
                      perr_max=M7.perr_of(xs, True))
    finally:
        P.reference = old
    C = np.sqrt((o["pos"] / P.POS_SCALE_M) ** 2 + (o["yaw"] / P.YAW_SCALE_DEG) ** 2)
    return np.where(sz["feasible"], -C - 0.03 * sz["power"] / 100.0, -99.0)


def train_score(xs, s, geom):
    n = len(M7.TRAIN_LEVERS)
    return (n * _TRAIN_SCORE(xs, s, geom) + W_STEP * step_score(xs, s, geom)) / (n + W_STEP)


def train(args):
    M7.train_score = train_score   # train_one looks the name up at call time
    try:
        return AE.train(args)
    finally:
        M7.train_score = _TRAIN_SCORE


def check_step():
    """The step condition reaches the training score and is a real step: one fixed design, its step J and its trace."""
    x = np.array([0.5] * 12)[None]
    R.set_closure("src_li"); AB.patch(0.125); M7.setup(M7.TRAIN_TILT, M7.KP_HI_WIDE)
    P.PINT_BAND = BAND
    j0 = float(_TRAIN_SCORE(x, 0, "above")[0]); js = float(step_score(x, 0, "above")[0]); jt = float(train_score(x, 0, "above")[0])
    P.PINT_BAND = None; M7.setup(); AB.patch(None)
    assert js < j0 and abs(jt - (3 * j0 + js) / 4) < 1e-9, (j0, js, jt)
    return f"step check: x=0.5 seed 0 'above', b = {BAND} m: lever-mean J {j0:.4f}, step J {js:.4f}, train score {jt:.4f}"


def fly(d, law, test, band):
    return AE.fly(d, law, test, band)


def evaluate(law, d, band):
    return AE.evaluate(law, d, band)


def designs(label, src):
    return [d for d in json.load(open(os.path.join(HERE, "..", src, "results.json")))["designs"] if d["label"] == label]


if __name__ == "__main__":
    t0 = time.time()
    pc = AB.check_patch(); print(pc, flush=True)
    sc = check_step(); print(sc, flush=True)
    jobs = [(ARM, g, s, k) for g in R.GEOMS for s in range(NSEED) for k in range(len(M6.STARTS))]
    with Pool() as p:
        tr = p.map(train, jobs, chunksize=1)
    t_train = time.time() - t0
    new = []
    for g in R.GEOMS:
        for s in range(NSEED):
            b = max((t for t in tr if t[1] == g and t[2] == s), key=lambda t: t[4])
            new.append(dict(label=ARM, closure="src_li", geom=g, seed=s, x=b[5], kp_hi=M7.KP_HI_WIDE, emax=None))
    prev = designs(PREV, "m7ae_cint_train")
    calls = dict(new=AD.model_call(new), new_b=AD.model_call(new, BAND))
    with Pool() as p:
        resp = p.starmap(fly, [(d, law, test, b) for b in (None, BAND) for test in Y.TESTS for law in Y.LAWS for d in new]
                         + [(d, law, test, BAND) for test in Y.TESTS for law in Y.LAWS for d in prev], chunksize=1)
    t_r = time.time() - t0 - t_train; print(f"response {t_r:.0f} s", flush=True)
    with Pool() as p:
        runs = p.starmap(evaluate, [(law, d, b) for b in (None, BAND) for law in ORDER for d in new], chunksize=1)
    t_s = time.time() - t0 - t_train - t_r
    sfx = "_smoke" if SMOKE else ""
    json.dump(dict(band=BAND, arm=ARM, w_step=W_STEP, ep_step=EP_STEP, checks=[pc, sc], laws=U.LAWS, budget=R.BUDGET,
                   test_ep=M7.TEST_EP, test_seed=M7.TEST_SEED, resp_ep=Y.EP, resp_seed=Y.SEED,
                   train=[dict(arm=t[0], geom=t[1], seed=t[2], start=t[3], best=t[4], x=t[5], rejected=t[6]) for t in tr],
                   designs=new, calls=calls, resp=AD.compact(Y.rnd(resp)), runs=runs,
                   wall=dict(train=t_train, resp=t_r, stress=t_s)),
              open(os.path.join(HERE, f"results{sfx}.json"), "w"), separators=(",", ":"))
    print(f"wall {time.time() - t0:.0f} s (train {t_train:.0f}, response {t_r:.0f}, stress {t_s:.0f})")
