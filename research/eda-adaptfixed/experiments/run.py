"""Score each chooser on one fixed test set per family; writes results.txt and results.json.

    python experiments/run.py [draws]    # default 20 random draws, 5 split seeds
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from eda_adaptfixed import models, pick  # noqa: E402

KINDS = ("linear", "ridge", "gbr")
SPLITS = range(5)


def main():
    draws = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    rows = models.load(os.path.join(HERE, "dataset.jsonl"))
    X, y, names = models.matrix(rows)
    fam = np.array([r["family"] for r in rows])
    fams = sorted(set(fam))
    js, out = {}, []
    P = out.append
    P(f"Yosys: {rows[0]['yosys']}; designs: {len(rows)}; each family split {len(list(SPLITS))} times into a pool (60%) and a fixed test set (40%).")
    P(f"Choosers pick k pool designs by features only; the surrogate (other three families weight 1, chosen designs weight w) is scored on the fixed test set. random: median over {draws} draws.")
    for kind in KINDS:
        for w in pick.WEIGHTS:
            for k in pick.K_GRID:
                for s in pick.STRATEGIES:
                    for h in fams:
                        for sp in SPLITS:
                            if s == "random":
                                rs = np.random.RandomState(1000 * sp + k)
                                v = float(np.median([pick.score(X, y, fam, names, h, kind, s, k, w, sp, rs) for _ in range(draws)]))
                            else:
                                v = pick.score(X, y, fam, names, h, kind, s, k, w, sp)
                            js[f"{kind}/{w:g}/{k}/{s}/{h}/{sp}"] = v
    for kind in KINDS:
        for w in pick.WEIGHTS:
            P(f"\n== S. {kind}, w={w:g}: median over families and splits of the median APE on the fixed test set (percent) ==")
            P("k " + " ".join(pick.STRATEGIES))
            for k in pick.K_GRID:
                P(f"{k} " + " ".join(f"{100 * np.median([js[f'{kind}/{w:g}/{k}/{s}/{h}/{sp}'] for h in fams for sp in SPLITS]):.1f}" for s in pick.STRATEGIES))
    P("\n== W. share of the 20 (family, split) cells in which the strategy beats random (percent) ==")
    P("kind w k " + " ".join(pick.STRATEGIES[1:]))
    for kind in KINDS:
        for w in pick.WEIGHTS:
            for k in pick.K_GRID:
                cells = []
                for s in pick.STRATEGIES[1:]:
                    wins = [js[f"{kind}/{w:g}/{k}/{s}/{h}/{sp}"] < js[f"{kind}/{w:g}/{k}/random/{h}/{sp}"] for h in fams for sp in SPLITS]
                    cells.append(f"{100 * np.mean(wins):.0f}")
                P(f"{kind} {w:g} {k} " + " ".join(cells))
    with open(os.path.join(HERE, "results.txt"), "w") as f:
        f.write("\n".join(out) + "\n")
    with open(os.path.join(HERE, "results.json"), "w") as f:
        json.dump(js, f)
    print("\n".join(out))


if __name__ == "__main__":
    main()
