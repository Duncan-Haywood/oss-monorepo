"""Power of a C2ST and of a paired-error test against sample size. Writes results.txt (and results.json).

    python3 experiments/run.py      # about 10 minutes on 4 CPUs

Rule: reject 'twin is exact' when the statistic exceeds the 95th percentile of its own null (exact twin) replicates.
"""
import json
import sys
from pathlib import Path
import numpy as np
from joblib import Parallel, delayed

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import power as P

NS = (50, 100, 200, 400, 800)
NULL_REPS, ALT_REPS, PAIRED_REPS = 60, 24, 400
ALPHA = 0.05
SCEN = {  # twin configuration; the real system is P.REAL
    "coulomb -10%": (dict(P.REAL, coul=0.27), "raw"),
    "coulomb -20%": (dict(P.REAL, coul=0.24), "raw"),
    "gauss noise, same sd": (dict(P.REAL, kind="gauss"), "raw+resid"),
}
NULL_FEATS = ("raw", "raw+resid")


def one(n, twin_cfg, feat, seed):
    rng = np.random.default_rng(seed)
    th0, _, real = P.dataset(rng, n, **P.REAL)
    _, _, tw = P.dataset(rng, n, **twin_cfg)  # independent starts: C2ST needs no pairing
    return P.c2st_auc(real, tw, feat, seed=seed % 1000)


def paired(n, twin_cfg, seed):
    rng = np.random.default_rng(seed)
    th0, _, real = P.dataset(rng, n, **P.REAL)
    return P.paired_stat(real, th0, twin_cfg["visc"], twin_cfg["coul"])


OUT = []
def say(s=""):
    print(s, flush=True)
    OUT.append(s)

jobs = {}
for n in NS:
    for feat in NULL_FEATS:
        jobs[("null", n, feat)] = [(n, P.REAL, feat, 10_000 + i) for i in range(NULL_REPS)]
    for name, (cfg, feat) in SCEN.items():
        jobs[(name, n, feat)] = [(n, cfg, feat, 20_000 + i) for i in range(ALT_REPS)]
flat = [(k, a) for k, v in jobs.items() for a in v]
res = Parallel(n_jobs=-1)(delayed(one)(*a) for _, a in flat)
auc = {}
for (k, _), r in zip(flat, res):
    auc.setdefault(k, []).append(r)

# Paired statistic: the twin's noise-free trajectory vs the real noisy one from the same start angle. The noise-shape
# twin has exact dynamics, so its paired statistic is the null statistic by construction (noise never enters it).
pst = {}
for n in NS:
    null = [paired(n, P.REAL, 30_000 + i) for i in range(PAIRED_REPS)]
    pst[("null", n)] = null
    for name, (cfg, _) in SCEN.items():
        if name.startswith("coulomb"):
            pst[(name, n)] = [paired(n, cfg, 40_000 + i) for i in range(PAIRED_REPS)]
        else:
            pst[(name, n)] = [paired(n, P.REAL, 40_000 + i) for i in range(PAIRED_REPS)]

say(f"Real system {P.REAL}, trajectories of {P.STEPS} steps. Rejection threshold = {1-ALPHA:.0%} quantile of the exact-twin null "
    f"({NULL_REPS} replicates for C2ST, {PAIRED_REPS} for paired). Power = share of {ALT_REPS} (C2ST) or {PAIRED_REPS} (paired) "
    f"replicates above it, with Wilson 95% interval.")
say("C2ST = 5-fold CV AUROC of gradient-boosted trees; n = real trajectories = twin trajectories.")
table = {}
for name, (cfg, feat) in SCEN.items():
    say()
    say(f"== {name}  (C2ST features: {feat})")
    say(f"{'n':>5} {'null AUC q95':>12} {'mean AUC':>9} {'C2ST power':>22} {'paired power':>22}")
    for n in NS:
        thr = P.threshold(auc[("null", n, feat)], ALPHA)
        pc = P.power(auc[(name, n, feat)], thr)
        pthr = P.threshold(pst[("null", n)], ALPHA)
        pp = P.power(pst[(name, n)], pthr)
        table[f"{name}|{n}"] = dict(thr=thr, mean_auc=float(np.mean(auc[(name, n, feat)])), c2st=pc, paired=pp)
        f = lambda t: f"{t[0]:.2f} [{t[1]:.2f},{t[2]:.2f}]"
        say(f"{n:>5} {thr:>12.3f} {np.mean(auc[(name, n, feat)]):>9.3f} {f(pc):>22} {f(pp):>22}")
say()
say("Null (exact twin) false-rejection check: share of 24 fresh null C2ST replicates above the threshold, per n:")
for feat in NULL_FEATS:
    row = []
    for n in NS:
        thr = P.threshold(auc[("null", n, feat)], ALPHA)
        fresh = Parallel(n_jobs=-1)(delayed(one)(n, P.REAL, feat, 50_000 + i) for i in range(ALT_REPS))
        row.append(f"n={n}: {np.mean(np.array(fresh) > thr):.2f}")
    say(f"  {feat:<10} " + "  ".join(row))
(HERE / "results.txt").write_text("\n".join(OUT) + "\n")
(HERE / "results.json").write_text(json.dumps(table, indent=1))
