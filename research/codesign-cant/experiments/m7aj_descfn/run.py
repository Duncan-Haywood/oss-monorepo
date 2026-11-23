"""Milestone 7aj: a describing function of the tilt-command limit, against the flights it is meant to explain.

Milestones 7d and 12g found that designs past their integral-gain ceiling fly at a 20 deg tilt-command limit only as a bounded
oscillation against that limit, and diverge once it is raised. Here the clip on the tilt reference is replaced by its
describing function (the first-harmonic gain of a saturation, Gelb and Vander Velde 1968)

    N(r) = (2 / pi) (asin(1 / r) + (1 / r) sqrt(1 - 1 / r^2)),   r = A / delta > 1,

inside the 11-state linear map of `linstab` (key `nsat`). For each of milestone 12g's 40 `above` design-conditions, each of the
64 held-out plants (seed 9999) and both axes:

  rho(1) < 1                 no limit cycle (the hover equilibrium is locally stable)
  otherwise                  N* = the largest nsat < 1 with rho < 1 (grid, then bisection); none: "no LC"
                             lambda* = the critical eigenvalue, f* = |arg lambda*| / (2 pi DT); r* solves N(r*) = N*
                             eigenvector v -> tilt amplitude a_th = delta r* |v_th| / |u(v)| and attitude-command amplitude
                             a_tau = delta r* |u_att(v)| / |u(v)|, u = ab / g the clip's input, u_att the share of tau_max
                             that `rollout` clips at +-1 before the mixer.

Both amplitudes are proportional to delta, so each (flight, axis) has one critical tilt limit per death criterion:
C-tilt (a_th >= 60 deg, the simulator's divergence angle) and C-torque (a_tau >= 1). "No LC" dies at any limit.
Measured: `rollout(trace_tilt=...)`, lever 0, 18 s, caps 20 and 30 deg, amplitude sqrt(2) std(theta) and the largest FFT peak
(0.2-40 Hz, theta sampled every 5 steps) over t = 9-18 s, per surviving flight and body axis. Deaths at 20/30/45/59 deg are
12g's stored tilt sweep; the reruns at 20 and 30 must equal it.
Predictions DJ0-DJ8 in ../../LOG.md, committed before this file was written.
"""
import json, os, sys, time, warnings
from multiprocessing import Pool
import numpy as np

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..")
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from codesign_cant import aero as A, linstab as S, poshold as P  # noqa: E402

TEST_EP, TEST_SEED, KAPPA = 64, 9999, 0.081
AMAX = np.deg2rad(80.0)
SETS = {"6b+integ": "bolted", "6b+integ, ki 1.25x ceiling": "1.25x", "6b+integ, ki 0.8x ceiling": "0.8x", "integ retrained": "retrained"}
DEAD_TILT = np.deg2rad(60.0)
STEPS18 = 3 * P.STEPS
T0 = 9.0                       # s: start of the measurement window
SUB = 5                        # keep every 5th step (100 Hz) for the spectrum
GRID = np.geomspace(1.0, 1e-3, 400)


def conditions():
    d = json.load(open(os.path.join(EXP, "m12g_ten_seeds_7c7d", "results.json")))
    cs = [c for c in d["conds"] if c["geom"] == "above" and c["label"] in SETS]
    cs = sorted(cs, key=lambda c: (list(SETS).index(c["label"]), c["seed"]))
    return cs, d["m7d"]


def axis_params(c, pl, sign):
    """`linstab.step` parameters for one design-condition at the 64 held-out plants, one axis (as `m7d_clip.linear_death`)."""
    dp = S.design_params(np.array([c["x"]]), ki_scale=c["ki_scale"])
    q = lambda v: float(np.asarray(v, float)[0])
    return dict(kp=q(dp["kp"]), kd=q(dp["kd"]), ki=q(dp["ki"]), kpp=q(dp["kpp"]), kdp=q(dp["kdp"]), kip=q(dp["kip"]),
                lam=sign * q(dp["lat"]), tmax=q(dp["tmax"]), I=q(dp["I0"]) * pl["mass"], m=q(dp["m_nom"]) * pl["mass"],
                m_nom=q(dp["m_nom"]), lag=q(dp["lag_nom"]) * pl["lag"], lag_nom=q(dp["lag_nom"]), tau_s=pl["tau"], ff=c["ff"],
                mode=c["mode"], b_ff=q(dp["b_ff"]))


