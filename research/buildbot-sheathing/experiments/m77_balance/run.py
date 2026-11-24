"""Milestone 77: BALANCE, the tracked-residual tare schedule that spends a wall risk budget over the
wall instead of a per-sheet level, against milestone 76's READ and TRACK and milestone 75's open-loop
optimum (OPT), offline from milestones 72, 73, 75 and 76.

python experiments/m77_balance/run.py  (numpy, scipy; a few minutes on 4 processes). Writes
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
from buildbot_sheathing import closedloop as C, drift as D, riskdp as Q  # noqa: E402

_spec = importlib.util.spec_from_file_location("m73", os.path.join(ROOT, "experiments", "m73_randomwalk", "run.py"))
M73 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(M73)
M72 = M73.M72
R75 = json.load(open(os.path.join(ROOT, "experiments", "m75_riskopt", "results.json")))
R76 = json.load(open(os.path.join(ROOT, "experiments", "m76_closedloop", "results.json")))

D1S = [0.05, 0.1, 0.2]
PLANS = M73.PLANS
ALPHA = M73.ALPHA
SHEETS = M73.N_SHEETS
NOISE = [0.0, 0.005, 0.01, 0.02, 0.05]       # N a axis, swept as in milestone 76
TRIALS, SEED, FRESH, SEED_FRESH = 4000, 770, 10000, 7700
BETA_ROWS = [("g1", "BANDS k+0", 0.1), ("g1", "LAYOUT", 0.1), ("h1", "LAYOUT", 0.1)]
BETAS, BETA_S = [0.01, 0.02], 0.01


def one_row(arg):
    (n, plan, d1), a = arg
    a = np.asarray(a, float)
    m = len(a)
    _, sig = D.matched("RW", d1)
    tau, pre = M72.TAU, M72.PRE
    risk = C.SheetRisk(a, tau, sig)
    LS = Q.segment_logsurv(np.zeros(m), np.full(m, tau), a, m, sig, 0.5)
    r = {}
    for s in NOISE:
        cal = C.calibrate("BALANCE", a, tau, pre, SHEETS, sig, s, ALPHA, risk, LS, TRIALS, SEED)
        if cal is None:
            r[str(s)] = None
            continue
        eps, (f, mean, p95) = cal
        fr = C.simulate("BALANCE", a, tau, pre, SHEETS, sig, s, eps, risk, LS, FRESH, SEED_FRESH)
        starts, rest = C.in_sheet_plan(LS, m, eps)
        cut = [0] + list(starts) + [m]
        f0 = 1.0 - np.exp(sum(LS[x][y - x - 1] for x, y in zip(cut[:-1], cut[1:])))
        q = C.per_sheet_risk(risk, starts, rest, f0, C.p_sequence(m, starts, tau, pre, sig, s, SHEETS))
        sched, cost = C.balance_schedule(q, SHEETS, eps * SHEETS)
        row = {"eps": eps, "cal": [f, mean, p95], "fresh": list(fr), "union": cost, "q1": q[1],
               "qinf": q[-1], "in_sheet": len(starts), "tares": len(sched)}
        if (n, plan, d1) in BETA_ROWS and s == BETA_S:
            row["beta"] = {str(b): list(C.simulate("BALANCE", a, tau, pre, SHEETS, sig, s, eps, risk, LS, FRESH,
                                                   SEED_FRESH, beta=b)) for b in BETAS}
        r[str(s)] = row
    print(n, plan, d1, flush=True)
    return r


def main():
    P = M73.plans()
    keys = [(n, plan, d1) for n in P for plan in PLANS for d1 in D1S]
    with Pool(4) as pool:
        res = pool.map(one_row, [(k, P[k[0]][k[1]]) for k in keys], chunksize=1)
    rows = dict(zip(keys, res))
    old = lambda k, pol, s: R76["rows"]["|".join(map(str, k))][f"{pol}|{s}"]
    opt = lambda k: R75["rows"]["|".join(map(str, k))]["OPT"][0]
    L = []
    p = L.append
    p("# Milestone 77: BALANCE, a wall risk budget spread over the tracked residual's tare schedule (milestone 72's "
      "100-sheet wall and pose plans, lateral 0; RW matched to D1, swept, not sourced; reading noise s a axis swept; "
      f"budget eps x {SHEETS} calibrated on {TRIALS} Monte Carlo walls (seed {SEED}), checked on {FRESH} fresh walls "
      f"(seed {SEED_FRESH}); alpha {ALPHA}; READ and TRACK from milestone 76, OPT from milestone 75)")
    p("\n## A. Mean re-zeros per 100 sheets (fresh wall failure %): robot | plan | D1 N | OPT | s | BALANCE | "
      "TRACK | READ | q1 | q_inf")
    fmt = lambda x: "-" if x is None else f"{x['fresh'][1]:.1f} ({100 * x['fresh'][0]:.2f})"
    for k, r in rows.items():
        for s in NOISE:
            b = r[str(s)]
            qs = "- | -" if b is None else f"{b['q1']:.2e} | {b['qinf']:.2e}"
            p(f"  {k[0]} | {k[1]} | {k[2]} | {opt(k)} | {s} | {fmt(b)} | {fmt(old(k, 'TRACK', s))} | "
              f"{fmt(old(k, 'READ', s))} | {qs}")

    p(f"\n## B. Systematic reading error beta along x, unknown to the filter (s = {BETA_S}, budget calibrated at "
      "beta 0): robot | plan | D1 N | beta | BALANCE fresh failure % | mean re-zeros | TRACK failure % (m76)")
    for k in BETA_ROWS:
        x = rows[k][str(BETA_S)]
        t = old(k, "TRACK", BETA_S)
        p(f"  {k[0]} | {k[1]} | {k[2]} | 0 | {100 * x['fresh'][0]:.2f} | {x['fresh'][1]:.1f} | "
          f"{100 * t['fresh'][0]:.2f}")
        for b in BETAS:
            y = x["beta"][str(b)]
            p(f"  {k[0]} | {k[1]} | {k[2]} | {b} | {100 * y[0]:.2f} | {y[1]:.1f} | {100 * t['beta'][str(b)][0]:.2f}")

    H, X = {}, {}
    allx = [x for r in rows.values() for s in NOISE for x in [r[str(s)]] if x]
    worst = max(x["fresh"][0] for x in allx)
    missing = sum(1 for r in rows.values() for s in NOISE if r[str(s)] is None)
    H["H314"] = worst <= 0.015 and missing == 0
    X["H314"] = (worst, missing)
    viol = [("|".join(map(str, k)), s, r[str(s)]["fresh"][1], old(k, "TRACK", s)["fresh"][1])
            for k, r in rows.items() for s in NOISE
            if r[str(s)] and old(k, "TRACK", s) and r[str(s)]["fresh"][1] > old(k, "TRACK", s)["fresh"][1]]
    H["H315"] = not viol
    X["H315"] = viol
    g = rows[("g1", "LAYOUT", 0.1)]["0.02"]["fresh"][1]
    H["H316"] = abs(g - opt(("g1", "LAYOUT", 0.1))) <= 3
    X["H316"] = (g, opt(("g1", "LAYOUT", 0.1)))
    cells = [(k, s) for k in rows for s in NOISE if old(k, "TRACK", s) and old(k, "TRACK", s)["fresh"][1] >= 10
             and rows[k][str(s)]]
    sav = [1 - rows[k][str(s)]["fresh"][1] / old(k, "TRACK", s)["fresh"][1] for k, s in cells]
    H["H317"] = bool(sav) and float(np.median(sav)) >= 0.20
    X["H317"] = (float(np.median(sav)) if sav else None, len(cells), min(sav, default=None), max(sav, default=None))
    big = [k for k in rows if opt(k) >= 10]
    wins = [k for k in big if rows[k]["0.01"] and rows[k]["0.01"]["fresh"][1]
            <= min(x["fresh"][1] for pol in ("READ", "TRACK") for x in [old(k, pol, 0.01)] if x)]
    H["H318"] = len(wins) >= 9
    X["H318"] = (len(wins), len(big))
    bf = rows[("g1", "LAYOUT", 0.1)][str(BETA_S)]["beta"]["0.02"][0]
    H["H319"] = bf > 0.05
    X["H319"] = bf
    hv = lambda k: "held" if H[k] else "refuted"
    p("\n## C. Hypotheses (registered in LOG.md before this run)")
    p(f"H314 (every calibrated BALANCE schedule fails <= 1.5% of {FRESH} fresh walls): worst {100 * worst:.2f}%, "
      f"uncalibratable {missing} -> {hv('H314')}")
    p(f"H315 (BALANCE mean <= TRACK mean on every row and s): {len(viol)} violations {viol[:6]} -> {hv('H315')}")
    p(f"H316 (G1 LAYOUT D1 0.1, s 0.02: BALANCE within 3 re-zeros of OPT): {g:.1f} against {X['H316'][1]} -> "
      f"{hv('H316')}")
    p(f"H317 (median saving over TRACK on the {len(cells)} cells where TRACK needs >= 10 is >= 20%): "
      + ("-" if not sav else f"{100 * X['H317'][0]:.1f}% (range {100 * X['H317'][2]:.1f}% to "
                              f"{100 * X['H317'][3]:.1f}%)") + f" -> {hv('H317')}")
    p(f"H318 (s 0.01: BALANCE <= min(READ, TRACK) on >= 9 of the {len(big)} rows with OPT >= 10): {len(wins)} -> "
      f"{hv('H318')}")
    p(f"H319 (beta 0.02, s 0.01, G1 LAYOUT 0.1: BALANCE fails > 5% of fresh walls): {100 * bf:.2f}% -> {hv('H319')}")

    out = {"alpha": ALPHA, "trials": TRIALS, "fresh": FRESH, "noise": NOISE, "d1": D1S,
           "rows": {"|".join(map(str, k)): v for k, v in rows.items()}, "H": H, "X": X}
    text = "\n".join(L) + "\n"
    open(os.path.join(HERE, "results.txt"), "w").write(text)
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, sort_keys=True)
    print(text)


if __name__ == "__main__":
    main()
