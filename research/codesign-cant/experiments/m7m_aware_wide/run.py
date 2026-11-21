"""Milestone 7m: milestone 7l's widened position-gain box and proportional-request cap, under milestone 7i's lever-aware objective.

7l found that with |kp e| capped at A_P = 3.5 m/s^2 and the position-kp box widened from 0.1-10 to 0.1-31.6 s^-2, a lever-1 tuner
raises kp to about 27 s^-2 and spends the stiffness on a lighter airframe (19% and 11% less mass), at the price of robustness:
more crashes at lever 2 even with the cap. 7i found that a lever-aware objective (levers 0, 1, 2 in the training score) makes the
tuner buy mass, which on this sizing model is torque authority against a mass-independent gust torque. The two pull opposite ways
on mass. Which wins when both are present: does the wide box still buy a lighter vehicle, or does the lever-aware objective keep
the mass (and the lever-2 robustness) and take the stiffness on top?

Arms (tilt-command limit 45 deg and the A_P cap in training, as 7l's cap arms; lever-aware score = mean of poshold.score at levers
0, 1, 2 with 6 episodes each, as 7i; everything else is 7e's training: integrator feed-forward, ki <= ceiling / 1.25 as a constraint,
thrust-to-weight 2, 3200 CMA-ES evaluations, 6 seeds, 2 starts, both rigid geometries):
  aware cap        kp box inherited (0.1-10 s^-2)
  aware cap wide   kp box 0.1-31.6 s^-2
Baselines re-scored by the same function: 7e (lever 1, 20 deg, no cap), 7i `aware TWR=2.0` (lever-aware, 20 deg, no cap, inherited
box), 7l `t45 cap wide` (lever 1, 45 deg, cap, wide box).
Held-out: 7l's 22 conditions (tilt 20/30/45 x lever 0/1/2 x no cap/cap; 45 deg at a 1.0 m offset, levers 0/1, no cap/cap) plus
lever 3 (outside all training) at 20 and 45 deg, no cap and cap: 26 conditions, 64 episodes, seed 9999.
Predictions M1-M7 in ../../LOG.md, written and committed before this was run at full budget.
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


def _load(name, sub):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, "..", sub, "run.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


H = _load("m7h", "m7h_twr")         # margin_rho, GEOMS
L7 = _load("m7l", "m7l_train45")    # setup(), perr_of(), A_P, KP_HI_*
P = M6.P
GEOMS = H.GEOMS
A_P, TRAIN_TILT = L7.A_P, 45.0
KP_HI_INHERITED, KP_HI_WIDE = L7.KP_HI_INHERITED, L7.KP_HI_WIDE
ARMS = {"aware cap": dict(kp_hi=KP_HI_INHERITED), "aware cap wide": dict(kp_hi=KP_HI_WIDE)}
TRAIN_LEVERS = (0.0, 1.0, 2.0)
SMOKE = os.environ.get("SMOKE") == "1"
BUDGET = 64 if SMOKE else M6.BUDGET
SEEDS = 2 if SMOKE else M6.SEEDS
EP_PER_LEVER = 2 if SMOKE else 6
TEST_EP = 8 if SMOKE else M6.TEST_EP
TEST_SEED = 4242 if SMOKE else M6.TEST_SEED   # the smoke run never touches the held-out seed
CACHE = os.path.join(HERE, ".cache_smoke" if SMOKE else ".cache")
setup, perr_of = L7.setup, L7.perr_of


def train_score(xs, s, geom):
    perr = perr_of(xs, True)
    return np.mean([P.score(xs, EP_PER_LEVER, M6.TRAIN_SEED + s, dist_sign=GEOMS[geom], lever_scale=lev, ff=1.0, ff_mode="integ",
                            perr_max=perr, **M6.cond("aware"))[0] for lev in TRAIN_LEVERS], axis=0)


def train_one(arm, geom, s, k):
    setup(TRAIN_TILT, ARMS[arm]["kp_hi"])
    x0 = [0.5] * 12; x0[2] = M6.STARTS[k]
    es = cma.CMAEvolutionStrategy(x0, 0.25, {"bounds": [0, 1], "seed": 100 * (s + 1) + k, "popsize": 16, "verbose": -9})
    best, bx, n, ninf = -1e9, None, 0, 0
    while n < BUDGET:
        xs = np.array(es.ask())
        rho = H.margin_rho(xs, np.full(len(xs), A.TWR))
        ok = rho < 1.0
        ys = -100.0 - 10.0 * np.minimum(rho - 1.0, 10.0)
        if ok.any():
            ys[ok] = train_score(xs[ok], s, geom)
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
    return L7.conditions() + [(t, 3.0, cap, None) for t in (20.0, 45.0) for cap in (False, True)]


tag = L7.tag


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
    Lm = A.L_RANGE[0] + x[0, 0] * (A.L_RANGE[1] - A.L_RANGE[0]); D = A.D_RANGE[0] + x[0, 1] * (A.D_RANGE[1] - A.D_RANGE[0])
    r.update(alpha_deg=float(np.rad2deg(sz["alpha"][0])), power=float(sz["power"][0]), mass=float(sz["mass"][0]),
             tau_max=float(sz["tau_max"][0]), tau_per_weight=float(sz["tau_max"][0] / (sz["mass"][0] * A.G)), L=float(Lm), D=float(D),
             att_kp=float(g[0, 0]), pos_kp=float(g[0, 6]), pos_kd=float(g[0, 7]), pos_ki=float(g[0, 8]),
             rho=float(S.worst_radius(dp, 1.0, "integ")[0]))
    setup()
    return r


def summarise(out, train, labels):
    Ls = [f"Milestone 7m: lever-aware objective (levers 0, 1, 2; {EP_PER_LEVER} episodes each) at a {TRAIN_TILT:g} deg tilt-command limit with the cap |kp e| <= {A_P} m/s^2.",
          f"{SEEDS} seeds, best of {len(M6.STARTS)} CMA-ES starts x {BUDGET} evaluations; held-out {TEST_EP} episodes (seed {TEST_SEED}), side force on.",
          "Baselines: 7e (lever 1, 20 deg, no cap), 7i aware (lever-aware, 20 deg, no cap), 7l t45 cap wide (lever 1, 45 deg, cap, wide box).",
          "C = held-out composite cost (J without the power term); dead = diverged flights, summed (per seed); paired differences against 7e.",
          "tau/W = roll/pitch torque limit per newton of weight (m).", ""]
    for geom in GEOMS:
        base = sorted((r for r in out if r["geom"] == geom and r["label"] == "7e"), key=lambda r: r["seed"])
        for lab in labels:
            rs = sorted((r for r in out if r["geom"] == geom and r["label"] == lab), key=lambda r: r["seed"])
            if not rs: continue
            tr = [t for t in train if t[0] == lab and t[1] == geom]
            rej = f"; rejected {np.mean([t[6] for t in tr]) / BUDGET:.2f} of training candidates" if tr else ""
            Ls.append(f"[{geom}, {lab}] cant {np.mean([r['alpha_deg'] for r in rs]):.1f} deg; L {np.mean([r['L'] for r in rs]):.3f} m; D {np.mean([r['D'] for r in rs]):.3f} m; "
                      f"mass {np.mean([r['mass'] for r in rs]):.3f} kg; hover W {np.mean([r['power'] for r in rs]):.1f}; tau_max {np.mean([r['tau_max'] for r in rs]):.3f} N m; "
                      f"tau/W {np.mean([r['tau_per_weight'] for r in rs]):.4f} m{rej}")
            Ls.append(f"""  mass {', '.join(f'{r["mass"]:.3f}' for r in rs)}; pos kp {', '.join(f'{r["pos_kp"]:.2f}' for r in rs)}; pos kd {', '.join(f'{r["pos_kd"]:.2f}' for r in rs)}; """
                      f"""pos ki {', '.join(f'{r["pos_ki"]:.3f}' for r in rs)}; att kp {', '.join(f'{r["att_kp"]:.2f}' for r in rs)}; rho {', '.join(f'{r["rho"]:.4f}' for r in rs)}""")
            for c in conditions():
                k = tag(*c)
                dc = [a[f"C_{k}"] - b[f"C_{k}"] for a, b in zip(rs, base)]
                se = np.std(dc, ddof=1) / np.sqrt(len(dc)) if len(dc) > 1 else float("nan")
                Ls.append(f"  {k:>18}: C {np.mean([r[f'C_{k}'] for r in rs]):.3f}; minus 7e {np.mean(dc):+.3f} (se {se:.3f}, worse in {sum(v > 0 for v in dc)} of {len(dc)}); "
                          f"J {np.mean([r[f'J_{k}'] for r in rs]):+.3f}; pos {np.mean([r[f'pos_{k}'] for r in rs]):.3f} m; dead {sum(r[f'dead_{k}'] for r in rs)} {[r[f'dead_{k}'] for r in rs]}")
            Ls.append("")
    return Ls


def baselines():
    ev = []
    rel = lambda sub: json.load(open(os.path.join(HERE, "..", sub, "results.json")))["runs"]
    for r in rel("m7e_margin"):
        if r["label"] == "constrained" and r["seed"] < SEEDS:
            ev.append(("7e", r["geom"], r["seed"], r["x"][:12], KP_HI_INHERITED))
    for r in rel("m7i_aware"):
        if r["label"] == "aware TWR=2.0" and r["seed"] < SEEDS:
            ev.append(("7i aware", r["geom"], r["seed"], r["x"][:12], KP_HI_INHERITED))
    for r in rel("m7l_train45"):
        if r["label"] == "t45 cap wide" and r["seed"] < SEEDS:
            ev.append(("7l t45 cap wide", r["geom"], r["seed"], r["x"][:12], KP_HI_WIDE))
    return ev


if __name__ == "__main__":
    t0 = time.time()
    jobs = [(a, g, s, k) for a in ARMS for g in GEOMS for s in range(SEEDS) for k in range(len(M6.STARTS))]
    with Pool() as p:
        train = p.map(one, jobs, chunksize=1)
    t_train = time.time() - t0
    ev = baselines()
    for a, cfg in ARMS.items():
        for g in GEOMS:
            for s in range(SEEDS):
                b = max((t for t in train if t[0] == a and t[1] == g and t[2] == s), key=lambda t: t[4])
                ev.append((a, g, s, b[5][:12], cfg["kp_hi"]))
    with Pool() as p:
        out = p.starmap(evaluate, ev)
    labels = ["7e", "7i aware", "7l t45 cap wide", *ARMS]
    lines = summarise(out, train, labels) + [f"wall time {time.time() - t0:.0f} s (training {t_train:.0f} s)"]
    sfx = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"results{sfx}.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(labels=labels, budget=BUDGET, a_p=A_P, train_tilt=TRAIN_TILT, arms=ARMS, train_levers=TRAIN_LEVERS, ep_per_lever=EP_PER_LEVER,
                   train=[dict(arm=t[0], geom=t[1], seed=t[2], start=t[3], best=t[4], x=t[5], rejected=t[6]) for t in train], runs=out),
              open(os.path.join(HERE, f"results{sfx}.json"), "w"), indent=1)
    print("\n".join(lines))
