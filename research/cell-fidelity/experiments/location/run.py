"""Milestone 3, part 2b: does SPMe's own salt-depletion output say where its error falls?

    python experiments/location/run.py bench    # SPMe, 100 cycles, 128 designs, per-cycle r_min -> spme_cycles.jsonl (resumable)
    python experiments/location/run.py report   # H21 to H24 -> results.txt, summary.json (a few minutes)

The bench pass reruns SPMe with the protocol and code path of ../cycles/run.py (same designs, same experiment), and
records each cycle's minimum electrolyte concentration ratio r and most negative x-averaged concentration
overpotential, so the feature for SPMe@n comes from its own first n cycles. Everything else is read from the cache
(../cycles/bench.jsonl, ../cycles/cost.json, ../search/summary.json). The plan, the mechanism and H21 to H24 were
fixed in ../../LOG.md (2026-11-12) before this ran; the argument is in ../../THEORY.md, part 2b.
Needs numpy and scipy (report) and pybamm (bench).
"""
import importlib.util
import json
import math
import os
import random
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
RESEARCH = HERE.parents[2]

TOL = 0.01
N_SEEDS, POOL = 30, 64
SWEEP = (16, 32, 64, 96)
R_FLOOR = 0.01        # g_log clip (LOG.md)
FLAG_RMIN = 0.1       # milestone 1's flag
N_PILOT, N_PILOTS = 16, 20
N_FOLDS = 5
WARM = 4              # online rule: first WARM DFN@100 calls in screen order
SPME_CELLS = (2, 10, 30, 100)
FEATURES = ("log", "quad", "flag", "none")
WORKERS = int(os.environ.get("WORKERS", "3"))
C0 = 1000.0


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


# ---------- pure logic (tested) ----------

def feature(r, kind):
    """g(r) for the registered forms; r <= 0 (a failed or negative-salt run) is clipped like any small r."""
    if kind == "log":
        return -math.log(max(r, R_FLOOR))
    if kind == "quad":
        return (1.0 - r) ** 2
    if kind == "flag":
        return 1.0 if r <= FLAG_RMIN else 0.0
    if kind == "none":
        return 0.0
    raise KeyError(kind)


def r_upto(row, n):
    """Minimum salt ratio over the first n cycles of a per-cycle SPMe run; 0 if the run did not complete n cycles."""
    rc = row.get("r_cycle") or []
    if not row.get("ok") or len(rc) < n:
        return 0.0
    return min(rc[:n])


def lstsq_fit(cols, y):
    """Least squares y ~ sum_k w_k cols[k]; returns w (min-norm when rank deficient)."""
    import numpy as np
    A = np.column_stack([np.asarray(c, float) for c in cols])
    w, *_ = np.linalg.lstsq(A, np.asarray(y, float), rcond=None)
    return w


def design_matrix(s, g, kind):
    """Columns [1, s] plus g unless kind == 'none'."""
    one = [1.0] * len(s)
    return [one, list(s)] if kind == "none" else [one, list(s), list(g)]


def cv_rmse(s, g, f, kind, folds):
    """K-fold cross-validated RMSE of f ~ a + b s (+ beta g)."""
    import numpy as np
    s, g, f = np.asarray(s, float), np.asarray(g, float), np.asarray(f, float)
    err = []
    for test in folds:
        tr = np.setdiff1d(np.arange(len(f)), test)
        w = lstsq_fit(design_matrix(s[tr], g[tr], kind), f[tr])
        pred = np.column_stack(design_matrix(s[test], g[test], kind)) @ w
        err.extend((f[test] - pred).tolist())
    return float(np.sqrt(np.mean(np.square(err))))