def probes(x, d):
    """The clip's input u = ab / g and the attitude command u_att (share of tau_max) inside one `linstab.step` from state x,
    copied from its first lines (linear in x, so they apply to a complex eigenvector)."""
    p, w, pint, th, thp, om, omp, integ, tq, tqh, fff = (x[..., k] for k in range(S.NX))
    ep, ev = -p, w
    pint = pint + ep * A.DT
    acc = d["kpp"] * ep - d["kdp"] * ev + d["kip"] * pint
    if d["mode"] == "integ":
        fff = d["lam"] * d["ki"] * integ * d["tmax"]
    ab = acc - d["ff"] * fff / d["m_nom"]
    u = ab / A.G
    e = d.get("nsat", 1.0) * u - thp
    integ = integ + e * A.DT
    return u, d["kp"] * e - d["kd"] * omp + d["ki"] * integ


def df_gain(r):
    r = np.asarray(r, float)
    ir = 1.0 / np.maximum(r, 1.0)
    return np.where(r <= 1.0, 1.0, (2 / np.pi) * (np.arcsin(ir) + ir * np.sqrt(1 - ir * ir)))


def df_inverse(N):
    """r > 1 with N(r) = N (N in (0, 1)); bisection on log r."""
    N = np.asarray(N, float)
    lo, hi = np.zeros_like(N), np.full_like(N, 12.0)        # log r; N(e^12) ~ 8e-6
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        big = df_gain(np.exp(mid)) > N
        lo, hi = np.where(big, mid, lo), np.where(big, hi, mid)
    return np.exp(0.5 * (lo + hi))


def rho_at(d, n):
    q = dict(d); q["nsat"] = n
    return np.abs(np.linalg.eigvals(S.matrix(q, (TEST_EP,)))).max(-1)


def analyse_axis(d):
    """Per plant (64): rho at nsat 1, N*, lc flag (0 linear-stable, 1 stable oscillatory LC, 2 real crossing, 3 no LC),
    f*, r*, per-delta tilt and torque-command amplitudes (a_th / delta, a_tau / delta), and rho just below N*."""
    rho1 = rho_at(d, 1.0)
    E = TEST_EP
    rho = np.stack([rho_at(d, n) for n in GRID], 0)          # (G, E)
    stable = rho < 1.0
    k = np.where(stable[1:].any(0), stable[1:].argmax(0) + 1, -1)     # first grid point below 1 that is stable
    lo = np.where(k > 0, GRID[np.maximum(k, 0)], np.nan)
    hi = np.where(k > 0, GRID[np.maximum(k - 1, 0)], np.nan)
    for _ in range(40):                                        # bisect each plant's crossing, vectorised over plants
        mid = 0.5 * (lo + hi)
        ok = rho_at(d, np.where(np.isnan(mid), 1.0, mid)) < 1.0
        lo, hi = np.where(ok, mid, lo), np.where(ok, hi, mid)
    Nst = hi
    q = dict(d); q["nsat"] = np.where(np.isnan(Nst), 1.0, Nst)
    M = S.matrix(q, (E,))
    lam, V = np.linalg.eig(M)
    j = np.abs(lam).argmax(-1)
    lst = lam[np.arange(E), j]; v = V[np.arange(E), :, j]
    u, ua = probes(v, q)
    r = df_inverse(np.where(np.isnan(Nst), 0.5, Nst))
    a_th = r * np.abs(v[:, 3]) / np.abs(u)
    a_tau = r * np.abs(ua) / np.abs(u)
    f = np.abs(np.angle(lst)) / (2 * np.pi * A.DT)
    rho_below = rho_at(q, q["nsat"] * 0.999)
    lc = np.where(rho1 < 1.0, 0, np.where(k < 0, 3, np.where(np.abs(np.angle(lst)) < 1e-9, 2, 1)))
    return dict(rho1=rho1, N=Nst, lc=lc, f=f, r=r, a_th=a_th, a_tau=a_tau, rho_below=rho_below)


def predict(conds):
    pl = A.plant_draw("wide", TEST_EP, TEST_SEED)
    out = []
    for c in conds:
        ax = {}
        for name, sign in (("roll", -1.0), ("pitch", 1.0)):
            ax[name] = analyse_axis(axis_params(c, pl, sign))
        out.append(ax)
    return out


