"""Run: PYTHONPATH=src python experiments/run.py   (a few minutes). Writes results.txt.
Proposers are shown objectives with N(0, sigma) error (scaled units, fixed per design per run); the found set is scored on the truth."""
import os
import numpy as np
from eda_noisy import study
from eda_proposers import table

D = os.path.dirname(os.path.abspath(__file__))
rows = table.load_table(study.TABLE)
SEEDS, BUD, SIGMAS = 100, [16, 30], [0.0, 0.05, 0.1, 0.2, 0.4, 0.8]
names = [c.name for c in study.STOCH]
res = {(c.name, s, b): np.array([study.run(rows, c, s, b, k) for k in range(SEEDS)]) for c in study.STOCH for s in SIGMAS for b in BUD}
rng = np.random.default_rng(0)


def ci(d):
    m = [rng.choice(d, len(d)).mean() for _ in range(2000)]
    return np.percentile(m, 2.5), np.percentile(m, 97.5)


L = [f"# {SEEDS} seeds; true-objective hypervolume ratio (ref 1.1, scaled objectives) of the designs a proposer picked while seeing sigma-noisy objectives",
     f"# {rows[0]['yosys']}; table = eda-proposers/experiments/table.jsonl (80 designs). Noise is synthetic Gaussian, not measured from any tool.", ""]
for b in BUD:
    L += [f"## budget {b}: mean over seeds", f"{'sigma':7s}" + "".join(f"{n:>11s}" for n in names)]
    for s in SIGMAS:
        L.append(f"{s:<7.2f}" + "".join(f"{res[(n, s, b)].mean():11.3f}" for n in names))
    L += ["", f"## budget {b}: paired gain over random (same seed), mean [95% bootstrap CI] and share of seeds better/worse"]
    for n in names:
        if n == "random":
            continue
        for s in SIGMAS:
            d = res[(n, s, b)] - res[("random", s, b)]
            lo, hi = ci(d)
            L.append(f"{n:10s} sigma {s:4.2f}  {d.mean():+.3f} [{lo:+.3f}, {hi:+.3f}]  better {np.mean(d > 0):.2f}  worse {np.mean(d < 0):.2f}")
        L.append("")
open(os.path.join(D, "results.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
