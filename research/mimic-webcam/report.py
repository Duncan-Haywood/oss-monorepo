"""Summarise results/loop*.json into results/summary.txt and draw experiments/figure.svg."""
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def boot(x, n=2000, seed=0):
    x = np.asarray(x)
    rng = np.random.default_rng(seed)
    m = [rng.choice(x, len(x)).mean() for _ in range(n)]
    return x.mean(), np.percentile(m, 2.5), np.percentile(m, 97.5)


def curves(runs, key):
    rounds = [e["round"] for e in runs[0]]
    return rounds, np.array([[e[key] for e in r] for r in runs])


def main():
    out = []
    series = {}
    for name, f in (("4 candidates per side per round", "loop.json"),
                    ("32 candidates per side per round", "loop_budget8x.json")):
        p = os.path.join(HERE, "results", f)
        if not os.path.exists(p):
            continue
        runs = json.load(open(p))
        rounds, ref = curves(runs, "reference")
        _, lp = curves(runs, "loop")
        series[name] = (rounds, ref, lp)
        m, lo, hi = boot(ref[:, -1])
        ml, llo, lhi = boot(lp[:, -1])
        out.append(f"{name}: seeds={len(runs)} final reference AUROC {m:.3f} ({lo:.3f} to {hi:.3f}); "
                   f"best reference at any logged round (mean of per-seed min) {ref.min(1).mean():.3f}; "
                   f"final loop-detector AUROC {ml:.3f} ({llo:.3f} to {lhi:.3f}); "
                   f"min over all seeds/rounds of reference {ref.min():.3f}")
        last = [r[-1]["genome"] for r in runs]
        for g in ("dyn", "level", "amp_src", "cross", "hold", "spike", "decimals"):
            vals = [str(x[g]) for x in last]
            out.append(f"  final {g}: " + ", ".join(f"{v}={vals.count(v)}" for v in sorted(set(vals))))
    open(os.path.join(HERE, "results", "summary.txt"), "w").write("\n".join(out) + "\n")
    print("\n".join(out))
    return series


if __name__ == "__main__":
    main()
