"""Milestone 7l: train at the tilt limit you fly (45 deg), with and without milestone 7k's cap on the proportional request,
and with the position-gain box widened. Does the tuner then move position kp off the 10 s^-2 edge every earlier design sits on?

Milestone 7j traced the 45-deg crashes of designs tuned at a 20-deg tilt-command limit to the opening transient (kp at the top
of its box asks a ~27-deg lean to close the 0.5 m start offset) and advised "tune at the limit you fly". Milestone 7k found a
controller-side fix instead: bound the proportional position request at the lean the tune saw. This milestone retrains.

Arms (all at tilt-command limit 45 deg, PX4's MPC_TILTMAX_AIR default; everything else is milestone 7e's training exactly:
lever-1 objective, 16 episodes, integrator feed-forward, ki <= ceiling / 1.25 as a constraint, thrust-to-weight 2,
3200 CMA-ES evaluations, 6 seeds, 2 starts, both rigid geometries):
  t45            no cap; kp box 0.1-10 s^-2 (inherited)
  t45 cap        the proportional request |kp * e| bounded at A_P = 3.5 m/s^2 (7k's 0.35 m x kp 10, about the 20-deg lean,
                 g tan 20 deg = 3.57 m/s^2), as a per-design position-error clip perr = A_P / kp; kp box inherited
  t45 cap wide   the same cap, kp box widened to 0.1-31.6 s^-2 (log10 upper bound 1.0 -> 1.5); the CMA-ES start (unit 0.5)
                 then maps to kp 1.78 rather than 1.0
Baseline, re-scored by the same function: milestone 7e's constrained designs (`7e`, trained at 20 deg, no cap).
Held-out: 64 episodes (seed 9999), side force on, levers 0, 1, 2, tilt limits 20, 30, 45 deg, each with no cap and with the
A_P cap at evaluation; plus 45 deg at a 1.0 m start offset (levers 0 and 1), no cap and cap.
Predictions L1-L8 in ../../LOG.md, written and committed before this was run at full budget.
"""
import importlib.util, json, os, sys, time, warnings
from multiprocessing import Pool
import numpy as np
import cma

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m6_poshold"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import run as M6  # noqa: E402  (milestone 6: constants, cond(), the CMA-ES settings)
from codesign_cant import aero as A, linstab as S  # noqa: E402

_spec = importlib.util.spec_from_file_location("m7h", os.path.join(HERE, "..", "m7h_twr", "run.py"))
H = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(H)   # 7h: margin_rho, GEOMS (no side effects on import)

P = M6.P
GEOMS = H.GEOMS
A_P = 3.5                       # m/s^2: bound on the proportional request (milestone 7k's 0.35 m x 10 s^-2)
TRAIN_TILT = 45.0
KP_HI_INHERITED, KP_HI_WIDE = 1.0, 1.5     # log10 upper bound on position kp
ARMS = {"t45": dict(cap=False, kp_hi=KP_HI_INHERITED), "t45 cap": dict(cap=True, kp_hi=KP_HI_INHERITED),
        "t45 cap wide": dict(cap=True, kp_hi=KP_HI_WIDE)}
LEVERS = (0.0, 1.0, 2.0)
TILTS = (20.0, 30.0, 45.0)
OFFSET_BIG = 1.0
SMOKE = os.environ.get("SMOKE") == "1"
BUDGET = 64 if SMOKE else M6.BUDGET
SEEDS = 2 if SMOKE else M6.SEEDS
TRAIN_EP = 4 if SMOKE else M6.TRAIN_EP
TEST_EP = 8 if SMOKE else M6.TEST_EP
TEST_SEED = 4242 if SMOKE else M6.TEST_SEED   # the smoke run never touches the held-out seed
DEFAULTS = dict(tilt=P.TILT_CMD_MAX, pos_hi=P.POS_HI.copy(), offset=P.OFFSET)
CACHE = os.path.join(HERE, ".cache_smoke" if SMOKE else ".cache")


def setup(tilt_deg=None, kp_hi=KP_HI_INHERITED, offset=None):
    """Module constants read by poshold at call time; this worker process only."""
    P.TILT_CMD_MAX = DEFAULTS["tilt"] if tilt_deg is None else np.deg2rad(tilt_deg)
    hi = DEFAULTS["pos_hi"].copy(); hi[0] = kp_hi; P.POS_HI = hi
    P.OFFSET = DEFAULTS["offset"] if offset is None else offset


