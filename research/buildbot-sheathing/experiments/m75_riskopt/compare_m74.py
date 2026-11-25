"""Post-hoc (not registered): milestone 75's exact optimum OPT against milestone 74's lower bound LB and its
Monte Carlo-calibrated allocation DPC (a sibling run, landed the same day), RW rows, D1 0.05 to 0.2 N. Each DPC
schedule (milestone 74 stored its re-zero positions) is scored on the exact radial chain, dr = sigma sqrt(tau)/6.
python experiments/m75_riskopt/compare_m74.py > experiments/m75_riskopt/compare_m74.txt  (a few minutes, 4 processes)"""
import json
import os
import sys
from multiprocessing import Pool

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run as M  # noqa: E402

R75 = json.load(open(os.path.join(M.HERE, "results.json")))
R74 = json.load(open(os.path.join(M.HERE, "..", "m74_allocate", "results.json")))["rows"]


def row(arg):
    (n, plan, d1), a1 = arg
    g, t, a = M.M72.wall(a1)
    _, sig = M.D.matched("RW", d1)
    st = R74[f"{n}|{plan}|RW|{d1}"]["DPC_starts"]
    LS = M.Q.segment_logsurv(g, t, a, M.PERIOD, sig, 0.5, dr_frac=1 / 6)   # tables long enough for any DPC segment
    return M.chain_fail(LS, len(a), st)


if __name__ == "__main__":
    P = M.M73.plans()
    keys = [(n, plan, d1) for n in P for plan in M.PLANS for d1 in M.D1S]
    with Pool(4) as pool:
        ex = pool.map(row, [(k, P[k[0]][k[1]]) for k in keys], chunksize=1)
    print("# robot | plan | D1 N | m74 LB | m75 OPT (at dr/6) | m74 DPC: n (its fresh MC fail; exact chain fail) | note")
    lb_ok = tight = over = 0
    for (n, plan, d1), e in zip(keys, ex):
        r74, r = R74[f"{n}|{plan}|RW|{d1}"], R75["rows"][f"{n}|{plan}|{d1}"]
        lb, opt, fine, dpc = r74["LB"], r["OPT"][0], r["OPT_fine"][0], r74["DPC"]
        note = []
        lb_ok += lb <= min(opt, fine)
        if lb == opt:
            tight += 1
            note.append("LB attained")
        if e > M.ALPHA:
            over += 1
            note.append("DPC over 1%")
        print(f"{n} | {plan} | {d1} | {lb} | {opt} ({fine}) | {dpc} ({r74['DPC_fresh']:.4f}; {e:.4f}) | "
              f"{'; '.join(note) or '-'}")
    print(f"\nLB <= OPT on {lb_ok} of {len(keys)} rows; LB = OPT on {tight}; DPC's exact failure over 1% on {over}")