class Spec:
    """A list stand-in for `rollout(trace_tilt=...)`: keeps the roll/pitch angle every SUB-th step from T0 on."""
    def __init__(self, k0):
        self.k0, self.t, self.rows = k0, 0, []

    def append(self, a):
        if self.t >= self.k0 and (self.t - self.k0) % SUB == 0:
            self.rows.append(a[:, :, :2].copy())
        self.t += 1


def sizes(conds):
    x = np.array([c["x"][:12] for c in conds], float)
    L = A.L_RANGE[0] + x[:, 0] * (A.L_RANGE[1] - A.L_RANGE[0]); D = A.D_RANGE[0] + x[:, 1] * (A.D_RANGE[1] - A.D_RANGE[0])
    sz = A.size(L, D, AMAX * np.clip(x[:, 2], 0, 1), kappa_per_d=KAPPA, actuator="hover")
    g = P.phys_gains(x[:, 3:12]); g[:, 2] *= np.array([c["ki_scale"] for c in conds])
    return sz, g, KAPPA * D


def fly(arg):
    cap, lo, hi = arg
    conds = conditions()[0][lo:hi]
    P.TILT_CMD_MAX = np.deg2rad(cap)                         # module constant read by rollout at call time; this worker only
    sz, g, kap = sizes(conds)
    sp = Spec(int(round(T0 / A.DT)))
    o = P.rollout(sz, g, kap, TEST_EP, TEST_SEED, dist_sign=P.cop_signs(1.0), lever_scale=0.0, ff=1.0, ff_mode="integ",
                  steps=STEPS18, trace_tilt=sp)
    th = np.stack(sp.rows, 0).astype(float)                  # (T, N, E, 2)
    alive = ~o["dead_ep"]
    thd = th - th.mean(0)
    amp = np.sqrt(2.0) * thd.std(0)                         # (N, E, 2)
    F = np.abs(np.fft.rfft(np.nan_to_num(thd), axis=0))
    fr = np.fft.rfftfreq(th.shape[0], SUB * A.DT)
    band = (fr >= 0.2) & (fr <= 40.0)
    fpk = fr[band][F[band].argmax(0)]
    amp = np.where(alive[:, :, None], amp, np.nan); fpk = np.where(alive[:, :, None], fpk, np.nan)
    return dict(cap=cap, lo=lo, dead=o["dead_ep"].astype(int).tolist(), amp=amp.tolist(), f=fpk.tolist(), att=np.asarray(o["att"]).tolist())


def main():
    t0 = time.time()
    conds, m7d = conditions()
    assert len(conds) == 40 and [SETS[c["label"]] for c in conds] == [m["set"] for m in m7d["conds"]]
    with Pool(4) as p:
        flown = p.map(fly, [(cap, lo, lo + 10) for cap in (20.0, 30.0) for lo in range(0, 40, 10)], chunksize=1)
    pred = predict(conds)
    meas = {}
    for cap in (20.0, 30.0):
        rows = sorted([f for f in flown if f["cap"] == cap], key=lambda f: f["lo"])
        meas[cap] = {k: sum((r[k] for r in rows), []) for k in ("dead", "amp", "f", "att")}
    stored = {(t["cap"], t["hz"]): t for t in m7d["tilt"]}
    ser = lambda a, nd=6: np.where(np.isfinite(a), np.round(a, nd), -1.0).tolist()   # rho1 at full precision (DJ0 compares it to 1e-12)
    json.dump(dict(test_ep=TEST_EP, test_seed=TEST_SEED, grid=[float(GRID[0]), float(GRID[-1]), len(GRID)],
                   conds=[dict(set=SETS[c["label"]], seed=c["seed"], ki_scale=c["ki_scale"]) for c in conds],
                   pred=[{a: {k: ser(np.asarray(v, float), 17 if k == "rho1" else 6) for k, v in ax[a].items()} for a in ax} for ax in pred],
                   meas={str(int(k)): v for k, v in meas.items()},
                   stored_dead={f"{int(c)}_{h}": stored[(c, h)]["dead"] for (c, h) in stored},
                   stored_rho_ep=[c["rho_ep"] for c in conds], wall_s=time.time() - t0),
              open(os.path.join(HERE, "results.json"), "w"))
    print(f"wall time {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
