"""Fit and evaluate from experiments/dataset.jsonl (copied from eda-surrogate; no Yosys needed); writes results.txt and results.json.

    python experiments/run.py [draws]    # default 30 random draws of the k adaptation designs, about a minute
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from eda_adapt import adapt, models  # noqa: E402


def main():
    draws = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    rows = models.load(os.path.join(HERE, "dataset.jsonl"))
    X, y, _ = models.matrix(rows)
    fam = np.array([r["family"] for r in rows])
    fams = sorted(set(fam))
    out, js = [], {}
    P = out.append
    P(f"Yosys: {rows[0]['yosys']}; designs: {len(rows)} " + ", ".join(f"{f}={int((fam == f).sum())}" for f in fams))
    P(f"{draws} random draws of the k adaptation designs per cell; numbers are median over draws of the median APE on the "
      "remaining held-out designs, with the 10th-90th percentile over draws in brackets; Spearman is the median over draws.")
    for kind in ("linear", "ridge", "gbr"):
        for held in fams:
            cv = adapt.curve(X, y, fam, held, kind, draws)
            js[f"{kind}/{held}"] = {str(k): {m: v.tolist() for m, v in d.items()} for k, d in cv.items()}
            P(f"\n== {kind}, held-out family {held} (n={int((fam == held).sum())}) ==")
            P("k    zero APE      scratch APE            pooled APE             pooled Spearman")
            for k in adapt.K_GRID:
                def cell(m):
                    if m not in cv[k]:
                        return " " * 22
                    a = cv[k][m][:, 0]
                    return f"{np.median(a):6.1%} [{np.percentile(a, 10):5.1%},{np.percentile(a, 90):6.1%}]"
                zero = f"{np.median(cv[0]['zero'][:, 0]):6.1%}"
                sp = cv[k]["pooled"][:, 1] if k else cv[0]["zero"][:, 1]
                P(f"{k:<4d} {zero}    {cell('scratch')} {cell('pooled')}   {np.nanmedian(sp):.3f}")
            P(f"break-even (pooled median APE <= 20%): k = {adapt.break_even(cv)}; scratch alone: k = {adapt.break_even(cv, 'scratch')}")
    for kind in ("linear", "ridge", "gbr"):
        P(f"\n== S. {kind}: median over the four held-out families of the median APE (percent) ==")
        P("k zero scratch pooled")
        for k in adapt.K_GRID:
            def med(m):
                v = [np.median(np.array(js[f"{kind}/{h}"][str(k)][m])[:, 0]) for h in fams if m in js[f"{kind}/{h}"][str(k)]]
                return f"{100 * np.median(v):.1f}" if v else "-"
            P(f"{k} {med('zero')} {med('scratch')} {med('pooled')}")
    with open(os.path.join(HERE, "results.txt"), "w") as f:
        f.write("\n".join(out) + "\n")
    with open(os.path.join(HERE, "results.json"), "w") as f:
        json.dump(js, f)
    print("\n".join(out))


if __name__ == "__main__":
    main()