def expected_calls_loc(f, m, sigma, tau=TOL, grid=4001):
    """E[R] when screen-then-verify ranks by m_x + e_x, e iid N(0, sigma^2), and T = {f >= (1 - tau) max f}.

    Part 2a's proposition with per-design means: E[R] = 1 + sum_{x not in T} P(m_x + e_x > max_{y in T} m_y + e_y),
    each term a one-dimensional integral. m = f recovers part 2a's model; sigma = 0 is the noiseless count."""
    import numpy as np
    from scipy.stats import norm
    f, m = np.asarray(f, float), np.asarray(m, float)
    inT = f >= (1 - tau) * f.max()
    if sigma <= 0:
        return 1.0 + float(np.sum(m[~inT] > m[inT].max()))
    t = np.linspace(m.min() - 8 * sigma, m.max() + 8 * sigma, grid)
    Fmax = np.exp(norm.logcdf((t[:, None] - m[inT][None, :]) / sigma).sum(axis=1))
    dens = norm.pdf((t[:, None] - m[~inT][None, :]) / sigma) / sigma
    p = np.trapezoid(dens * Fmax[:, None], t, axis=0)
    return 1.0 + float(np.clip(p, 0, 1).sum())


def online_order(pool, s, g, f, kind, warm=WARM):
    """Online corrected screen-then-verify: the first `warm` designs by s, then after every call refit
    f ~ a + b s (+ beta g) on the verified designs and verify the unverified design with the largest prediction
    (ties broken by s). Returns the full verification order (the target f is read only for verified designs)."""
    import numpy as np
    rest = sorted(pool, key=lambda i: -s[i])
    done = []
    while rest:
        if len(done) < warm:
            i = rest[0]
        else:
            w = lstsq_fit(design_matrix([s[j] for j in done], [g[j] for j in done], kind), [f[j] for j in done])
            X = np.column_stack(design_matrix([s[j] for j in rest], [g[j] for j in rest], kind))
            pred = X @ w
            i = rest[int(np.argmax(pred))]   # argmax returns the first max, and rest is in screen order
        done.append(i)
        rest.remove(i)
    return done


# ---------- simulation (pybamm) ----------

def simulate(x, cycles=100):
    import numpy as np
    import pybamm
    sys.path.insert(0, str(RESEARCH / "energy-cell" / "src"))
    from energy_cell import cell
    pybamm.set_logging_level("ERROR")
    x = cell.clip(x)
    pv = cell._params(x)
    out = dict(ok=True, error=None, mass_kg=float(cell.stack_mass_kg(x, pv)))
    opts = {"SEI": "solvent-diffusion limited", "lithium plating": "irreversible"}
    model = pybamm.lithium_ion.SPMe(opts)
    exp = pybamm.Experiment([(f"Discharge at {cell.I_DISCHARGE} A until 2.5 V",
                              f"Charge at {cell.I_CHARGE} A until 4.2 V")] * cycles)
    t0 = time.perf_counter()
    try:
        sol = pybamm.Simulation(model, parameter_values=pv, experiment=exp).solve(initial_soc=1.0)
        wh, rc, ec = [], [], []
        for c in sol.cycles:
            d = c.steps[0]
            v, i, t = d["Terminal voltage [V]"].entries, d["Current [A]"].entries, d["Time [s]"].entries
            wh.append(float(np.trapezoid(v * i, t)) / 3600.0)
            rc.append(float(np.min(c["Electrolyte concentration [mol.m-3]"].entries)) / C0)
            ec.append(float(np.min(d["X-averaged concentration overpotential [V]"].entries)))
        out.update(cycle_wh=wh, r_cycle=rc, eta_c_min=ec, ok_cycles=len(sol.cycles))
    except Exception as ex:
        out.update(ok=False, error=f"{type(ex).__name__}: {str(ex)[:160]}", cycle_wh=[], r_cycle=[], eta_c_min=[],
                   ok_cycles=0)
    out["seconds"] = time.perf_counter() - t0
    return out


def _spawn(x, timeout=1800):
    try:
        p = subprocess.run([sys.executable, __file__, "child", json.dumps(x)], capture_output=True, text=True,
                           timeout=timeout)
        if p.stdout.strip():
            return json.loads(p.stdout.strip().splitlines()[-1])
        err = f"process exit {p.returncode}: {p.stderr[-160:]}"
    except subprocess.TimeoutExpired:
        err = f"timeout {timeout} s"
    return dict(ok=False, error=err, cycle_wh=[], r_cycle=[], eta_c_min=[], ok_cycles=0, seconds=None)


