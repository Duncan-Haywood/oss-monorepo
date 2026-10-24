"""Run: PYTHONPATH=src python3 experiments/run.py   (about a minute). Writes results.txt.
Proposers search a cheap view (measured generic-gate numbers) or an iid-noise stand-in and are scored on SKY130-mapped truth."""
import json
import os
import numpy as np
from eda_rungview import study

D = os.path.dirname(os.path.abspath(__file__))
rows = study.load_rows()
meta = json.load(open(study.MAPPED))
SEEDS, BUD = 200, [12, 20]
names = [c.name for c in study.STOCH]
err = {v: study.view_error(rows, v) for v in ("cells", "cells_dep")}
msig = float(np.mean([err["cells"][0][0], err["cells"][0][1]]))   # mean measured RMS error over area and time objectives, 'cells' view
SIGMAS = [round(msig, 3), 0.2]
searches = [("true", None), ("cells", None), ("cells_dep", None)] + [("noisy", s) for s in SIGMAS]
key = lambda s: s[0] if s[1] is None else f"noisy{s[1]}"
res = {(c.name, key(s), b): np.array([study.run(rows, c, s[0], b, k, s[1]) for k in range(SEEDS)]) for c in study.STOCH for s in searches for b in BUD}
rng = np.random.default_rng(0)


def ci(d):
    m = [rng.choice(d, len(d)).mean() for _ in range(2000)]
    return np.percentile(m, 2.5), np.percentile(m, 97.5)


L = [f"# {SEEDS} seeds; true-view hypervolume ratio (ref 1.1, objectives scaled over the 40 designs) of what each proposer picked",
     f"# {meta['yosys']}; PDK commit {meta['pdk_commit']}; ABC: {meta['script']}",
     "# true view = SKY130 mapped area, cycles x mapped delay, error (eda-sky130rung/experiments/mapped.json); 'cells' = generic cells, cycles, error;",
     "# 'cells_dep' = generic cells, cycles x generic depth, error; 'noisyS' = the true view plus iid N(0, S) per objective (eda-noisy's model)", ""]
L += ["## measured disagreement between each cheap view and the true view (scaled units; objective range = 1)",
      f"{'view':10s}{'rms obj1':>10s}{'rms obj2':>10s}{'rms obj3':>10s}{'spearman1':>11s}{'spearman2':>11s}{'spearman3':>11s}"]
for v, (e, sp) in err.items():
    L.append(f"{v:10s}" + "".join(f"{x:10.3f}" for x in e) + "".join(f"{x:11.3f}" for x in sp))
L += ["", "## Pareto fronts (non-dominated designs)"] + [f"{v:10s} {study.front(rows, v)}" for v in ("true", "cells", "cells_dep")]
for b in BUD:
    L += ["", f"## budget {b} of 40: mean true-view hypervolume ratio", f"{'search':14s}" + "".join(f"{n:>11s}" for n in names)]
    for s in searches:
        L.append(f"{key(s):14s}" + "".join(f"{res[(n, key(s), b)].mean():11.3f}" for n in names))
    L += ["", f"## budget {b}: paired gain over random searching the same view, mean [95% bootstrap CI]"]
    for s in searches:
        for n in names:
            if n == "random":
                continue
            d = res[(n, key(s), b)] - res[("random", key(s), b)]
            lo, hi = ci(d)
            L.append(f"{key(s):14s}{n:10s} {d.mean():+.3f} [{lo:+.3f}, {hi:+.3f}]")
    L += ["", f"## budget {b}: cost of searching the cheap view, paired (same seed) vs searching the true view, mean [95% CI]"]
    for s in searches[1:]:
        for n in names:
            d = res[(n, key(s), b)] - res[(n, "true", b)]
            lo, hi = ci(d)
            L.append(f"{key(s):14s}{n:10s} {d.mean():+.3f} [{lo:+.3f}, {hi:+.3f}]")
open(os.path.join(D, "results.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
