"""Milestone 7ah: does the point mass's acceleration lag, read off a flown acceleration step, predict rise without a position fit?

7ag found, post hoc, that a first-order lag tau between the commanded and achieved horizontal acceleration closes most of the
point mass's misses (A_P = 8 m/s^2 from 23 to 33 of 36 designs within 0.10 s; the 0.5 m step from 31 to 36), but tau = 135 ms was
fitted on the in-sample position step. A builder needs tau from a test that does not already contain the answer.

Here each of 7ag's 36 designs is flown with the position loop open: from hover at rest, the horizontal acceleration request is
stepped to A m/s^2 along x (poshold.rollout(acc_cmd=...)), and the achieved acceleration a(t) (second difference of the
simulated position) is recorded for 2 s. Everything else is 7ag's step test (lever 1, 45 deg tilt limit, integrator
feed-forward, wide plant randomisation, held-out sensor noise, seed 9999, 64 episodes, calm air, band 0.25 m, which is inert here),
under the three identified laws (33, 36, 39.1 ms D^0), at A = 1.0 m/s^2 (small signal) and A = 3.5 m/s^2 (7ag's in-sample cap).

The identified lag is the area estimate tau = integral_0^T (1 - a(t) / a_ss) dt, the first moment of the step response's
deficit (exact for a first-order lag, and the mean delay of any stable response), a_ss = mean of a over the last 0.5 s,
per episode, then the median over episodes per design. Also stored: the 63% time and the 10-90% rise of a(t).
The predictions (verdicts.py) use posthoc.lagged from 7ag with these tau, scored against 7ag's flown rise times, unchanged.

Usage: python3 run.py            (SMOKE=1: 8 episodes on seed 4242; never the held-out seed)
"""
import importlib.util, json, os, sys, time, warnings
from multiprocessing import Pool
import numpy as np

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, sub):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, "..", sub, "run.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


AG = _load("m7ag", "m7ag_cruise")
AE, AD, Y = AG.AE, AG.AD, AG.Y
A, P, R, L7, H, M6 = Y.A, Y.P, Y.R, Y.L7, Y.H, Y.M6
SMOKE = Y.SMOKE
T_ID = 2.0                 # s of open-outer-loop flight
AMPS = (1.0, 3.5)          # m/s^2 acceleration request steps
SS_WIN = 0.5               # s: steady-state window at the end


def fly(d, law, amp):
    A.LAG_K, A.LAG_EXP = Y.LAWS[law]
    R.set_closure(d["closure"])
    L7.setup(Y.TILT, d["kp_hi"])
    P.PINT_BAND = AG.BAND
    P.reference = Y.ref_patch(0.0); P.T_WIND_STEP = Y.T_WIND
    P.DEAD_POS = 1e3          # the open outer loop travels 0.5 A T^2 (7 m at 3.5 m/s^2); only a tilt past 60 deg counts as dead
    try:
        x = np.array(d["x"][:12], float)[None]
        c = M6.cond("aware")
        Lm = A.L_RANGE[0] + x[:, 0] * (A.L_RANGE[1] - A.L_RANGE[0])
        D = A.D_RANGE[0] + x[:, 1] * (A.D_RANGE[1] - A.D_RANGE[0])
        alpha = c["alpha_max"] * np.clip(x[:, 2], 0, 1)
        sz = A.size(Lm, D, alpha, kappa_per_d=c["kappa_per_d"], twr=None, actuator="hover")
        tr = []
        n = int(round(T_ID / A.DT))
        o = P.rollout(sz, P.phys_gains(x[:, 3:12]), c["kappa_per_d"] * D, Y.EP, Y.SEED, gust_std=0.0, gust_mean=0.0,
                      couple=c["couple"], wind_step=0.0, dist_sign=H.GEOMS[d["geom"]], lever_scale=1.0, ff=1.0, ff_mode="integ",
                      perr_max=L7.perr_of(x, True), trace=tr, steps=n, acc_cmd=np.array([amp, 0.0]))
    finally:
        P.reference = Y._REF; P.T_WIND_STEP = 3.0; P.PINT_BAND = None; P.DEAD_POS = 5.0
        L7.setup(); A.LAG_K, A.LAG_EXP = 0.015, 1.5
    px = np.stack(tr, 0)[:, 0, :, 0]                       # (T, E) x position, from rest at 0
    px = np.concatenate([np.zeros((2, px.shape[1])), px], 0)
    acc = (px[2:] - 2 * px[1:-1] + px[:-2]) / A.DT ** 2     # achieved x acceleration at each step (T, E)
    k_ss = int(round(SS_WIN / A.DT))
    a_ss = acc[-k_ss:].mean(0)
    frac = acc / a_ss
    tau = ((1.0 - frac) * A.DT).sum(0)                     # area estimate of the equivalent first-order lag
    t = (np.arange(acc.shape[0]) + 1) * A.DT

    def first(th):
        hit = frac >= th
        return np.where(hit.any(0), t[np.argmax(hit, 0)], np.nan)

    dead = o["dead_ep"][0]
    nanif = lambda v: np.where(dead, np.nan, v).tolist()
    return dict(set=d["label"], geom=d["geom"], seed=d["seed"], law_name=law, amp=amp, dead=int(dead.sum()),
                tau=nanif(tau), t63=nanif(first(1 - np.exp(-1))), r1090=nanif(first(0.9) - first(0.1)),
                a_ss=nanif(a_ss), peak=nanif(frac.max(0)),
                mean_resp=Y.rnd(np.nanmean(np.where(dead[None], np.nan, frac), 1)[::5].tolist()))


if __name__ == "__main__":
    t0 = time.time()
    ds = AG.designs()
    assert len(ds) == 36 or SMOKE, len(ds)
    with Pool() as p:
        out = p.starmap(fly, [(d, law, a) for a in AMPS for law in Y.LAWS for d in ds], chunksize=1)
    sfx = "_smoke" if SMOKE else ""
    json.dump(dict(amps=AMPS, t_id=T_ID, laws=list(Y.LAWS), ep=Y.EP, seed=Y.SEED, resp=Y.rnd(out), wall=time.time() - t0),
              open(os.path.join(HERE, f"results{sfx}.json"), "w"), separators=(",", ":"))
    print(f"{len(out)} flights, wall {time.time() - t0:.0f} s")
