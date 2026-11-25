"""Milestone 74: re-zero risk allocated per press (exact dynamic programme) and a lower bound on any schedule.

python experiments/m74_allocate/run.py  (numpy, scipy; about 15 minutes on 4 processes). Reads milestone 73's
results.json for its BONF and CAL rows; writes results.txt and results.json.
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
from buildbot_sheathing import allocate as A, drift as D  # noqa: E402

_spec = importlib.util.spec_from_file_location("m73", os.path.join(ROOT, "experiments", "m73_randomwalk", "run.py"))
M73 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(M73)
M72 = M73.M72

D1S = M73.D1S
MODELS = ["RW", "MIX"]
PLANS = M73.PLANS
ALPHA = M73.ALPHA
TRIALS, SEED, SEED_FRESH = M73.TRIALS, M73.SEED, M73.SEED_FRESH
PERIOD = len(M72.NAILS)
N_SHEETS, CYCLE = M72.N_SHEETS, M72.CYC["total"]
STEPS = 14


def one_row(arg):
    (n, plan, model, d1), a1 = arg
    g, t, a = M72.wall(a1)
    assert A.check_periodic(g, t, a, PERIOD)
    rho, sig = D.matched(model, d1)
    Q = A.risk_table(g, t, a, PERIOD, rho, sig)
    Cu, Cl = A.segment_risk(Q, "union"), A.segment_risk(Q, "lower")
    M = len(t)
    lb = A.fewest(Cl, M, PERIOD, -np.log1p(-ALPHA))
    du = A.fewest(Cu, M, PERIOD, ALPHA)
    mc = lambda st, seed: D.wall_fail(g, t, a, st, rho, sig, TRIALS, seed)
    r = {"LB": lb[0], "DPU": du[0], "DPU_union": du[2], "DPU_fail": mc(du[1], SEED)}
    # DPC: raise the union budget while the Monte Carlo wall failure stays <= ALPHA
    best = (ALPHA, du[0], du[1], r["DPU_fail"])
    if r["DPU_fail"] <= ALPHA:
        lo = np.log(ALPHA)
        hi = np.log(max(ALPHA * 1.0001, min(float(Cu[0, M - 1]), 1e3)))
        for _ in range(STEPS):
            mid = 0.5 * (lo + hi)
            s = A.fewest(Cu, M, PERIOD, float(np.exp(mid)))
            f = mc(s[1], SEED)
            if f <= ALPHA:
                lo = mid
                if s[0] <= best[1]:
                    best = (float(np.exp(mid)), s[0], s[1], f)
            else:
                hi = mid
    r["DPC_beta"], r["DPC"], r["DPC_fail"] = best[0], best[1], best[3]
    r["DPC_fresh"] = mc(best[2], SEED_FRESH)
    r["DPC_starts"] = [int(x) for x in best[2]]
    # where DPC re-zeros within the sheet, and the allowance of the press right after each re-zero
    r["DPC_residues"] = np.bincount(np.array(best[2], int) % PERIOD, minlength=PERIOD).tolist() if best[2] else []
    print(n, plan, model, d1, {k: v for k, v in r.items() if k not in ("DPC_starts", "DPC_residues")}, flush=True)
    return r


def main():
    P = M73.plans()
    m73 = json.load(open(os.path.join(ROOT, "experiments", "m73_randomwalk", "results.json")))["rows"]
    keys = [(n, plan, model, d1) for n in P for plan in PLANS for model in MODELS for d1 in D1S]
    with Pool(4) as pool:
        res = pool.map(one_row, [(k, P[k[0]][k[1]]) for k in keys])
    rows = dict(zip(keys, res))
    for k, r in rows.items():
        o = m73["|".join(map(str, k))]
        r["BONF"], r["CAL"], r["CAL_fresh"] = o["BONF"][0], o["CAL"][0], o["CAL_fresh"]

    L = []
    p = L.append
    p(f"# Milestone 74: re-zero risk allocated per press (milestone 73's 100-sheet wall, plans and drift models; "
      f"alpha {ALPHA}; Monte Carlo {TRIALS} paths, seed {SEED}, fresh check seed {SEED_FRESH}; BONF and CAL from "
      f"milestone 73)")
    p("\n## A. Re-zeros per 100 sheets: robot | plan | model | D1 N | LB | DPU (union risk; MC fail) | DPC (beta; MC "
      "fail; fresh fail) | BONF | CAL (fresh fail)")
    for (n, plan, model, d1), r in rows.items():
        p(f"  {n} | {plan} | {model} | {d1} | {r['LB']} | {r['DPU']} ({r['DPU_union']:.4f}; {r['DPU_fail']:.4f}) | "
          f"{r['DPC']} ({r['DPC_beta']:.4f}; {r['DPC_fail']:.4f}; {r['DPC_fresh']:.4f}) | {r['BONF']} | {r['CAL']} "
          f"({r['CAL_fresh']:.4f})")

    p("\n## B. Re-zero share of the 116 s sheet cycle at c = 15 s: robot | plan | model | D1 N | CAL | DPC | LB")
    S = {}
    for (n, plan, model, d1), r in rows.items():
        sh = {k: r[k] * 15.0 / N_SHEETS / CYCLE for k in ("CAL", "DPC", "LB")}
        S["|".join(map(str, (n, plan, model, d1)))] = sh
        p(f"  {n} | {plan} | {model} | {d1} | {100 * sh['CAL']:.2f}% | {100 * sh['DPC']:.2f}% | {100 * sh['LB']:.2f}%")

    p("\n## C. Where DPC re-zeros within the sheet (count by nail index 0..61, nonzero only), RW, D1 0.1, LAYOUT")
    for n in P:
        r = rows[(n, "LAYOUT", "RW", 0.1)]
        nz = {i: c for i, c in enumerate(r["DPC_residues"]) if c}
        p(f"  {n}: {nz}")

    H = {}
    g = rows[("g1", "LAYOUT", "RW", 0.1)]
    H["H295"] = g["LB"] >= 95
    big = [r for r in rows.values() if r["BONF"] >= 10]
    share = sum(r["DPU"] < r["BONF"] for r in big) / len(big)
    h1 = rows[("h1", "LAYOUT", "RW", 0.1)]
    H["H296"] = share >= 0.75 and h1["DPU"] <= 0.8 * h1["BONF"]
    le = all(r["DPC"] <= r["CAL"] for r in rows.values())
    c5 = [r for r in rows.values() if r["CAL"] >= 5]
    lt = sum(r["DPC"] < r["CAL"] for r in c5) / len(c5)
    fr = max(r["DPC_fresh"] for r in rows.values())
    H["H297"] = le and lt >= 0.5 and fr <= 0.02
    gaps = [(r["DPC"] - r["LB"]) / r["DPC"] for r in rows.values() if r["DPC"] >= 10]
    H["H298"] = max(gaps) <= 0.25
    b = S["g1|BANDS k+0|RW|0.1"]["DPC"]
    H["H299"] = b < 0.03
    hv = lambda k: "held" if H[k] else "refuted"
    worse = [("|".join(map(str, k)), r["DPC"], r["CAL"]) for k, r in rows.items() if r["DPC"] > r["CAL"]]
    p("\n## D. Hypotheses (registered in LOG.md before the code was written)")
    p(f"H295 (G1 LAYOUT RW 0.1: LB >= 95): LB {g['LB']}, DPU {g['DPU']}, DPC {g['DPC']}, CAL {g['CAL']} -> {hv('H295')}")
    p(f"H296 (DPU < BONF on >= 75% of {len(big)} rows with BONF >= 10; H1 LAYOUT RW 0.1 DPU <= 0.8 BONF): share "
      f"{100 * share:.1f}%, H1 {h1['DPU']} / {h1['BONF']} = {h1['DPU'] / h1['BONF']:.3f} -> {hv('H296')}")
    p(f"H297 (DPC <= CAL everywhere; DPC < CAL on >= half of {len(c5)} rows with CAL >= 5; fresh <= 2%): every row "
      f"{le} (worse: {worse}), share {100 * lt:.1f}%, worst fresh {100 * fr:.2f}% -> {hv('H297')}")
    p(f"H298 ((DPC - LB) / DPC <= 0.25 on {len(gaps)} rows with DPC >= 10): worst {max(gaps):.3f}, median "
      f"{float(np.median(gaps)):.3f} -> {hv('H298')}")
    p(f"H299 (G1 BANDS k+0 RW 0.1 DPC under 3% of the cycle at c 15 s): DPC "
      f"{rows[('g1', 'BANDS k+0', 'RW', 0.1)]['DPC']} re-zeros, {100 * b:.2f}% -> {hv('H299')}")

    out = {"alpha": ALPHA, "trials": TRIALS, "rows": {"|".join(map(str, k)): v for k, v in rows.items()},
           "share": S, "H": H}
    text = "\n".join(L) + "\n"
    open(os.path.join(HERE, "results.txt"), "w").write(text)
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, sort_keys=True)
    print(text)


if __name__ == "__main__":
    main()
