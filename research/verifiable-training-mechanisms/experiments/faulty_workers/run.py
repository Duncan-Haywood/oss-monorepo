"""Milestone 39, H4: with independent faulty workers (rate f, unique wrong outputs) and a priced audit, when does the
principal choose m > 1 replicas? Cost per accepted-or-bad job = [m + c p + lam m S + L P_bad] / (1 - P_retry).
Run from here:  PYTHONPATH=../../src python3 run.py"""
import json
import os
import sys
from math import comb

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from vtm.coalition import stake_closed_partial  # noqa: E402

GS = (0.5, 0.9)
KAPPAS = (0.2, 0.5, 1.0)
FS = (0.01, 0.05, 0.2)
LS = (10.0, 100.0, 1000.0)
CS = (0.5, 2.0, 5.0, 20.0)
LAMS = (0.01, 0.1, 1.0)
PS = [i / 100 for i in range(1, 101)]
MS = range(1, 52, 2)


def q_majority(m, f):
    """P(strict majority of m workers correct)."""
    return sum(comb(m, j) * (1 - f) ** j * f ** (m - j) for j in range(m // 2 + 1, m + 1))


def cost(m, p, g, k, f, L, c, lam):
    stake = stake_closed_partial(m, g, p, k)
    attempt = m + c * p + lam * m * stake
    if m == 1:
        retry, bad = f * p, f * (1 - p)
    else:
        retry, bad = 1 - q_majority(m, f), 0.0
    return (attempt + L * bad) / (1 - retry)


def best(g, k, f, L, c, lam, ms=MS):
    out = None
    for m in ms:
        for p in PS:
            v = cost(m, p, g, k, f, L, c, lam)
            if out is None or v < out[0] - 1e-12:
                out = (v, m, p)
    return out


def main():
    lines = ["== optimal (m, p); only cells with m* > 1 and a per-c summary",
             "g    kappa f     L      c     lam   m*  p*    cost    m=1 cost"]
    res, repl = {}, []
    for g in GS:
        for k in KAPPAS:
            for f in FS:
                for L in LS:
                    for c in CS:
                        for lam in LAMS:
                            v, m, p = best(g, k, f, L, c, lam)
                            v1, _, p1 = best(g, k, f, L, c, lam, ms=(1,))
                            res[f"{g}|{k}|{f}|{L}|{c}|{lam}"] = {"m": m, "p": p, "cost": v, "cost_m1": v1, "p_m1": p1}
                            if m > 1:
                                repl.append((g, k, f, L, c, lam, m, p, v, v1))
    for r in repl:
        lines.append("%-4s %-5s %-5s %-6s %-5s %-5s %-3d %-5s %7.3f %8.3f" % r)
    lines.append(f"== cells choosing m > 1: {len(repl)} of {len(res)}")
    for c in CS:
        n = sum(1 for r in repl if r[4] == c)
        lines.append(f"   c={c}: {n} cells with m>1 of {len(res) // len(CS)}")
    lines.append(f"== smallest c with any m>1: {min((r[4] for r in repl), default=None)}")
    viol = []
    for g in GS:
        for k in KAPPAS:
            for L in LS:
                for lam in LAMS:
                    ms = [res[f"{g}|{k}|{f}|{L}|20.0|{lam}"]["m"] for f in FS]
                    if any(b < a for a, b in zip(ms, ms[1:])):
                        viol.append((g, k, L, lam, ms))
    lines.append(f"== optimal m decreasing in f at c=20: {len(viol)} violations of {len(GS) * len(KAPPAS) * len(LS) * len(LAMS)} chains {viol}")
    c05 = [r for r in repl if r[4] == 0.5]
    lines.append(f"== c=0.5 cells with m>1: {len(c05)}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print("\n".join(lines))


if __name__ == "__main__":
    main()
