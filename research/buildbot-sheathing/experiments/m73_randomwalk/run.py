"""Milestone 73: re-zero schedules under a random-walk force bias, offline from milestone 72's wall.

python experiments/m73_randomwalk/run.py  (numpy, scipy; several minutes). Writes results.txt and results.json.
"""
import importlib.util
import json
import os
import sys
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
from buildbot_sheathing import drift as D, rezero as R  # noqa: E402

_spec = importlib.util.spec_from_file_location("m72", os.path.join(ROOT, "experiments", "m72_rezero", "run.py"))
M72 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(M72)

D1S = [0.02, 0.05, 0.1, 0.2]
MODELS = ["LIN", "RW", "MIX"]
ALPHA = 0.01
TRIALS, SEED, SEED_FRESH = 4000, 73, 730
CS = [5.0, 15.0, 30.0]
PLANS = ["LAYOUT", "BANDS k+0", "BEST"]
N_SHEETS = M72.N_SHEETS
CYCLE = M72.CYC["total"]


def plans():
    A = M72.pose_allowance()
    out = {}
    for n in ("g1", "h1"):
        hA = M72.height_table(A[n], "zero")
        mapped, k0 = M72.banded(hA)
        _, _, mp = M72.best_bands(hA, k0)
        hb = max(hA, key=hA.get)
        out[n] = {"k0": k0,
                  "LAYOUT": M72.sheet_order(mapped, hA, "layout"),
                  "BANDS k+0": M72.sheet_order(mp, hA, "layout"),
                  "BEST": [hA[hb]] * len(M72.NAILS)}
    return out


def schedule(g, t, a, kind, model, d1, eps=None):
    if kind == "LINS":
        return R.greedy(g, t, 3600 * a / d1)
    rho, sig = D.matched(model, d1)
    if kind == "BONF":
        eps = ALPHA / len(a)
    return R.greedy(g, t, D.deadlines(a, rho, sig, eps))


def fail(g, t, a, st, model, d1, seed):
    rho, sig = D.matched(model, d1)
    if sig == 0.0:                                  # deterministic: in spec iff every deadline is met
        return 0.0 if R.feasible(g, t, 3600 * a / d1, st) else 1.0
    return D.wall_fail(g, t, a, st, rho, sig, TRIALS, seed)


def calibrate(g, t, a, model, d1):
    """Largest per-press eps (log bisection) whose schedule's Monte Carlo wall failure is <= ALPHA."""
    lo, hi = np.log(ALPHA / len(a)), np.log(0.5)
    st_lo = schedule(g, t, a, "CAL", model, d1, np.exp(lo))
    f_lo = fail(g, t, a, st_lo, model, d1, SEED)
    if f_lo > ALPHA:
        return np.exp(lo), st_lo, f_lo
    best = (np.exp(lo), st_lo, f_lo)
    for _ in range(18):
        mid = 0.5 * (lo + hi)
        st = schedule(g, t, a, "CAL", model, d1, np.exp(mid))
        f = fail(g, t, a, st, model, d1, SEED)
        if f <= ALPHA:
            lo, best = mid, (np.exp(mid), st, f)
        else:
            hi = mid
    return best


def one_row(arg):
    (n, plan, model, d1), a1 = arg
    g, t, a = M72.wall(a1)
    r = {}
    st = schedule(g, t, a, "LINS", model, d1)
    r["LINS"] = (len(st), fail(g, t, a, st, model, d1, SEED))
    if model == "LIN":
        r["BONF"] = r["CAL"] = r["LINS"]
        r["CAL_fresh"], r["eps"] = r["LINS"][1], None
    else:
        st = schedule(g, t, a, "BONF", model, d1)
        r["BONF"] = (len(st), fail(g, t, a, st, model, d1, SEED))
        eps, st, f = calibrate(g, t, a, model, d1)
        r["CAL"] = (len(st), f)
        r["CAL_fresh"] = fail(g, t, a, st, model, d1, SEED_FRESH)
        r["eps"] = float(eps)
    print(n, plan, model, d1, r, flush=True)
    return r


