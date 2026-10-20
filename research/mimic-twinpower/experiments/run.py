"""How many real trajectories does a C2ST need to flag each wrong twin, and does that track the twin's regret?

    python experiments/run.py      # several minutes on 4 CPUs; writes results.txt and results.json next to this file

Regret per twin is read from ../mimic-twinregret/experiments/results.json (not recomputed).
"""
import json
import sys
from pathlib import Path
from joblib import Parallel, delayed
from scipy.stats import spearmanr

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import twinpower as tp

NS = (10, 20, 40, 80, 160)
REPS = 20
ALPHA = 0.05
regret = {r["twin"]: r["regret"] for r in json.loads((HERE.parents[1] / "mimic-twinregret/experiments/results.json").read_text())}
R = tp.R
TWINS = [
    ("exact twin (null)", dict(R)),
    ("coul -10%", dict(R, coul=0.27)), ("coul -20%", dict(R, coul=0.24)), ("coul -33%", dict(R, coul=0.2)),
    ("coul -67%", dict(R, coul=0.1)), ("coul = 0", dict(R, coul=0.0)),
    ("visc x2", dict(R, visc=0.2)), ("visc x0.5", dict(R, visc=0.05)),
    ("g/L +20%", dict(R, glo=9.81 * 1.2)), ("g/L -20%", dict(R, glo=9.81 * 0.8)),
    ("gauss noise, same sd", dict(R, kind="gauss")),
    ("noise sd x0.5", dict(R, sd=0.01)), ("noise sd x0.75", dict(R, sd=0.015)),
    ("noise sd x1.5", dict(R, sd=0.03)), ("noise sd x2", dict(R, sd=0.04)), ("noise sd x0 (no noise)", dict(R, sd=0.0)),
]
OUT = []


def say(s=""):
    print(s)
    OUT.append(s)


jobs = [(name, n, s) for name, _ in TWINS for n in NS for s in range(REPS)]
cfgs = dict(TWINS)
res = Parallel(n_jobs=4)(delayed(tp.auroc_once)(cfgs[name], n, 5000 + 97 * n + s) for name, n, s in jobs)
au = {}
for (name, n, s), a in zip(jobs, res):
    au.setdefault(name, {}).setdefault(n, []).append(a)

null = au["exact twin (null)"]
thr = {n: tp.null_threshold(null[n], ALPHA) for n in NS}
rows = []
for name, _ in TWINS:
    pw = [tp.power(au[name][n], thr[n]) for n in NS]
    rows.append(dict(twin=name, regret=regret[name], power=pw, mean_auroc=[sum(au[name][n]) / REPS for n in NS],
                     n80=tp.n_needed(NS, pw, 0.8)))

say(f"C2ST power against wrong pendulum twins. n real + n twin trajectories, {REPS} replicates per cell, null = exact twin.")
say(f"Rejection threshold per n = {1 - ALPHA:.2f} quantile of the null AUROC over {REPS} replicates (so the false-positive rate is about {ALPHA:.2f} by construction, with a coarse estimate).")
say("Power = share of replicates above the threshold. n80 = smallest n with power >= 0.8 ('>160' if none). Regret from mimic-twinregret.")
say()
say("null threshold  " + "  ".join(f"n={n}:{thr[n]:.3f}" for n in NS))
say()
say(f"{'twin':<26}{'regret':>9}  " + "".join(f"{'pw@' + str(n):>8}" for n in NS) + f"{'n80':>7}")
for r in rows:
    say(f"{r['twin']:<26}{r['regret']:>9.5f}  " + "".join(f"{p:>8.2f}" for p in r["power"]) + f"{(str(r['n80']) if r['n80'] else '>160'):>7}")
ok = [r for r in rows if not r["twin"].startswith("exact")]
for n in NS:
    k = NS.index(n)
    rho, p = spearmanr([r["power"][k] for r in ok], [r["regret"] for r in ok])
    say(f"Spearman(power@{n}, regret) over {len(ok)} wrong twins: rho={rho:.2f}, p={p:.3f}")
costly = [r for r in ok if r["regret"] >= 0.001]
free = [r for r in ok if r["regret"] == 0]
say(f"Twins with regret >= 0.001: {len(costly)}; with zero regret: {len(free)}.")
for label, grp in (("costly", costly), ("zero-regret", free)):
    say(f"Median n80 ({label}): " + ", ".join(f"{r['twin']}={r['n80'] or '>160'}" for r in grp))
(HERE / "results.txt").write_text("\n".join(OUT) + "\n")
(HERE / "results.json").write_text(json.dumps(dict(ns=NS, reps=REPS, thr=thr, rows=rows), indent=1))
