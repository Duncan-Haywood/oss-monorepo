"""Milestone 6g (H6): the 6f rule and baseline, fitted on all 17 rand-k/uncompressed cells, scored on the plain top-k cells (6e).

Pure stdlib; reuses scaling_compare.py's fits. Top-k is biased, so its omega is not defined by theory: the nominal
omega = 1/p - 1 of the keep fraction is used, which is the "no new constant" prediction. A one-constant extension
(kappa scales omega) is fitted leave-one-H-out. See LOG.md, 6g.
"""
import os, json
from scaling_compare import cells, fit_rule, fit_base, omega, HERE


def topk_cells():
    rows = [json.loads(l) for l in open(os.path.join(HERE, "topk_composition.jsonl"))]
    by = {}
    for r in rows: by.setdefault(r["H"], []).append(r["loss"])
    out = {H: sum(v) / len(v) for H, v in by.items() if abs(r["keep"] - 0.0625) < 1e-9}
    out[16] = 1.5758 + 0.0639  # H = 16 top-k cell comes from 4b (uncompressed 1.5758 + excess 0.0639), as 6e used it
    return out


def main():
    c = cells()
    tk = topk_cells()
    items = sorted(c.items())
    rule, base = fit_rule(items), fit_base(items)
    p = 1 / 16
    print("plain top-k at keep 1/16, loss measured / rule / baseline (rand-k fitted on all 17 cells)")
    errs = {"rule": [], "base": []}
    for H in sorted(tk):
        m = tk[H]
        r, b = rule(H, p), base(H, p)
        errs["rule"].append(abs(r - m) / m); errs["base"].append(abs(b - m) / m)
        print(f"H={H}: measured {m:.4f}  rule {r:.4f} (err {r-m:+.4f})  baseline {b:.4f} (err {b-m:+.4f})")
    print(f"MAPE on the 3 top-k cells: rule {100*sum(errs['rule'])/3:.3f}%  baseline {100*sum(errs['base'])/3:.3f}%")
    # one extra constant: top-k excess = kappa * rule excess, kappa fitted on two H levels, scored on the third
    print("kappa (top-k excess / rule excess) leave-one-H-out")
    for hold in sorted(tk):
        fit = [H for H in tk if H != hold]
        ex = lambda H: tk[H] - c[(H, 1.0)]
        kappa = sum(ex(H) * (rule(H, p) - c[(H, 1.0)]) for H in fit) / sum((rule(H, p) - c[(H, 1.0)]) ** 2 for H in fit)
        pred = c[(hold, 1.0)] + kappa * (rule(hold, p) - c[(hold, 1.0)])
        print(f"hold out H={hold}: kappa {kappa:.3f} predicted excess {pred-c[(hold,1.0)]:+.4f} measured {ex(hold):+.4f} err {pred-tk[hold]:+.4f}")


if __name__ == "__main__": main()
