"""Milestone 38, H4: joint choice of audit probability p, worker count m and stake S = S*(m, p) minimising cost per job
(compute m + audit c p + capital lambda m S). Run from here:  PYTHONPATH=../../src python3 run.py"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from vtm.coalition import stake_closed_partial  # noqa: E402

GS = (0.5, 0.9)
KAPPAS = (0.2, 0.5, 0.8, 1.0)
CS = (0.1, 0.5, 2.0)
LAMS = (0.01, 0.1, 1.0)
PS = [i / 100 for i in range(1, 101)]
MS = range(1, 52, 2)


def best(g, k, c, lam, ms=MS):
    out = None
    for m in ms:
        for p in PS:
            cost = m + c * p + lam * m * stake_closed_partial(m, g, p, k)
            if out is None or cost < out[0] - 1e-12:
                out = (cost, m, p)
    return out


def main():
    lines = ["== optimal (m, p) and cost per job; compute = 1 per replica, audit c, capital lambda per unit stake",
             "g    kappa  c     lambda  m*  p*    cost    m=1 cost  m=1 p*"]
    res, repl, viol = {}, [], []
    for g in GS:
        for k in KAPPAS:
            for c in CS:
                prev = None
                for lam in LAMS:
                    cost, m, p = best(g, k, c, lam)
                    c1, _, p1 = best(g, k, c, lam, ms=(1,))
                    res[f"{g}|{k}|{c}|{lam}"] = {"m": m, "p": p, "cost": cost, "cost_m1": c1, "p_m1": p1}
                    lines.append(f"{g:<4} {k:<6} {c:<5} {lam:<7} {m:<3} {p:<5} {cost:7.3f} {c1:8.3f}  {p1}")
                    if m > 1:
                        repl.append((g, k, c, lam, m, p))
                    if prev is not None and p1 < prev - 1e-12:
                        viol.append((g, k, c, lam))
                    prev = p1
    lines.append(f"== cells choosing m > 1: {len(repl)} of {len(res)}")
    lines += [f"   g={a} kappa={b} c={cc} lambda={d} -> m={e} p={f}" for a, b, cc, d, e, f in repl]
    lines.append(f"== m=1 optimal p decreasing in lambda: {len(viol)} violations {viol}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print("\n".join(lines))


if __name__ == "__main__":
    main()
