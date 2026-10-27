"""Milestone 35, H4: partial copying (kappa < 1) in the m-worker game. Brute force (exact enumeration over which
cheaters copy the shared cheap trajectory) against the closed form, m = 1..7, then the closed form to m = 201.
Run from here:  PYTHONPATH=../../src python3 run.py"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from vtm.coalition import min_stake_partial, stake_closed_partial  # noqa: E402

P = 0.1
GS = (0.5, 0.9)
KAPPAS = (0.2, 0.35, 0.5, 0.65, 0.8, 1.0)
BF_M = range(1, 8)
CF_M = (1, 3, 7, 11, 21, 51, 201)


def main():
    worst, cells, inf_cells = 0.0, 0, 0
    bf = {}
    for g in GS:
        for k in KAPPAS:
            for m in BF_M:
                b, c = min_stake_partial(m, g, P, k), stake_closed_partial(m, g, P, k)
                cells += 1
                if b == float("inf"):
                    inf_cells += 1
                else:
                    worst = max(worst, abs(b - c))
                bf[(g, k, m)] = b
    lines = [f"== brute force vs closed form: {cells} cells (g in {GS}, kappa in {KAPPAS}, m 1..7, p={P}); max |difference| = {worst:.2e}; infinite cells {inf_cells}",
             "== least stake, brute force (g, kappa rows; m = 1..7)"]
    for g in GS:
        for k in KAPPAS:
            lines.append(f"g={g} kappa={k:<5} " + " ".join(f"{bf[(g, k, m)]:7.3f}" for m in BF_M))
    lines.append("== closed form to m = 201 (columns m = " + ", ".join(map(str, CF_M)) + ")")
    cf = {}
    for g in GS:
        for k in KAPPAS:
            row = [stake_closed_partial(m, g, P, k) for m in CF_M]
            cf[f"{g}|{k}"] = row
            lines.append(f"g={g} kappa={k:<5} " + " ".join(f"{x:7.3f}" for x in row))
    lines.append("== limits as m grows: kappa<1/2: max(0, g-1) = 0; kappa>1/2: g/(1-kappa(1-p))-1")
    for g in GS:
        lines.append(f"g={g}: " + ", ".join(f"kappa={k}: {max(0, g / (1 - k * (1 - P)) - 1):.3f}" for k in KAPPAS if k > 0.5))
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump({"worst": worst, "closed": cf, "brute": {f"{g}|{k}|{m}": v for (g, k, m), v in bf.items()}},
              open(os.path.join(HERE, "results.json"), "w"))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