def bench():
    cr = _mod("cycles_run", EXP / "cycles" / "run.py")
    js, runs, _ = cr.load()
    path = HERE / "spme_cycles.jsonl"
    done = set()
    if path.exists():
        done = {r["j"] for r in map(json.loads, path.read_text().splitlines())}
    jobs = [j for j in js if j not in done]

    def go(j):
        return dict(j=j, x=runs[(j, "SPMe")]["x"], **_spawn(runs[(j, "SPMe")]["x"]))

    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as fh:
        for r in ex.map(go, jobs):
            r["r_cycle"] = [round(v, 6) for v in r["r_cycle"]]
            r["eta_c_min"] = [round(v, 6) for v in r["eta_c_min"]]
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            print(r["j"], r["ok"], r["ok_cycles"], r["seconds"] and round(r["seconds"], 1), flush=True)


# ---------- report ----------

def med(v):
    v = sorted(v)
    n = len(v)
    return v[n // 2] if n % 2 else 0.5 * (v[n // 2 - 1] + v[n // 2])


def report():
    import numpy as np
    cr = _mod("cycles_run", EXP / "cycles" / "run.py")
    th = _mod("theory_run", EXP / "theory" / "run.py")
    se = _mod("search_run", EXP / "search" / "run.py")
    js, runs, sc = cr.load()
    N = len(js)
    f = list(sc[("DFN", 100)])
    rows = {r["j"]: r for r in map(json.loads, (HERE / "spme_cycles.jsonl").read_text().splitlines())}
    assert sorted(rows) == js, "bench incomplete"
    c = json.loads((EXP / "cycles" / "cost.json").read_text())
    cost = {(m, int(n)): sorted(v)[1] for m, d in c.items() for n, v in d.items()}
    ms = json.loads((EXP / "search" / "summary.json").read_text())

    # reproduction check: per-cycle energies against the cached 100-cycle SPMe run
    same_ok = sum(1 for j in js if bool(rows[j]["ok"]) == bool(runs[(j, "SPMe")]["ok"]))
    dev = [max((abs(a - b) / abs(b) for a, b in zip(rows[j]["cycle_wh"], runs[(j, "SPMe")]["cycle_wh"]) if b), default=0.0)
           for j in js if rows[j]["ok"] and runs[(j, "SPMe")]["ok"]]
    rmin_dev = max(abs(min(rows[j]["r_cycle"]) - runs[(j, "SPMe")]["r_min"]) for j in js if rows[j]["ok"] and runs[(j, "SPMe")]["ok"])
    r = {n: [r_upto(rows[j], n) for j in js] for n in SPME_CELLS}
    eta = {n: [(-min(rows[j]["eta_c_min"][:n]) if rows[j]["ok"] and len(rows[j]["eta_c_min"]) >= n else float("nan"))
               for j in js] for n in SPME_CELLS}
    G = {(n, k): [feature(v, k) for v in r[n]] for n in SPME_CELLS for k in FEATURES}

    L = ["cell-fidelity milestone 3 (theory, part 2b): where SPMe's error falls, from its own salt depletion",
         f"benchmark: {N} Sobol designs; target DFN@100; tau = {TOL}; pools: {N_SEEDS} of {POOL} (milestone 4's)",
         f"g_log = -ln max(r, {R_FLOOR}); g_quad = (1 - r)^2; g_flag = 1[r <= {FLAG_RMIN}]; r = SPMe min c_e / c_e0 over the "
         "cell's own first n cycles (0 for a run that did not complete them)", "",
         f"0. rerun check: ok/failed agrees on {same_ok} of {N}; max relative per-cycle energy difference against "
         f"bench.jsonl {max(dev):.1e}; max |r_min difference| {rmin_dev:.1e}; failed runs {sum(1 for j in js if not rows[j]['ok'])}",
         "   r by cell (median, 10th pct): " + ", ".join(f"SPMe@{n} {med(r[n]):.3f}, {sorted(r[n])[N // 10]:.3f}" for n in SPME_CELLS),
         ""]
    summ = dict(n=N, check=dict(same_ok=same_ok, max_rel_wh=max(dev), max_rmin=rmin_dev), cells={})

    # H21: cross-validated form on SPMe@100
    perm = list(range(N))
    random.Random(0).shuffle(perm)
    folds = [np.array(perm[k::N_FOLDS]) for k in range(N_FOLDS)]
    L.append(f"A. H21: {N_FOLDS}-fold CV RMSE (Wh/kg) of f ~ a + b s + beta g, all {N} designs")
    L.append(f"{'cell':<10} " + " ".join(f"{k:>7}" for k in FEATURES) + f" {'eta_c':>7}")
    cv = {}
    for n in SPME_CELLS:
        s = sc[("SPMe", n)]
        row = {k: cv_rmse(s, G[(n, k)], f, k, folds) for k in FEATURES}
        e_ = np.nan_to_num(np.array(eta[n]), nan=np.nanmax(eta[n]))  # a failed run takes the largest observed eta
        row["eta"] = cv_rmse(s, e_, f, "eta", folds)
        cv[n] = row
        L.append(f"SPMe@{n:<5} " + " ".join(f"{row[k]:7.2f}" for k in FEATURES) + f" {row['eta']:7.2f}")
    c100 = cv[100]
    ratio = c100["log"] / c100["none"]
    h21 = ("refuted" if (c100["quad"] < c100["log"] or c100["flag"] < c100["log"]) else
           "supported" if ratio <= 0.7 else "neither")
    L.append(f"H21 SPMe@100: log {c100['log']:.2f}, quad {c100['quad']:.2f}, flag {c100['flag']:.2f}, none {c100['none']:.2f} "
             f"(log / none {ratio:.2f}) -> {h21}")
    w = lstsq_fit(design_matrix(sc[("SPMe", 100)], G[(100, "log")], "log"), f)
    L.append(f"    full-sample fit SPMe@100: f = {w[0]:.1f} + {w[1]:.3f} s + {w[2]:.2f} g_log")
    summ["h21"] = dict(cv={str(n): v for n, v in cv.items()}, ratio=ratio, verdict=h21, fit=list(map(float, w)))

    # H22: location model as a planner
    pools = [random.Random(s).sample(range(N), POOL) for s in range(N_SEEDS)]
    fa = np.array(f)
    L += ["", f"B. H22: E[R] under e = beta g_log + N(0, sigma0^2), fitted on pilots of {N_PILOT} ({N_PILOTS} pilots, median), "
          "against observed mean R on pools of 64",
          f"{'cell':<10} {'R obs':>6} {'R loc':>6} {'loc/obs':>7} {'R iid':>6} {'iid/obs':>7} {'beta med':>8} {'sig0 med':>8}"]
    within = 0
    for n in SPME_CELLS:
        s = np.array(sc[("SPMe", n)])
        g = np.array(G[(n, "log")])
        obs = float(np.mean([th.calls_to_target(p, list(s), f) for p in pools]))
        preds, preds_iid, betas, sigs = [], [], [], []
        for k in range(N_PILOTS):
            pil = random.Random(500 + k).sample(range(N), N_PILOT)
            wp = lstsq_fit(design_matrix(s[pil], g[pil], "log"), fa[pil])
            res = fa[pil] - np.column_stack(design_matrix(s[pil], g[pil], "log")) @ wp
            sig0 = float(np.sqrt(np.sum(res ** 2) / max(1, N_PILOT - 3)))
            w0 = lstsq_fit(design_matrix(s[pil], g[pil], "none"), fa[pil])
            res0 = fa[pil] - np.column_stack(design_matrix(s[pil], g[pil], "none")) @ w0
            sig_iid = float(np.sqrt(np.sum(res0 ** 2) / max(1, N_PILOT - 2)))
            beta = float(wp[2])
            # screen order is by s, i.e. by a + b s = f - beta g - e when b > 0
            sign = 1.0 if wp[1] > 0 else -1.0
            preds.append(np.mean([expected_calls_loc(fa[p], sign * (fa[p] - beta * g[p]), sig0) for p in pools]))
            preds_iid.append(np.mean([expected_calls_loc(fa[p], fa[p], sig_iid) for p in pools]))
            betas.append(beta)
            sigs.append(sig0)
        pl, pi = float(np.median(preds)), float(np.median(preds_iid))
        ok = 0.5 <= pl / obs <= 2
        within += ok
        summ["cells"][f"SPMe@{n}"] = dict(R_obs=obs, R_loc=pl, R_iid=pi, beta=float(np.median(betas)), sigma0=float(np.median(sigs)))
        L.append(f"SPMe@{n:<5} {obs:6.2f} {pl:6.2f} {pl / obs:7.2f} {pi:6.2f} {pi / obs:7.2f} {np.median(betas):8.2f} {np.median(sigs):8.2f}")
    h22 = "supported" if within >= 3 else "refuted"
    L.append(f"H22 location model within 2x on {within} of 4 SPMe cells -> {h22} (R iid = same pilots, no g, part 2a's model)")
    summ["h22"] = dict(within2=within, verdict=h22)

    # H23, H24: online corrected screen
    D = se.load()
    D["target"] = f
    flagT = ms["methods"]["screen SPMe@100+flag"]["T1"]
    gpT = ms["methods"]["GP-EI DFN@100"]["T1"]
    spm2T = ms["methods"]["screen SPM@2"]["T1"]

    def run_online(pool, n, kind):
        tr = se.Trace(f, D["cost"])
        for i in pool:
            tr.charge(("SPMe", n), i)
        se.verify_in_order(tr, online_order(pool, sc[("SPMe", n)], G[(n, kind)], f, kind))
        return tr

    def t1s(n, kind, P=POOL):
        T, calls = [], []
        for sd in range(N_SEEDS):
            pool = random.Random(sd).sample(range(N), P)
            thr = (1 - TOL) * max(f[i] for i in pool)
            tr = run_online(pool, n, kind)
            T.append(se.t_hit(tr.pts, thr))
            calls.append(next(k for k, i in enumerate(tr.order, 1) if f[i] >= thr))
        return T, calls

    L += ["", f"C. H23, H24: online corrected screen-then-verify (first {WARM} calls by s, then refit after every call), "
          "pools of 64, median T1 (charged s) [DFN@100 calls]",
          f"{'cell':<10} {'c_s':>5} " + " ".join(f"{k:>16}" for k in FEATURES)]
    online = {}
    for n in SPME_CELLS:
        cols = []
        for k in FEATURES:
            T, calls = t1s(n, k)
            online[(n, k)] = T
            summ.setdefault("online", {})[f"SPMe@{n} {k}"] = dict(T1_median=med(T), T1=T, calls_median=med(calls),
                                                                  ci=list(se.boot_med(T)), p_vs_gp=se.wilcoxon(T, gpT))
            cols.append(f"{med(T):8.1f} [{med(calls):4.1f}]")
        L.append(f"SPMe@{n:<5} {cost[('SPMe', n)]:5.2f} " + " ".join(f"{x:>16}" for x in cols))
    L.append(f"references (milestone 4, same pools): GP-EI DFN@100 {med(gpT):.1f}, screen SPM@2 {med(spm2T):.1f}, "
             f"screen SPMe@100 {ms['methods']['screen SPMe@100']['T1_median']:.1f}, screen SPMe@100+flag {med(flagT):.1f}")
    T23 = online[(100, "log")]
    p23 = se.wilcoxon(T23, flagT)
    h23 = ("refuted" if med(T23) > med(flagT) else "supported" if p23 < 0.05 else "neither")
    L.append(f"H23 online g_log over SPMe@100: median T1 {med(T23):.1f} s vs SPMe@100+flag {med(flagT):.1f} s, "
             f"paired Wilcoxon p = {p23:.2g} -> {h23}")
    T24 = online[(2, "log")]
    h24 = ("supported" if med(T24) <= med(spm2T) else "refuted" if med(T24) > 1.2 * med(spm2T) else "neither")
    L.append(f"H24 online g_log over SPMe@2: median T1 {med(T24):.1f} s vs screen SPM@2 {med(spm2T):.1f} s "
             f"(p = {se.wilcoxon(T24, spm2T):.2g}; vs GP-EI {med(gpT):.1f} s, p = {se.wilcoxon(T24, gpT):.2g}) -> {h24}")
    summ["h23"] = dict(T1=med(T23), flag=med(flagT), p=p23, verdict=h23)
    summ["h24"] = dict(T1=med(T24), spm2=med(spm2T), p=se.wilcoxon(T24, spm2T), p_gp=se.wilcoxon(T24, gpT), verdict=h24)

    # extra: pool sweep for the best corrected cell at 64
    best_n = min(SPME_CELLS, key=lambda n: med(online[(n, "log")]))
    L += ["", f"D. (extra, no verdict) pool sweep, online g_log over SPMe@{best_n} (the best cell at 64) against milestone 4's medians"]
    L.append(f"{'pool':>5} {'online':>8} " + " ".join(f"{m:>16}" for m in ms["pool_sweep"]["16"]))
    summ["sweep"] = {}
    for P in SWEEP:
        T, _ = t1s(best_n, "log", P)
        ref = ms["pool_sweep"][str(P)]
        summ["sweep"][P] = dict(online=med(T), **ref)
        L.append(f"{P:>5} {med(T):8.1f} " + " ".join(f"{ref[m]:16.1f}" for m in ref))
    summ["sweep_cell"] = best_n

    # extra, added after seeing C and D (post hoc): at 2 and 10 cycles every feature ties with "none" because the
    # target is reached inside the warm-up, so D is the plain screen. Run the plain short-SPMe screens through
    # milestone 4's m_screen, and check how much rests on the single DFN-best design.
    ref64 = {m: ms["methods"][m]["T1"] for m in ("screen SPM@2", "screen SPM@100", "screen DFN@2", "GP-EI DFN@100")}
    L += ["", "E. (extra, post hoc) plain whole-pool SPMe screens (milestone 4's m_screen), median T1 (charged s) by pool size; "
          "p = paired Wilcoxon at 64 against the milestone-4 method named"]
    L.append(f"{'screen':<12} " + " ".join(f"{'N=' + str(P):>8}" for P in SWEEP) + "   " +
             "  ".join(f"p vs {m.replace('screen ', '')}" for m in ref64))
    summ["plain"] = {}
    for n in (2, 10, 30):
        meds, T64 = [], None
        for P in SWEEP:
            T = []
            for sd in range(N_SEEDS):
                pool = random.Random(sd).sample(range(N), P)
                thr = (1 - TOL) * max(f[i] for i in pool)
                T.append(se.t_hit(se.m_screen(pool, D, ("SPMe", n)).pts, thr))
            meds.append(med(T))
            if P == POOL:
                T64 = T
        ps = {m: se.wilcoxon(T64, v) for m, v in ref64.items()}
        summ["plain"][f"SPMe@{n}"] = dict(T1_median={str(P): v for P, v in zip(SWEEP, meds)}, T1_64=T64, p64=ps)
        L.append(f"SPMe@{n:<7} " + " ".join(f"{v:8.1f}" for v in meds) + "   " +
                 "  ".join(f"{ps[m]:>{len('p vs ' + m.replace('screen ', ''))}.2g}" for m in ref64))
    kbest = max(range(N), key=lambda i: f[i])
    rest = [i for i in range(N) if i != kbest]
    L.append(f"   without the DFN-best design (j = {js[kbest]}), mean DFN@100 calls R on 30 pools of 64 from the other {N - 1}:")
    loo = {}
    for cell in (("SPMe", 2), ("SPMe", 10), ("SPMe", 30), ("SPMe", 100), ("SPM", 2), ("SPM", 100), ("DFN", 2), ("DFN", 10)):
        Rs = [th.calls_to_target(random.Random(sd).sample(rest, POOL), list(sc[cell]), f) for sd in range(N_SEEDS)]
        loo[f"{cell[0]}@{cell[1]}"] = float(np.mean(Rs))
    L.append("   " + ", ".join(f"{k} {v:.2f}" for k, v in loo.items()))
    rank_best = {n: 1 + sorted(range(N), key=lambda i: -sc[("SPMe", n)][i]).index(kbest) for n in SPME_CELLS}
    L.append("   rank of the DFN-best design under each SPMe screen (of 128): " +
             ", ".join(f"SPMe@{n} {v}" for n, v in rank_best.items()))
    summ["leave_best_out"] = dict(R=loo, rank_best={str(n): v for n, v in rank_best.items()})

    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(summ, indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "child":
        print(json.dumps(simulate(json.loads(sys.argv[2]))))
    else:
        {"bench": bench, "report": report}[cmd]()
