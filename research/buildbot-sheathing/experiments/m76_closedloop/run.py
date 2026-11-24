"""Milestone 76: closed-loop re-zero schedules from one noisy free-air bias reading a sheet, against
milestone 75's open-loop optimum (OPT), offline from milestones 72, 73 and 75.

python experiments/m76_closedloop/run.py  (numpy, scipy; about 25 minutes on 4 processes). Writes
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

D1S = [0.05, 0.1, 0.2]
PLANS = M73.PLANS
ALPHA = M73.ALPHA
SHEETS = M73.N_SHEETS
NOISE = [0.0, 0.005, 0.01, 0.02, 0.05]       # N a axis, swept (see LOG.md: Robotiq FT 300 0.1 N raw)
POLICIES = ["READ", "TRACK"]
TRIALS, SEED, FRESH, SEED_FRESH = 4000, 760, 10000, 7600
BETA_ROWS = [("g1", "BANDS k+0", 0.1), ("g1", "LAYOUT", 0.1), ("h1", "LAYOUT", 0.1)]
BETAS, BETA_S = [0.01, 0.02], 0.01
C_TARE = 15.0


def one_row(arg):
    (n, plan, d1), a = arg
    a = np.asarray(a, float)
    m = len(a)
    _, sig = D.matched("RW", d1)
    tau, pre = M72.TAU, M72.PRE
    risk = C.SheetRisk(a, tau, sig)
    LS = Q.segment_logsurv(np.zeros(m), np.full(m, tau), a, m, sig, 0.5)
    r = {"OPT": R75["rows"][f"{n}|{plan}|{d1}"]["OPT"][0]}
    for pol in POLICIES:
        for s in NOISE:
            cal = C.calibrate(pol, a, tau, pre, SHEETS, sig, s, ALPHA, risk, LS, TRIALS, SEED)
            if cal is None:
                r[f"{pol}|{s}"] = None
                continue
            eps, (f, mean, p95) = cal
            fr = C.simulate(pol, a, tau, pre, SHEETS, sig, s, eps, risk, LS, FRESH, SEED_FRESH)
            row = {"eps": eps, "cal": [f, mean, p95], "fresh": list(fr)}
            if (n, plan, d1) in BETA_ROWS and s == BETA_S:
                row["beta"] = {str(b): list(C.simulate(pol, a, tau, pre, SHEETS, sig, s, eps, risk, LS, FRESH,
                                                       SEED_FRESH, beta=b)) for b in BETAS}
            r[f"{pol}|{s}"] = row
    print(n, plan, d1, flush=True)
    return r


def main():
    P = M73.plans()
    keys = [(n, plan, d1) for n in P for plan in PLANS for d1 in D1S]
    with Pool(4) as pool:
        res = pool.map(one_row, [(k, P[k[0]][k[1]]) for k in keys], chunksize=1)
    rows = dict(zip(keys, res))
    L = []
    p = L.append
    p("# Milestone 76: closed-loop re-zeros from one free-air bias reading a sheet (milestone 72's 100-sheet wall "
      "and pose plans, lateral 0; RW matched to D1, swept, not sourced; reading noise s a axis swept; per-sheet "
      f"chance constraint from the radial chain, eps calibrated on {TRIALS} Monte Carlo walls (seed {SEED}), "
      f"checked on {FRESH} fresh walls (seed {SEED_FRESH}); alpha {ALPHA})")
    p("\n## A. Mean re-zeros per 100 sheets (fresh wall failure %): robot | plan | D1 N | OPT (m75) | policy | "
      + " | ".join(f"s={s}" for s in NOISE))
    best = lambda r, s: min((r[f"{pol}|{s}"]["fresh"][1] for pol in POLICIES if r[f"{pol}|{s}"]), default=None)
    for (n, plan, d1), r in rows.items():
        for pol in POLICIES:
            cells = []
            for s in NOISE:
                x = r[f"{pol}|{s}"]
                cells.append("-" if x is None else f"{x['fresh'][1]:.1f} ({100 * x['fresh'][0]:.2f})")
            p(f"  {n} | {plan} | {d1} | {r['OPT']} | {pol} | " + " | ".join(cells))

    p(f"\n## B. Break-even reading time (s a sheet) at c = {C_TARE:g} s, better policy: (OPT - mean) c / 100: "
      "robot | plan | D1 N | " + " | ".join(f"s={s}" for s in NOISE))
    BE = {}
    for (n, plan, d1), r in rows.items():
        cells = []
        for s in NOISE:
            b = best(r, s)
            v = None if b is None else (r["OPT"] - b) * C_TARE / SHEETS
            BE[f"{n}|{plan}|{d1}|{s}"] = v
            cells.append("-" if v is None else f"{v:.2f}")
        p(f"  {n} | {plan} | {d1} | " + " | ".join(cells))

    p(f"\n## C. Systematic reading error beta along x, unknown to the filter (s = {BETA_S}, eps calibrated at beta 0): "
      "robot | plan | D1 N | policy | beta | fresh failure % | mean re-zeros")
    for k in BETA_ROWS:
        for pol in POLICIES:
            x = rows[k][f"{pol}|{BETA_S}"]
            p(f"  {k[0]} | {k[1]} | {k[2]} | {pol} | 0 | {100 * x['fresh'][0]:.2f} | {x['fresh'][1]:.1f}")
            for b in BETAS:
                y = x["beta"][str(b)]
                p(f"  {k[0]} | {k[1]} | {k[2]} | {pol} | {b} | {100 * y[0]:.2f} | {y[1]:.1f}")

    H, X = {}, {}
    allx = [x for r in rows.values() for pol in POLICIES for s in NOISE for x in [r[f"{pol}|{s}"]] if x]
    worst = max(x["fresh"][0] for x in allx)
    missing = sum(1 for r in rows.values() for pol in POLICIES for s in NOISE if r[f"{pol}|{s}"] is None)
    H["H307"] = worst <= 0.015 and missing == 0
    X["H307"] = (worst, missing)
    g = rows[("g1", "LAYOUT", 0.1)]
    H["H308"] = g["READ|0.0"]["fresh"][1] <= 0.5 * g["OPT"]
    X["H308"] = (g["READ|0.0"]["fresh"][1], g["OPT"])
    sv = 1 - best(g, 0.02) / g["OPT"]
    H["H309"] = sv < 0.20
    X["H309"] = sv
    big = [r for r in rows.values() if r["OPT"] >= 10]
    sav = [1 - best(r, 0.01) / r["OPT"] for r in big]
    H["H310"] = float(np.median(sav)) >= 0.40
    X["H310"] = (float(np.median(sav)), len(big), float(min(sav)), float(max(sav)))
    viol = [(k, s, r[f"TRACK|{s}"]["fresh"][1] - r[f"READ|{s}"]["fresh"][1]) for k, r in rows.items() for s in NOISE
            if r[f"TRACK|{s}"] and r[f"READ|{s}"] and r[f"TRACK|{s}"]["fresh"][1] > r[f"READ|{s}"]["fresh"][1]]
    H["H311"] = not viol
    X["H311"] = [("|".join(map(str, k)), s, d) for k, s, d in viol]
    gb = rows[("g1", "BANDS k+0", 0.1)]
    tf, rf = gb[f"TRACK|{BETA_S}"]["beta"]["0.02"][0], gb[f"READ|{BETA_S}"]["beta"]["0.02"][0]
    H["H312"] = tf > 0.05 and rf <= 0.02
    X["H312"] = (tf, rf)
    be = BE[f"g1|BANDS k+0|0.1|{BETA_S}"]
    H["H313"] = be is not None and be >= 1.0
    X["H313"] = be
    hv = lambda k: "held" if H[k] else "refuted"
    p("\n## D. Hypotheses (registered in LOG.md before this run)")
    p(f"H307 (every calibrated schedule fails <= 1.5% of {FRESH} fresh walls): worst {100 * worst:.2f}%, "
      f"uncalibratable {missing} -> {hv('H307')}")
    p(f"H308 (G1 LAYOUT D1 0.1, READ at s = 0: mean <= 0.5 x OPT): {X['H308'][0]:.1f} against {X['H308'][1]} -> "
      f"{hv('H308')}")
    p(f"H309 (G1 LAYOUT D1 0.1, better policy at s = 0.02 saves < 20% of OPT): {100 * sv:.1f}% -> {hv('H309')}")
    p(f"H310 (median saving of the better policy at s = 0.01 over the {len(big)} rows with OPT >= 10 is >= 40%): "
      f"{100 * X['H310'][0]:.1f}% (range {100 * X['H310'][2]:.1f}% to {100 * X['H310'][3]:.1f}%) -> {hv('H310')}")
    p(f"H311 (TRACK mean <= READ mean on every row and s): {len(viol)} violations {X['H311'][:6]} -> {hv('H311')}")
    p(f"H312 (beta 0.02 N, s 0.01, G1 BANDS k+0 0.1: TRACK fresh failure > 5%, READ <= 2%): TRACK {100 * tf:.2f}%, "
      f"READ {100 * rf:.2f}% -> {hv('H312')}")
    p(f"H313 (G1 BANDS k+0 0.1, s 0.01: break-even reading time >= 1 s a sheet at c 15 s): "
      f"{'-' if be is None else f'{be:.2f} s'} -> {hv('H313')}")

    out = {"alpha": ALPHA, "trials": TRIALS, "fresh": FRESH, "noise": NOISE, "d1": D1S,
           "rows": {"|".join(map(str, k)): v for k, v in rows.items()}, "BE": BE, "H": H, "X": X}
    text = "\n".join(L) + "\n"
    open(os.path.join(HERE, "results.txt"), "w").write(text)
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, sort_keys=True)
    print(text)


if __name__ == "__main__":
    main()
