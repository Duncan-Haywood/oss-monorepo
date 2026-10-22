"""Adaptation curves for three targets on the same 133 designs: Yosys generic cells (as in eda-adapt, for a paired comparison),
SKY130 placed-and-repaired area (um^2) and SKY130 placed period (ns, before repair). Reads dataset.jsonl and placed.jsonl.

    python experiments/run.py [draws]    # default 30 draws, a few minutes; writes results.txt and results.json
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from eda_adaptplaced import adapt, data, models  # noqa: E402

TARGETS = ("cells", "area", "period")


def main():
    draws = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    rows, meta = data.load(HERE)
    X = data.features(rows)
    fam = np.array([r["family"] for r in rows])
    fams = sorted(set(fam))
    Y = {t: data.target(rows, t) for t in TARGETS}
    out, js = [], {}
    P = out.append
    P(f"designs with a placed result: {len(rows)} of 133; " + ", ".join(f"{f}={int((fam == f).sum())}" for f in fams))
    P(f"tools: {meta['yosys']}; OpenROAD {meta['openroad']}; PDK commit {meta['pdk_commit'][:7]}; ABC target {meta['period_ps']} ps")
    P(f"{draws} random draws per cell (same seeds for all three targets); numbers are the median over draws of the median APE on the "
      "remaining held-out designs; Spearman is the median over draws.")
    for t in TARGETS:
        for kind in ("linear", "ridge", "gbr"):
            for held in fams:
                cv = adapt.curve(X, Y[t], fam, held, kind, draws)
                js[f"{t}/{kind}/{held}"] = {str(k): {m: v.tolist() for m, v in d.items()} for k, d in cv.items()}
                P(f"\n== target {t}, {kind}, held-out {held} (n={int((fam == held).sum())}) ==")
                P("k    zero APE   scratch APE   pooled APE   pooled Spearman")
                for k in adapt.K_GRID:
                    def med(m):
                        return f"{np.median(cv[k][m][:, 0]):7.1%}" if m in cv[k] else "      -"
                    sp = cv[k]["pooled"][:, 1] if k else cv[0]["zero"][:, 1]
                    P(f"{k:<4d} {med('zero')}    {med('scratch')}    {med('pooled')}      {np.nanmedian(sp):.3f}")
                P(f"break-even (pooled <= 20%): k = {adapt.break_even(cv)}; scratch alone: k = {adapt.break_even(cv, 'scratch')}")
    for t in TARGETS:
        for kind in ("linear", "ridge", "gbr"):
            P(f"\n== S. target {t}, {kind}: median over the four held-out families of the median APE (percent); break-even k per family ==")
            P("k zero scratch pooled")
            for k in adapt.K_GRID:
                def med(m):
                    v = [np.median(np.array(js[f"{t}/{kind}/{h}"][str(k)][m])[:, 0]) for h in fams if m in js[f"{t}/{kind}/{h}"][str(k)]]
                    return f"{100 * np.median(v):.1f}" if v else "-"
                P(f"{k} {med('zero')} {med('scratch')} {med('pooled')}")
            be = {h: adapt.break_even({int(k): {m: np.array(v) for m, v in d.items()} for k, d in js[f"{t}/{kind}/{h}"].items()}) for h in fams}
            P("break-even (pooled): " + ", ".join(f"{h}={be[h]}" for h in fams))
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
    json.dump(js, open(os.path.join(HERE, "results.json"), "w"))
    print("\n".join(out[-60:]))


if __name__ == "__main__":
    main()
