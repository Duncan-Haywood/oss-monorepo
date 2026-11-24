"""Milestone 74: optimal risk-constrained re-zero schedules under a random-walk bias, offline from
milestones 72 and 73.

python experiments/m74_riskopt/run.py  (numpy, scipy; about 10 minutes on 4 processes). Writes
results.txt and results.json.
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
from buildbot_sheathing import drift as D, rezero as R, riskdp as Q  # noqa: E402

_spec = importlib.util.spec_from_file_location("m73", os.path.join(ROOT, "experiments", "m73_randomwalk", "run.py"))
M73 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(M73)
M72 = M73.M72
R73 = json.load(open(os.path.join(ROOT, "experiments", "m73_randomwalk", "results.json")))

D1S = [0.05, 0.1, 0.2]
PLANS = M73.PLANS
ALPHA = M73.ALPHA
TRIALS, SEED_OPT = M73.TRIALS, 740
PERIOD = len(M72.NAILS)
GRID = 24
CS = [5.0, 15.0, 30.0]


def chain_fail(LS, m, st):
    return 1.0 - float(np.exp(Q.wall_logsurv(LS, PERIOD, m, st)))


def pose2(g, t, a, sig, LS):
    """Fewest re-zeros over (eps_weak, eps_rest) on a log grid with chain failure <= ALPHA."""
    m = len(a)
    grid = np.geomspace(ALPHA / m, 0.5, GRID)
    ua = np.unique(a)
    best = None
    for ew in grid:
        for er in grid:
            T = {x: D.deadline(x, 0.0, sig, ew if x <= a.min() + 1e-12 else er) for x in ua}
            st = R.greedy(g, t, np.array([T[x] for x in a]))
            if st is None or (best is not None and len(st) >= best[0]):
                continue
            f = chain_fail(LS, m, st)
            if f <= ALPHA:
                best = (len(st), f, float(ew), float(er))
    return best


def one_row(arg):
    (n, plan, d1), a1 = arg
    g, t, a = M72.wall(a1)
    m = len(a)
    _, sig = D.matched("RW", d1)
    r = {"m": m}
    LS = Q.segment_logsurv(g, t, a, PERIOD, sig, ALPHA, dr_frac=1 / 3)
    r73 = R73["rows"][f"{n}|{plan}|RW|{d1}"]
    st_b = M73.schedule(g, t, a, "BONF", "RW", d1)
    r["BONF"] = (len(st_b), chain_fail(LS, m, st_b))
    st_c = M73.schedule(g, t, a, "CAL", "RW", d1, r73["eps"])
    r["CAL"] = (len(st_c), chain_fail(LS, m, st_c), r73["CAL_fresh"], r73["CAL"][0])
    r["POSE2"] = pose2(g, t, a, sig, LS)
    k, st_o, lsv = Q.optimal(LS, PERIOD, m, ALPHA)
    r["OPT"] = (k, 1.0 - float(np.exp(lsv)), D.wall_fail(g, t, a, st_o, 0.0, sig, TRIALS, SEED_OPT))
    LS2 = Q.segment_logsurv(g, t, a, PERIOD, sig, ALPHA, dr_frac=1 / 6)
    k2, st2, lsv2 = Q.optimal(LS2, PERIOD, m, ALPHA)
    r["OPT_fine"] = (k2, 1.0 - float(np.exp(lsv2)), chain_fail(LS2, m, st_o))
    seg = np.diff([0] + st_o + [m])
    r["OPT_seg"] = (int(seg.min()), float(np.median(seg)), int(seg.max()))
    print(n, plan, d1, r, flush=True)
    return r


def main():
    P = M73.plans()
    keys = [(n, plan, d1) for n in P for plan in PLANS for d1 in D1S]
    with Pool(4) as pool:
        res = pool.map(one_row, [(k, P[k[0]][k[1]]) for k in keys], chunksize=1)
    rows = dict(zip(keys, res))
    L = []
    p = L.append
    p("# Milestone 74: optimal re-zero schedules for a 1% wall risk under a random-walk bias (milestone 72's 100-sheet "
      "wall and pose plans, lateral 0; RW matched to D1, swept, not sourced; exact segment risk from the 3-D Bessel "
      f"radial chain, dr = sigma sqrt(tau)/3, refinement dr/6; Monte Carlo check {TRIALS} paths, seed {SEED_OPT})")
    p("\n## A. Re-zeros per 100 sheets (chain wall failure): robot | plan | D1 N | BONF | CAL (m73 MC fresh) | "
      "POSE2 (eps weak, rest) | OPT (MC) | OPT at dr/6 (its own; m74 OPT schedule) | OPT segment presses min/median/max")
    for (n, plan, d1), r in rows.items():
        b, c, q, o, f = r["BONF"], r["CAL"], r["POSE2"], r["OPT"], r["OPT_fine"]
        qs = "-" if q is None else f"{q[0]} ({q[1]:.4f}; {q[2]:.2e}, {q[3]:.2e})"
        p(f"  {n} | {plan} | {d1} | {b[0]} ({b[1]:.4f}) | {c[0]} ({c[1]:.4f}; {c[2]:.4f}) | {qs} | "
          f"{o[0]} ({o[1]:.4f}; {o[2]:.4f}) | {f[0]} ({f[1]:.4f}; {f[2]:.4f}) | "
          f"{r['OPT_seg'][0]}/{r['OPT_seg'][1]:g}/{r['OPT_seg'][2]}")

    p("\n## B. Re-zero share of the 116 s sheet cycle, OPT: robot | plan | D1 N | c = 5, 15, 30 s")
    C = {}
    for (n, plan, d1), r in rows.items():
        cells = []
        for c in CS:
            sh = r["OPT"][0] * c / M73.N_SHEETS / M73.CYCLE
            C[f"{n}|{plan}|{d1}|{c}"] = sh
            cells.append(f"{100 * sh:.2f}%")
        p(f"  {n} | {plan} | {d1} | " + " | ".join(cells))

    H, X = {}, {}
    se = lambda f: np.sqrt(max(f * (1 - f), 1e-12) / TRIALS)
    dev = [abs(r["CAL"][1] - r["CAL"][2]) - (3 * se(r["CAL"][1]) + 0.001) for r in rows.values()]
    bmax = max(r["BONF"][1] for r in rows.values())
    H["H295"] = max(dev) <= 0 and bmax <= ALPHA and all(r["CAL"][0] == r["CAL"][3] for r in rows.values())
    X["H295"] = (max(dev), bmax)
    dk = max(abs(r["OPT"][0] - r["OPT_fine"][0]) for r in rows.values())
    rel = max(abs(r["OPT_fine"][2] - r["OPT"][1]) / max(r["OPT"][1], 1e-9) for r in rows.values() if r["OPT"][1] > 1e-6)
    H["H296"] = dk <= 1 and rel < 0.10
    X["H296"] = (dk, rel)
    g1 = rows[("g1", "LAYOUT", 0.1)]["OPT"][0]
    H["H297"] = g1 >= 90
    big = [r for r in rows.values() if r["CAL"][0] >= 5]
    sav = [1 - r["OPT"][0] / r["CAL"][0] for r in big]
    H["H298"] = float(np.median(sav)) >= 0.15
    X["H298"] = (float(np.median(sav)), len(big), float(min(sav)), float(max(sav)))
    gap = [r["POSE2"][0] - r["OPT"][0] - max(1, 0.1 * r["OPT"][0]) if r["POSE2"] else 1e9 for r in big]
    H["H299"] = max(gap) <= 0
    mc = max(r["OPT"][2] for r in rows.values())
    H["H300"] = mc <= 0.02
    sh = C["g1|BANDS k+0|0.1|15.0"]
    H["H301"] = sh < 0.03
    hv = lambda k: "held" if H[k] else "refuted"
    p("\n## C. Hypotheses (registered in LOG.md before this run)")
    p(f"H295 (chain matches m73's CAL Monte Carlo within 3 SE + 0.001; BONF chain failure <= 1%): largest excess "
      f"{X['H295'][0]:+.4f}, BONF max {bmax:.4f} -> {hv('H295')}")
    p(f"H296 (dr/6 moves OPT by <= 1 re-zero and its failure < 10% relative): largest count change {dk}, largest "
      f"relative failure change {100 * rel:.1f}% -> {hv('H296')}")
    p(f"H297 (G1 LAYOUT D1 0.1: OPT >= 90 re-zeros): {g1} -> {hv('H297')}")
    p(f"H298 (median OPT saving against CAL >= 15% over the {len(big)} rows with CAL >= 5): median "
      f"{100 * X['H298'][0]:.1f}% (range {100 * X['H298'][2]:.1f}% to {100 * X['H298'][3]:.1f}%) -> {hv('H298')}")
    p(f"H299 (POSE2 within max(1, 10%) of OPT where CAL >= 5): worst excess {max(gap):+.1f} -> {hv('H299')}")
    p(f"H300 (OPT fails <= 2% of {TRIALS} fresh Monte Carlo walls): worst {100 * mc:.2f}% -> {hv('H300')}")
    p(f"H301 (G1 BANDS k+0 D1 0.1 c 15 s: OPT under 3% of the cycle): {100 * sh:.2f}% -> {hv('H301')}")

    out = {"alpha": ALPHA, "trials": TRIALS, "d1": D1S, "rows": {"|".join(map(str, k)): v for k, v in rows.items()},
           "C": C, "H": H, "X": X}
    text = "\n".join(L) + "\n"
    open(os.path.join(HERE, "results.txt"), "w").write(text)
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, sort_keys=True)
    print(text)


if __name__ == "__main__":
    main()
