"""Run: PYTHONPATH=src python experiments/run.py   (about 1-2 min). Writes results.txt and ranking.png."""
import os
import numpy as np
from eda_refpoint import indicators as ind, study
from eda_proposers import table

D = os.path.dirname(os.path.abspath(__file__))
rows = table.load_table(study.TABLE)
sp = table.Space(rows)
SEEDS, BUD = 100, [8, 16, 30]
ords = study.orders(sp, max(BUD), SEEDS)
names = [c.name for c in study.STOCH]

# higher-is-better versions so every column is read the same way
METRICS = {f"HV ref {r}": (lambda f, t, r=r: ind.hv_ratio(f, t, (r,) * 3)) for r in (1.01, 1.1, 1.5, 2.0, 5.0)}
METRICS["front recall"] = ind.recall
METRICS["-IGD+"] = lambda f, t: -ind.igd_plus(f, t)
METRICS["-eps+"] = lambda f, t: -ind.eps_add(f, t)

L = ["# 5 stochastic proposers x 100 seeds, scored under several indicators; mean over seeds (higher is better for every column)",
     f"# {rows[0]['yosys']}; table = eda-proposers/experiments/table.jsonl (80 designs); scaling = min-max over the table", ""]
means = {}
for b in BUD:
    L.append(f"## budget {b}")
    L.append(f"{'indicator':14s}" + "".join(f"{n:>11s}" for n in names) + "   best   rank-tau vs HV ref 1.1")
    for m, f in METRICS.items():
        sc = study.score(sp, ords, b, f)
        means[(b, m)] = np.array([sc[n].mean() for n in names])
    base = means[(b, "HV ref 1.1")]
    for m in METRICS:
        v = means[(b, m)]
        L.append(f"{m:14s}" + "".join(f"{x:11.3f}" for x in v) + f"   {names[int(v.argmax())]:8s} {study.kendall(v, base):+.2f}")
    L.append("")

# paired test: does TPE beat random, per indicator and budget?
L.append("## fraction of paired seeds where TPE is strictly better / worse than random")
for b in BUD:
    for m, f in METRICS.items():
        sc = study.score(sp, ords, b, f)
        d = sc["tpe"] - sc["random"]
        L.append(f"budget {b:2d}  {m:14s} mean diff {d.mean():+.3f}  better {np.mean(d > 0):.2f}  worse {np.mean(d < 0):.2f}")
    L.append("")

# log-scaled cells
sl = study.logspace(rows)
L.append("## cell counts on a log scale before scaling (HV ref 1.1), the same runs re-scored")
ords_l = {n: o for n, o in ords.items()}
L.append(f"{'budget':8s}" + "".join(f"{n:>11s}" for n in names) + "   rank-tau vs linear scaling")
for b in BUD:
    v = np.array([study.score(sl, ords_l, b, METRICS["HV ref 1.1"])[n].mean() for n in names])
    L.append(f"{b:<8d}" + "".join(f"{x:11.3f}" for x in v) + f"   {study.kendall(v, means[(b, 'HV ref 1.1')]):+.2f}")
open(os.path.join(D, "results.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
