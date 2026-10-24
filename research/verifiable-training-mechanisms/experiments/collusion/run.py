"""Milestone 6, H4: least stake for all-honest to be a strong equilibrium with m replicated workers, a shared
cheap trajectory and one audit, by brute force; against max(0, g/p - 1) and against the proposal's 1/m.
Run from here:  PYTHONPATH=../../src python3 run.py"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from vtm.coalition import min_stake, stake_closed, utilities  # noqa: E402

GS = (0.1, 0.3, 0.5, 0.9)
PS = (0.05, 0.1, 0.25, 0.5, 1.0)
MS = range(1, 8)


def smallest_escaping(m, g):
    """Smallest cheating coalition whose members all gain with no audit and no stake (replication alone)."""
    for c in range(1, m + 1):
        prof = (1,) * c + (0,) * (m - c)
        u = utilities(prof, g, 0.0, 0.0)
        u0 = utilities((0,) * m, g, 0.0, 0.0)
        if all(u[i] > u0[i] for i in range(c)):
            return c
    return None


def main():
    rows, worst = [], 0.0
    for m in MS:
        for g in GS:
            for p in PS:
                bf, cf = min_stake(m, g, p), stake_closed(m, g, p)
                worst = max(worst, abs(bf - cf))
                rows.append(dict(m=m, g=g, p=p, brute=bf, closed=cf, pay_bill=m * 1.0))
    lines = [f"== H4: {len(rows)} cells (m 1..7 x g x p); max |brute force - max(0, g/p - 1)| = {worst:.2e}"]
    lines.append("== least cheating coalition that escapes replication (no audit, no stake), by m (g=0.3): "
                 + ", ".join(f"m={m}:{smallest_escaping(m, 0.3)}" for m in MS))
    lines.append("== stake S* by m at g=0.5 (each column a p); flat in m:")
    lines.append("m   " + "  ".join(f"p={p:<5}" for p in PS))
    for m in MS:
        lines.append(f"{m}   " + "  ".join(f"{[r for r in rows if r['m']==m and r['g']==0.5 and r['p']==p][0]['brute']:<7.3f}" for p in PS))
    lines.append("== the proposal's 1/m form, S*(1)/m, at g=0.5, p=0.1: " + ", ".join(f"m={m}:{(0.5/0.1-1)/m:.2f}" for m in MS)
                 + "  vs brute force " + ", ".join(f"{[r for r in rows if r['m']==m and r['g']==0.5 and r['p']==0.1][0]['brute']:.2f}" for m in MS))
    lines.append("== requester pay bill at honest equilibrium (r=1 per worker): m x 1; stake needed does not fall with m.")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(rows, open(os.path.join(HERE, "results.json"), "w"))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
