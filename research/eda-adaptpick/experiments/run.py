"""Compare ways of choosing the k adaptation designs and of weighting them; writes results.txt and results.json.

    python experiments/run.py [draws]    # default 30 random draws, about 2 minutes
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from eda_adaptpick import models, pick  # noqa: E402

KINDS = ("linear", "ridge", "gbr")


def main():
    draws = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    rows = models.load(os.path.join(HERE, "dataset.jsonl"))
    X, y, names = models.matrix(rows)
    fam = np.array([r["family"] for r in rows])
    fams = sorted(set(fam))
    out, js = [], {}
    P = out.append
    P(f"Yosys: {rows[0]['yosys']}; designs: {len(rows)} " + ", ".join(f"{f}={int((fam == f).sum())}" for f in fams))
    P(f"Pooled surrogate = other three families (weight 1) + k chosen designs of the held-out family (weight w). Median APE on the "
      f"held-out designs not chosen. random: median over {draws} draws; other strategies are deterministic (one value).")
    for kind in KINDS:
        for held in fams:
            P(f"\n== {kind}, held-out {held} (n={int((fam == held).sum())}); cells are median APE, percent ==")
            P("w    k  " + "  ".join(f"{s:>8s}" for s in pick.STRATEGIES))
            for w in pick.WEIGHTS:
                for k in pick.K_GRID:
                    row = []
                    for s in pick.STRATEGIES:
                        if s == "random":
                            rs = np.random.RandomState(1000 + k)
                            v = [pick.score(X, y, fam, names, held, kind, s, k, w, rs, d)[0] for d in range(draws)]
                            val = float(np.median(v))
                            js[f"{kind}/{held}/{w}/{k}/{s}"] = v
                        else:
                            val = pick.score(X, y, fam, names, held, kind, s, k, w)[0]
                            js[f"{kind}/{held}/{w}/{k}/{s}"] = [val]
                        row.append(100 * val)
                    P(f"{w:<4g} {k:<2d} " + "  ".join(f"{v:8.1f}" for v in row))
    for kind in KINDS:
        for w in pick.WEIGHTS:
            P(f"\n== S. {kind}, w={w:g}: median over the four held-out families of the median APE (percent) ==")
            P("k " + " ".join(pick.STRATEGIES))
            for k in pick.K_GRID:
                cells = []
                for s in pick.STRATEGIES:
                    v = [np.median(js[f"{kind}/{h}/{w}/{k}/{s}"]) for h in fams]
                    cells.append(f"{100 * np.median(v):.1f}")
                P(f"{k} " + " ".join(cells))
    P("\n== R. share of the random draws that beat the strategy, median over the four families (percent; low means the strategy beats most random draws) ==")
    P("kind w k " + " ".join(pick.STRATEGIES[1:]))
    for kind in KINDS:
        for w in pick.WEIGHTS:
            for k in pick.K_GRID:
                cells = []
                for s in pick.STRATEGIES[1:]:
                    sh = [np.mean(np.array(js[f"{kind}/{h}/{w}/{k}/random"]) < js[f"{kind}/{h}/{w}/{k}/{s}"][0]) for h in fams]
                    cells.append(f"{100 * np.median(sh):.0f}")
                P(f"{kind} {w:g} {k} " + " ".join(cells))
    with open(os.path.join(HERE, "results.txt"), "w") as f:
        f.write("\n".join(out) + "\n")
    with open(os.path.join(HERE, "results.json"), "w") as f:
        json.dump(js, f)
    print("\n".join(out[-60:]))


if __name__ == "__main__":
    main()
