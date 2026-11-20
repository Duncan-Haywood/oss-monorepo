"""Milestone 7ai: can a builder compute the attitude loop's acceleration lag from the design alone, with no flight?

7ah identified the lag between the commanded and achieved horizontal acceleration from a flown open-outer-loop acceleration step
(63% time, median 182 ms over 7ag's 36 designs) and showed that this lag, put into the point mass, predicts rise within 0.10 s for
36 of 36 designs in every condition. It left two things untraced: about a fifth of the request arrives within 50 ms (read as the
canted rotors' side force, not isolated) and the steady acceleration overshoots a 3.5 m/s^2 request by a median 6%.

This run computes the same step response from `linstab.accel_step` (the 11-state linearised axis of `poshold.rollout`, outer loop
open, x axis = pitch, lam = +lat) for each design with no flight, at the nominal plant and averaged over a 3x3x3 grid of the wide
plant box (the builder knows the range, not the draw), and flies three ablations of 7ah's probe (lever 1, 45 deg tilt limit,
integrator feed-forward, wide plant randomisation, held-out sensor noise, seed 9999, 64 episodes, calm air, 36 ms law):
  base    7ah's flight, unchanged (reproduction check)
  nolat   couple=False: no side force (the feed-forward, which multiplies the same lat, goes with it)
  exact   lean_exact=True: tilt reference arctan(a / g) instead of a / g
at A = 1.0 and 3.5 m/s^2. Per flight and per linear response: the area estimate, the 63% time, the share of the request reached at
50 ms, and a_ss / A (mean of the last 0.5 s), with 7ah's definitions.

Usage: python3 run.py            (SMOKE=1: 8 episodes on seed 4242; never the held-out seed)
"""
import importlib.util, json, os, time, warnings
from multiprocessing import Pool
import numpy as np

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("m7ah", os.path.join(HERE, "..", "m7ah_att_step", "run.py"))
AH = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(AH)
AG, Y = AH.AG, AH.Y
A, P, R, L7, H, M6 = Y.A, Y.P, Y.R, Y.L7, Y.H, Y.M6
from codesign_cant import linstab as LS  # noqa: E402  (path set by the m7y loader)

SMOKE = Y.SMOKE
LAW = "mid 36 ms D^0"
T_ID, SS_WIN, EARLY = AH.T_ID, AH.SS_WIN, 0.05
AMPS = AH.AMPS
VARIANTS = {"base": {}, "nolat": dict(couple=False), "exact": dict(lean_exact=True)}
GRID = [(t, m, l) for t in np.linspace(*A.PLANT_RANGES["wide"]["tau"], 3) for m in np.linspace(*A.PLANT_RANGES["wide"]["mass"], 3)
        for l in np.linspace(*A.PLANT_RANGES["wide"]["lag"], 3)]


def metrics(acc, amp):
    """acc (T, K): achieved acceleration per step for K responses -> per-response area tau, 63% time, share at 50 ms, a_ss / A."""
    k_ss = int(round(SS_WIN / A.DT))
    a_ss = acc[-k_ss:].mean(0)
    frac = acc / a_ss
    t = (np.arange(acc.shape[0]) + 1) * A.DT
    hit = frac >= 1 - np.exp(-1)
    return dict(tau=((1.0 - frac) * A.DT).sum(0), t63=np.where(hit.any(0), t[np.argmax(hit, 0)], np.nan),
                early=acc[int(round(EARLY / A.DT)) - 1] / a_ss, ass=a_ss / amp)


def setup(d):
    A.LAG_K, A.LAG_EXP = Y.LAWS[LAW]
    R.set_closure(d["closure"])
    L7.setup(Y.TILT, d["kp_hi"])
    P.PINT_BAND = AG.BAND
    P.reference = Y.ref_patch(0.0); P.T_WIND_STEP = Y.T_WIND
    P.DEAD_POS = 1e3


def teardown():
    P.reference = Y._REF; P.T_WIND_STEP = 3.0; P.PINT_BAND = None; P.DEAD_POS = 5.0
    L7.setup(); A.LAG_K, A.LAG_EXP = 0.015, 1.5


