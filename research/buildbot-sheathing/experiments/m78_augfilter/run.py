"""Milestone 78: learning the free-air reading's systematic error (beta) in an augmented filter.

Milestone 77's BALANCE (here NAIVE: its filter assumes beta = 0) against AUG (the filter carries beta with
prior N(0, sb^2 I) and learns it from the readings that follow tares) and AUG+R (AUG plus one free-air
reading right after every sheet-start tare), and NAIVE-CAL (NAIVE recalibrated with beta drawn from
the prior), offline from milestones 72, 73, 75 and 77.

python experiments/m78_augfilter/run.py  (numpy, scipy; about 40 minutes on 4 processes). Writes
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
from buildbot_sheathing import augfilter as A, closedloop as C, drift as D, riskdp as Q  # noqa: E402

_spec = importlib.util.spec_from_file_location("m73", os.path.join(ROOT, "experiments", "m73_randomwalk", "run.py"))
M73 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(M73)
M72 = M73.M72
R75 = json.load(open(os.path.join(ROOT, "experiments", "m75_riskopt", "results.json")))
R77 = json.load(open(os.path.join(ROOT, "experiments", "m77_balance", "results.json")))

D1S = [0.05, 0.1, 0.2]
PLANS = M73.PLANS
ALPHA = M73.ALPHA
SHEETS = M73.N_SHEETS
NOISE = [0.01, 0.02]                  # N a axis, from milestone 76's sweep
SB = [0.01, 0.02]                     # prior sd of beta a axis, N, swept (no published figure)
TRIALS, SEED, FRESH, SEED_FRESH = 4000, 780, 10000, 7800
if os.environ.get("M78_QUICK"):      # a fast dry run of the whole script; its numbers are not results
    TRIALS, FRESH = 200, 200
POL = {"NAIVE-CAL": (0.0, False), "AUG": (None, False), "AUG+R": (None, True)}   # (sb_filter, post_read)
STRESS_ROWS = [("g1", "BANDS k+0", 0.1), ("g1", "LAYOUT", 0.1), ("h1", "LAYOUT", 0.1)]
STRESS = [0.02, 0.04]                 # fixed beta along x at sb 0.02, s 0.01 (1 and 2 prior sd)


CACHE = os.environ.get("M78_CACHE")   # optional directory: finished rows are kept there, so a restart resumes


def one_row(arg):
    k, a = arg
    if CACHE:
        f = os.path.join(CACHE, "|".join(map(str, k)).replace("|", "_").replace(" ", "-") + ".json")
        if os.path.exists(f):
            return json.load(open(f))
    r = _one_row(arg)
    if CACHE:
        json.dump(r, open(f + ".tmp", "w"))
        os.replace(f + ".tmp", f)
    return r


def _one_row(arg):
    (n, plan, d1), a = arg
    a = np.asarray(a, float)
    m = len(a)
    _, sig = D.matched("RW", d1)
    tau, pre = M72.TAU, M72.PRE
    risk = C.SheetRisk(a, tau, sig)
    LS = Q.segment_logsurv(np.zeros(m), np.full(m, tau), a, m, sig, 0.5)
    key = "|".join(map(str, (n, plan, d1)))
    r = {}
    for s in NOISE:
        eps77 = R77["rows"][key][str(s)]["eps"]
        for sb in SB:
            cell = {"NAIVE": list(A.simulate(a, tau, pre, SHEETS, sig, s, eps77, risk, LS, FRESH, SEED_FRESH,
                                             0.0, sb_true=sb))}
            for pol, (sbf, pr) in POL.items():
                sbf = sb if sbf is None else sbf
                cal = A.calibrate(a, tau, pre, SHEETS, sig, s, ALPHA, risk, LS, TRIALS, SEED, sbf, sb, pr)
                if cal is None:
                    cell[pol] = None
                    continue
                eps, c = cal
                fr = A.simulate(a, tau, pre, SHEETS, sig, s, eps, risk, LS, FRESH, SEED_FRESH, sbf, sb_true=sb,
                                post_read=pr)
                pl = A.plan(a, tau, pre, SHEETS, sig, s, eps, risk, LS, sbf, pr)
                x = {"eps": eps, "cal": list(c), "fresh": list(fr), "tares": len(pl[1]), "in_sheet": len(pl[0]),
                     "union": pl[2]}
                if (n, plan, d1) in STRESS_ROWS and s == 0.01 and sb == 0.02:
                    x["stress"] = {str(b): list(A.simulate(a, tau, pre, SHEETS, sig, s, eps, risk, LS, FRESH,
                                                           SEED_FRESH, sbf, beta=[b, 0, 0], post_read=pr))
                                   for b in [0.0] + STRESS}
                cell[pol] = x
            r[f"{s}|{sb}"] = cell
    print(n, plan, d1, flush=True)
    return r


def main():
    P = M73.plans()
    keys = [(n, plan, d1) for n in P for plan in PLANS for d1 in D1S]
    with Pool(4) as pool:
        res = pool.map(one_row, [(k, P[k[0]][k[1]]) for k in keys], chunksize=1)
    rows = dict(zip(keys, res))
    ks = lambda k: "|".join(map(str, k))
    opt = lambda k: R75["rows"][ks(k)]["OPT"][0]
    bal = lambda k, s: R77["rows"][ks(k)][str(s)]["fresh"][1]
    L = []
    p = L.append
    p("# Milestone 78: an augmented filter that learns the free-air reading's systematic error beta (milestone 72's "
      "100-sheet wall and pose plans, lateral 0; RW matched to D1, swept, not sourced; reading noise s and prior sd "
      f"sb of beta a axis swept, not sourced; beta drawn per wall from N(0, sb^2 I); budgets calibrated on {TRIALS} "
      f"Monte Carlo walls (seed {SEED}) to alpha {ALPHA}, checked on {FRESH} fresh walls (seed {SEED_FRESH}); "
      "NAIVE = milestone 77's BALANCE at its own eps; OPT from milestone 75, open loop, needs no reading)")
    p("\n## A. Mean re-zeros per 100 sheets (fresh wall failure %): robot | plan | D1 N | OPT | s | sb | "
      "BALANCE beta 0 (m77) | NAIVE | NAIVE-CAL | AUG | AUG+R")
    fmt = lambda x: "-" if x is None else f"{x[1]:.1f} ({100 * x[0]:.2f})"
    for k, r in rows.items():
        for s in NOISE:
            for sb in SB:
                c = r[f"{s}|{sb}"]
                p(f"  {k[0]} | {k[1]} | {k[2]} | {opt(k)} | {s} | {sb} | "
                  f"{fmt(R77['rows'][ks(k)][str(s)]['fresh'])} | {fmt(c['NAIVE'])} | "
                  + " | ".join(fmt(c[pol]["fresh"] if c[pol] else None) for pol in POL))

    p("\n## B. A fixed beta along x on walls planned for the prior (s 0.01, sb 0.02): robot | plan | D1 N | beta N | "
      "policy | fresh failure % | mean re-zeros")
    for k in STRESS_ROWS:
        for pol in ("AUG", "AUG+R"):
            x = rows[k]["0.01|0.02"][pol]
            for b in [0.0] + STRESS:
                y = x["stress"][str(b)]
                p(f"  {k[0]} | {k[1]} | {k[2]} | {b} | {pol} | {100 * y[0]:.2f} | {y[1]:.1f}")

    H, X = {}, {}
    cal = [(ks(k), s, sb, pol, c[pol]) for k, r in rows.items() for s in NOISE for sb in SB
           for c in [r[f"{s}|{sb}"]] for pol in ("AUG", "AUG+R")]
    worst = max(x[4]["fresh"][0] for x in cal if x[4])
    missing = sum(1 for x in cal if x[4] is None)
    H["H320"] = worst <= 0.015 and missing == 0
    X["H320"] = (worst, missing)
    g = rows[("g1", "LAYOUT", 0.1)]["0.01|0.02"]
    H["H321"] = g["NAIVE"][0] > 0.20
    X["H321"] = g["NAIVE"][0]
    viol = [(x[0], x[1], x[2]) for x in cal if x[3] == "AUG+R" and x[4]
            and rows[tuple(_k(x[0]))][f"{x[1]}|{x[2]}"]["AUG"]
            and x[4]["fresh"][1] > rows[tuple(_k(x[0]))][f"{x[1]}|{x[2]}"]["AUG"]["fresh"][1]]
    ratio = g["AUG+R"]["fresh"][1] / g["AUG"]["fresh"][1]
    H["H322"] = not viol and ratio <= 0.7
    X["H322"] = (viol, ratio)
    cells = [(k, s) for k in rows for s in NOISE if bal(k, s) >= 10 and rows[k][f"{s}|0.02"]["AUG+R"]]
    exc = [rows[k][f"{s}|0.02"]["AUG+R"]["fresh"][1] / bal(k, s) - 1 for k, s in cells]
    H["H323"] = bool(exc) and float(np.median(exc)) <= 0.15
    X["H323"] = (float(np.median(exc)) if exc else None, len(cells), min(exc, default=None), max(exc, default=None))
    big = [k for k in rows if opt(k) >= 10]
    beat = [k for k in big if rows[k]["0.01|0.02"]["AUG+R"] and rows[k]["0.01|0.02"]["AUG+R"]["fresh"][1] <= opt(k)]
    H["H324"] = len(beat) >= 9
    X["H324"] = (len(beat), len(big))
    st = [rows[k]["0.01|0.02"]["AUG+R"]["stress"]["0.04"][0] for k in STRESS_ROWS]
    H["H325"] = max(st) <= 0.03
    X["H325"] = st
    worse = [k for k in big if rows[k]["0.01|0.02"]["AUG+R"] and (rows[k]["0.01|0.02"]["NAIVE-CAL"] is None or
             rows[k]["0.01|0.02"]["NAIVE-CAL"]["fresh"][1] > rows[k]["0.01|0.02"]["AUG+R"]["fresh"][1])]
    H["H326"] = len(worse) >= 9
    X["H326"] = (len(worse), len(big))
    hv = lambda k: "held" if H[k] else "refuted"
    p("\n## C. Hypotheses (registered in LOG.md before this run)")
    p(f"H320 (every AUG and AUG+R cell calibrates and fails <= 1.5% of {FRESH} fresh walls): worst "
      f"{100 * worst:.2f}%, uncalibratable {missing} -> {hv('H320')}")
    p(f"H321 (G1 LAYOUT D1 0.1, s 0.01, sb 0.02: NAIVE fails > 20%): {100 * X['H321']:.2f}% -> {hv('H321')}")
    p(f"H322 (AUG+R <= AUG on every cell, and <= 0.7 x AUG on G1 LAYOUT D1 0.1, s 0.01, sb 0.02): "
      f"{len(viol)} violations {viol[:6]}, ratio {ratio:.3f} -> {hv('H322')}")
    p(f"H323 (sb 0.02: median excess of AUG+R over m77 BALANCE at beta 0, on the {len(cells)} cells where BALANCE "
      "needs >= 10, is <= 15%): "
      + ("-" if not exc else f"{100 * X['H323'][0]:.1f}% (range {100 * X['H323'][2]:.1f}% to "
                              f"{100 * X['H323'][3]:.1f}%)") + f" -> {hv('H323')}")
    p(f"H324 (s 0.01, sb 0.02: AUG+R <= OPT on >= 9 of the {len(big)} rows with OPT >= 10): {len(beat)} -> "
      f"{hv('H324')}")
    p(f"H325 (s 0.01, sb 0.02, fixed beta 0.04 N along x: AUG+R fails <= 3% on the 3 stress rows): "
      f"{', '.join(f'{100 * v:.2f}%' for v in st)} -> {hv('H325')}")
    p(f"H326 (s 0.01, sb 0.02: NAIVE-CAL needs more re-zeros than AUG+R on >= 9 of the {len(big)} rows with "
      f"OPT >= 10): {len(worse)} -> {hv('H326')}")

    out = {"alpha": ALPHA, "trials": TRIALS, "fresh": FRESH, "noise": NOISE, "sb": SB, "d1": D1S,
           "rows": {ks(k): v for k, v in rows.items()}, "H": H, "X": X}
    text = "\n".join(L) + "\n"
    open(os.path.join(HERE, "results.txt"), "w").write(text)
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, sort_keys=True)
    print(text)


def _k(s):
    n, plan, d1 = s.split("|")
    return n, plan, float(d1)


if __name__ == "__main__":
    main()