def perr_of(x12, cap):
    """Per-design position-error clip that bounds |kp e| at A_P, shaped to broadcast over (N, E, 1); None without the cap."""
    if not cap:
        return None
    kp = P.phys_gains(np.atleast_2d(x12)[:, 3:12])[:, 6]
    return (A_P / kp)[:, None, None]


def train_one(arm, geom, s, k):
    cfg = ARMS[arm]
    setup(TRAIN_TILT, cfg["kp_hi"])
    x0 = [0.5] * 12; x0[2] = M6.STARTS[k]
    es = cma.CMAEvolutionStrategy(x0, 0.25, {"bounds": [0, 1], "seed": 100 * (s + 1) + k, "popsize": 16, "verbose": -9})
    best, bx, n, ninf = -1e9, None, 0, 0
    while n < BUDGET:
        xs = np.array(es.ask())
        rho = H.margin_rho(xs, np.full(len(xs), A.TWR))
        ok = rho < 1.0
        ys = -100.0 - 10.0 * np.minimum(rho - 1.0, 10.0)
        if ok.any():
            ys[ok] = P.score(xs[ok], TRAIN_EP, M6.TRAIN_SEED + s, dist_sign=GEOMS[geom], ff=1.0, ff_mode="integ",
                             perr_max=perr_of(xs[ok], cfg["cap"]), **M6.cond("aware"))[0]
        n += len(xs); ninf += int((~ok).sum()); es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best: best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    setup()
    return arm, geom, s, k, float(best), bx.tolist(), ninf


def one(args):
    arm, geom, s, k = args
    f = os.path.join(CACHE, f"{arm.replace(' ', '_')}_{geom}_{s}_{k}.json")
    if os.path.exists(f):
        return tuple(json.load(open(f)))
    out = train_one(arm, geom, s, k)
    os.makedirs(CACHE, exist_ok=True)
    json.dump(list(out), open(f + ".tmp", "w")); os.replace(f + ".tmp", f)
    print(f"trained {arm} {geom} seed {s} start {k}: best {out[4]:.3f}", flush=True)
    return out


def conditions():
    c = [(t, lev, cap, None) for t in TILTS for lev in LEVERS for cap in (False, True)]
    return c + [(45.0, lev, cap, OFFSET_BIG) for lev in (0.0, 1.0) for cap in (False, True)]


def tag(t, lev, cap, off):
    return f"{t:g}_{lev:g}_{'cap' if cap else 'base'}" + ("_off1" if off else "")


def evaluate(label, geom, s, x12, kp_hi):
    x = np.array(x12, float)[None]
    r = dict(label=label, geom=geom, seed=s, x=list(x12), kp_hi=kp_hi)
    for t, lev, cap, off in conditions():
        setup(t, kp_hi, off)
        J, sz, o = P.score(x, TEST_EP, TEST_SEED, parts=True, dist_sign=GEOMS[geom], lever_scale=lev, ff=1.0, ff_mode="integ",
                           perr_max=perr_of(x, cap), **M6.cond("aware"))
        k = tag(t, lev, cap, off)
        C = -float(J[0]) - 0.03 * float(sz["power"][0]) / 100.0
        r.update({f"J_{k}": float(J[0]), f"C_{k}": C, f"pos_{k}": float(o["pos"][0]), f"dead_{k}": int(round(float(o["dead"][0]) * TEST_EP))})
    setup(None, kp_hi)
    g = P.phys_gains(x[:, 3:12])
    dp = S.design_params(x, twr=A.TWR, tau_ff=P.TAU_FF)
    r.update(alpha_deg=float(np.rad2deg(sz["alpha"][0])), power=float(sz["power"][0]), mass=float(sz["mass"][0]),
             att_kp=float(g[0, 0]), pos_kp=float(g[0, 6]), pos_kd=float(g[0, 7]), pos_ki=float(g[0, 8]),
             rho=float(S.worst_radius(dp, 1.0, "integ")[0]))
    setup()
    return r