def linear(d):
    """No flight: the linearised axis's step response at the nominal plant and averaged over GRID (mean response, then metrics)."""
    setup(d)
    try:
        c = M6.cond("aware")
        dp = LS.design_params(np.array(d["x"][:12], float)[None], alpha_max=c["alpha_max"], kappa_per_d=c["kappa_per_d"])
        n = int(round(T_ID / A.DT))
        out = {}
        for amp in AMPS:
            nom = LS.accel_step(dp, amp, n)[0]
            box = np.mean([LS.accel_step(dp, amp, n, t, m, l)[0] for t, m, l in GRID], 0)
            dz = dict(dp, lat=dp["lat"] * 0.0)
            nolat = np.mean([LS.accel_step(dz, amp, n, t, m, l)[0] for t, m, l in GRID], 0)
            for name, a in (("nom", nom), ("box", box), ("box_nolat", nolat)):
                out[f"{name}_{amp:g}"] = {k: float(v[0]) for k, v in metrics(a[:, None], amp).items()}
                out[f"{name}_{amp:g}"]["resp"] = Y.rnd((a / a[-int(round(SS_WIN / A.DT)):].mean())[::5].tolist())
        out["lat"] = float(dp["lat"][0])
    finally:
        teardown()
    return dict(set=d["label"], geom=d["geom"], seed=d["seed"], **out)


def fly(d, var, amp):
    setup(d)
    try:
        x = np.array(d["x"][:12], float)[None]
        c = M6.cond("aware")
        Lm = A.L_RANGE[0] + x[:, 0] * (A.L_RANGE[1] - A.L_RANGE[0])
        D = A.D_RANGE[0] + x[:, 1] * (A.D_RANGE[1] - A.D_RANGE[0])
        alpha = c["alpha_max"] * np.clip(x[:, 2], 0, 1)
        sz = A.size(Lm, D, alpha, kappa_per_d=c["kappa_per_d"], twr=None, actuator="hover")
        kw = dict(couple=c["couple"]); kw.update(VARIANTS[var])
        tr = []
        o = P.rollout(sz, P.phys_gains(x[:, 3:12]), c["kappa_per_d"] * D, Y.EP, Y.SEED, gust_std=0.0, gust_mean=0.0,
                      wind_step=0.0, dist_sign=H.GEOMS[d["geom"]], lever_scale=1.0, ff=1.0, ff_mode="integ",
                      perr_max=L7.perr_of(x, True), trace=tr, steps=int(round(T_ID / A.DT)), acc_cmd=np.array([amp, 0.0]), **kw)
    finally:
        teardown()
    px = np.stack(tr, 0)[:, 0, :, 0]
    px = np.concatenate([np.zeros((2, px.shape[1])), px], 0)
    acc = (px[2:] - 2 * px[1:-1] + px[:-2]) / A.DT ** 2
    m = metrics(acc, amp)
    dead = o["dead_ep"][0]
    return dict(set=d["label"], geom=d["geom"], seed=d["seed"], var=var, amp=amp, dead=int(dead.sum()),
                **{k: np.where(dead, np.nan, v).tolist() for k, v in m.items()},
                mean_resp=Y.rnd(np.nanmean(np.where(dead[None], np.nan, acc / acc[-int(round(SS_WIN / A.DT)):].mean(0)), 1)[::5].tolist()))


if __name__ == "__main__":
    t0 = time.time()
    ds = AG.designs()
    assert len(ds) == 36 or SMOKE, len(ds)
    with Pool() as p:
        lin = p.map(linear, ds, chunksize=1)
        out = p.starmap(fly, [(d, v, a) for a in AMPS for v in VARIANTS for d in ds], chunksize=1)
    sfx = "_smoke" if SMOKE else ""
    json.dump(dict(amps=AMPS, t_id=T_ID, law=LAW, ep=Y.EP, seed=Y.SEED, grid=GRID, linear=Y.rnd(lin), resp=Y.rnd(out),
                   wall=time.time() - t0), open(os.path.join(HERE, f"results{sfx}.json"), "w"), separators=(",", ":"))
    print(f"{len(lin)} linear designs, {len(out)} flights, wall {time.time() - t0:.0f} s")