def main():
    P = plans()
    L, out = [], {"alpha": ALPHA, "trials": TRIALS, "d1": D1S, "cycle": CYCLE, "rows": {}}
    p = L.append
    p("# Milestone 73: re-zero schedules under a random-walk force bias (milestone 72's 100-sheet wall and pose plans, "
      "lateral 0; drift matched to its 1 h magnitude D1, swept, not sourced; wall failure = any press outside its "
      f"allowance; Monte Carlo {TRIALS} paths, seed {SEED}, fresh check seed {SEED_FRESH})")
    for n in P:
        p(f"{n}: weakest allowance used LAYOUT {min(P[n]['LAYOUT']):.4f} N, BANDS k+0 {min(P[n]['BANDS k+0']):.4f} N, "
          f"BEST {P[n]['BEST'][0]:.4f} N")

    # H288: monotone violation probability
    worst = 0.0
    for n in P:
        for a in sorted({x for pl in PLANS for x in P[n][pl]}):
            for model in ("RW", "MIX"):
                for d1 in D1S:
                    rho, sig = D.matched(model, d1)
                    worst = max(worst, D.monotone_on_grid(a, rho, sig, 36000.0))
    p(f"\n## A. Largest decrease of the per-press violation probability over E in [1 s, 10 h], 1,000-point grid, every "
      f"allowance, RW and MIX, every D1: {worst:.3e}")
    out["h288_worst_decrease"] = worst

    p("\n## B. Re-zeros per 100 sheets and Monte Carlo wall failure: robot | plan | model | D1 N | LINS n (fail) | "
      "BONF n (fail) | CAL n (fail; fresh fail; eps)")
    keys = [(n, plan, model, d1) for n in P for plan in PLANS for model in MODELS for d1 in D1S]
    with Pool(4) as pool:
        res = pool.map(one_row, [(k, P[k[0]][k[1]]) for k in keys])
    rows = dict(zip(keys, res))
    for (n, plan, model, d1), r in rows.items():
        e = "-" if r["eps"] is None else f"{r['eps']:.2e}"
        p(f"  {n} | {plan} | {model} | {d1} | {r['LINS'][0]} ({r['LINS'][1]:.4f}) | {r['BONF'][0]} "
          f"({r['BONF'][1]:.4f}) | {r['CAL'][0]} ({r['CAL'][1]:.4f}; {r['CAL_fresh']:.4f}; {e})")

    p("\n## C. Re-zero share of the 116 s sheet cycle, CAL: robot | plan | model | D1 N | c = 5, 15, 30 s")
    C = {}
    for (n, plan, model, d1), r in rows.items():
        cells = []
        for c in CS:
            sh = r["CAL"][0] * c / N_SHEETS / CYCLE
            C[f"{n}|{plan}|{model}|{d1}|{c}"] = sh
            cells.append(f"{100 * sh:.2f}%")
        p(f"  {n} | {plan} | {model} | {d1} | " + " | ".join(cells))

    p("\n## D. BEST's break-even move time (s a move), CAL, c = 15 s: robot | model | D1 N | extra moves a sheet | s")
    E = {}
    for n in P:
        k0 = P[n]["k0"]
        extra = (len(M72.NAILS) + 4) - (k0 + 4 * k0)
        for model in MODELS:
            for d1 in D1S:
                be = (rows[(n, "LAYOUT", model, d1)]["CAL"][0] - rows[(n, "BEST", model, d1)]["CAL"][0]) * 15.0 \
                    / N_SHEETS / extra
                E[f"{n}|{model}|{d1}"] = be
                p(f"  {n} | {model} | {d1} | {extra} | {be:.3f}")

    # hypotheses
    H = {}
    H["H288"] = worst <= 1e-12
    lf = {n: rows[(n, "LAYOUT", "RW", 0.1)]["LINS"][1] for n in P}
    H["H289"] = all(v > 0.5 for v in lf.values())
    br = {n: rows[(n, "LAYOUT", "RW", 0.1)]["BONF"][0] / max(1, rows[(n, "LAYOUT", "RW", 0.1)]["LINS"][0]) for n in P}
    H["H290"] = all(v >= 5 for v in br.values())
    cr = {n: rows[(n, "LAYOUT", "RW", 0.1)]["CAL"][0] / rows[(n, "LAYOUT", "RW", 0.1)]["BONF"][0] for n in P}
    cf = {n: rows[(n, "LAYOUT", "RW", 0.1)]["CAL_fresh"] for n in P}
    H["H291"] = all(v <= 0.8 for v in cr.values()) and all(v <= 0.02 for v in cf.values())
    cut = 1 - rows[("g1", "BANDS k+0", "RW", 0.1)]["CAL"][0] / rows[("g1", "LAYOUT", "RW", 0.1)]["CAL"][0]
    cut_lin = 1 - rows[("g1", "BANDS k+0", "LIN", 0.1)]["CAL"][0] / rows[("g1", "LAYOUT", "LIN", 0.1)]["CAL"][0]
    H["H292"] = cut >= 0.70
    s_l, s_b = C["g1|LAYOUT|RW|0.1|15.0"], C["g1|BANDS k+0|RW|0.1|15.0"]
    H["H293"] = s_l > 0.05 and s_b < 0.03
    be = E["g1|RW|0.1"]
    H["H294"] = be >= 10 * 0.020
    hv = lambda k: "held" if H[k] else "refuted"
    p("\n## E. Hypotheses (registered in LOG.md before this run)")
    p(f"H288 (violation probability nondecreasing in E): largest decrease {worst:.2e} -> {hv('H288')}")
    p(f"H289 (LINS fails the wall with probability over 50% under RW, D1 0.1, LAYOUT): G1 {lf['g1']:.4f}, "
      f"H1 {lf['h1']:.4f} -> {hv('H289')}")
    p(f"H290 (BONF / LINS re-zeros at least 5, RW, D1 0.1, LAYOUT): G1 {br['g1']:.2f}, H1 {br['h1']:.2f} -> {hv('H290')}")
    p(f"H291 (CAL / BONF at most 0.8 and fresh failure at most 2%): G1 {cr['g1']:.3f} ({100 * cf['g1']:.2f}%), "
      f"H1 {cr['h1']:.3f} ({100 * cf['h1']:.2f}%) -> {hv('H291')}")
    p(f"H292 (G1 BANDS k+0 cuts CAL re-zeros by at least 70% under RW, D1 0.1): {100 * cut:.1f}% (linear: "
      f"{100 * cut_lin:.1f}%) -> {hv('H292')}")
    p(f"H293 (G1 under RW, D1 0.1, CAL, c 15 s: LAYOUT over 5%, BANDS under 3% of the cycle): LAYOUT {100 * s_l:.2f}%, "
      f"BANDS {100 * s_b:.2f}% -> {hv('H293')}")
    p(f"H294 (G1 BEST break-even at least 0.20 s under RW, D1 0.1, CAL, c 15 s): {be:.3f} s -> {hv('H294')}")

    out["rows"] = {"|".join(map(str, k)): v for k, v in rows.items()}
    out["C"], out["E"], out["H"] = C, E, H
    text = "\n".join(L) + "\n"
    open(os.path.join(HERE, "results.txt"), "w").write(text)
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, sort_keys=True)
    print(text)


if __name__ == "__main__":
    main()