def summarise(out, train, labels):
    Ls = [f"Milestone 7l: retrained at a {TRAIN_TILT:g} deg tilt-command limit; cap = proportional request |kp e| <= {A_P} m/s^2 (perr = A_P / kp per design).",
          f"{SEEDS} seeds, best of {len(M6.STARTS)} CMA-ES starts x {BUDGET} evaluations on {TRAIN_EP} episodes (lever 1); held-out {TEST_EP} episodes (seed {TEST_SEED}), side force on.",
          "7e = milestone 7e's constrained designs (trained at 20 deg, no cap). C = held-out composite cost (J without the power term); dead = diverged flights, summed (per seed).",
          "Paired differences are against 7e under the same condition.", ""]
    for geom in GEOMS:
        base = sorted((r for r in out if r["geom"] == geom and r["label"] == "7e"), key=lambda r: r["seed"])
        for lab in labels:
            rs = sorted((r for r in out if r["geom"] == geom and r["label"] == lab), key=lambda r: r["seed"])
            if not rs: continue
            tr = [t for t in train if t[0] == lab and t[1] == geom]
            rej = f"; rejected {np.mean([t[6] for t in tr]) / BUDGET:.2f} of training candidates" if tr else ""
            Ls.append(f"[{geom}, {lab}] cant {np.mean([r['alpha_deg'] for r in rs]):.1f} deg; hover W {np.mean([r['power'] for r in rs]):.1f}; "
                      f"mass {np.mean([r['mass'] for r in rs]):.3f} kg{rej}")
            Ls.append(f"""  pos kp {', '.join(f'{r["pos_kp"]:.2f}' for r in rs)}; pos kd {', '.join(f'{r["pos_kd"]:.2f}' for r in rs)}; """
                      f"""pos ki {', '.join(f'{r["pos_ki"]:.3f}' for r in rs)}; att kp {', '.join(f'{r["att_kp"]:.2f}' for r in rs)}; rho {', '.join(f'{r["rho"]:.4f}' for r in rs)}""")
            for c in conditions():
                k = tag(*c)
                dc = [a[f"C_{k}"] - b[f"C_{k}"] for a, b in zip(rs, base)]
                se = np.std(dc, ddof=1) / np.sqrt(len(dc)) if len(dc) > 1 else float("nan")
                Ls.append(f"  {k:>18}: C {np.mean([r[f'C_{k}'] for r in rs]):.3f}; minus 7e {np.mean(dc):+.3f} (se {se:.3f}, worse in {sum(v > 0 for v in dc)} of {len(dc)}); "
                          f"J {np.mean([r[f'J_{k}'] for r in rs]):+.3f}; pos {np.mean([r[f'pos_{k}'] for r in rs]):.3f} m; dead {sum(r[f'dead_{k}'] for r in rs)} {[r[f'dead_{k}'] for r in rs]}")
            Ls.append("")
    return Ls


if __name__ == "__main__":
    t0 = time.time()
    jobs = [(a, g, s, k) for a in ARMS for g in GEOMS for s in range(SEEDS) for k in range(len(M6.STARTS))]
    with Pool() as p:
        train = p.map(one, jobs, chunksize=1)
    t_train = time.time() - t0
    ev = []
    for r in json.load(open(os.path.join(HERE, "..", "m7e_margin", "results.json")))["runs"]:
        if r["label"] == "constrained" and r["seed"] < SEEDS:
            ev.append(("7e", r["geom"], r["seed"], r["x"][:12], KP_HI_INHERITED))
    for a, cfg in ARMS.items():
        for g in GEOMS:
            for s in range(SEEDS):
                b = max((t for t in train if t[0] == a and t[1] == g and t[2] == s), key=lambda t: t[4])
                ev.append((a, g, s, b[5][:12], cfg["kp_hi"]))
    with Pool() as p:
        out = p.starmap(evaluate, ev)
    labels = ["7e", *ARMS]
    lines = summarise(out, train, labels) + [f"wall time {time.time() - t0:.0f} s (training {t_train:.0f} s)"]
    sfx = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"results{sfx}.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(labels=labels, budget=BUDGET, a_p=A_P, train_tilt=TRAIN_TILT, arms=ARMS, levers=LEVERS, tilts=TILTS, offset_big=OFFSET_BIG,
                   train=[dict(arm=t[0], geom=t[1], seed=t[2], start=t[3], best=t[4], x=t[5], rejected=t[6]) for t in train], runs=out),
              open(os.path.join(HERE, f"results{sfx}.json"), "w"), indent=1)
    print("\n".join(lines))
