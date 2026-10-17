"""Power of a kernel MMD test vs a boosted-tree C2ST for wrong MuJoCo pendulum twins. Writes results.json/results.txt.

    python experiments/run.py      # a few minutes on 4 CPUs
Rejection = statistic above the 95th percentile of the same statistic for the exact twin (null), per n.
Each replicate draws one real sample and one sample per twin, and every detector scores the same samples.
"""
import json, sys
from multiprocessing import Pool
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import twin

NS, REPS, C2_REPS = (100, 200), 100, 20
R = twin.REAL
TWINS = {"null": (dict(R), "student3"),
         "euler dt=0.01": (dict(R, integrator="euler", dt=0.01), "student3"),
         "euler dt=0.02": (dict(R, integrator="euler", dt=0.02), "student3"),
         "frictionloss-10%": (dict(R, frictionloss=0.0675), "student3"),
         "frictionloss-20%": (dict(R, frictionloss=0.06), "student3"),
         "gauss-noise": (dict(R), "gauss"),
         "noise-sd+25%": (dict(R), "student3x")}
DET = ("mmd/raw", "mmd/resid", "c2st/both")


def one(args):
    n, r = args
    rng = np.random.default_rng(7919 * r + n)
    real = twin.sample(rng, n, "student3", **R)
    out = {}
    for name, (cfg, kind) in TWINS.items():
        if kind == "student3x":  # same dynamics, noise sd 25% too high
            clean = twin.simulate(rng.uniform(-2, 2, n), **cfg)
            tw = clean + twin.noise(rng, clean.shape, 1.25 * twin.SD, "student3")
        else:
            tw = twin.sample(rng, n, kind, **cfg)
        s = {"mmd/raw": twin.mmd2(real, tw), "mmd/resid": twin.mmd2(twin.features(real, "resid"), twin.features(tw, "resid"))}
        if r < C2_REPS:
            s["c2st/both"] = twin.c2st_auc(real, tw, "both", seed=r)
        out[name] = s
    return out


if __name__ == "__main__":
    res, out = {}, []
    with Pool() as pool:
        for n in NS:
            reps = pool.map(one, [(n, r) for r in range(REPS)])
            for d in DET:
                vals = {t: [x[t][d] for x in reps if d in x[t]] for t in TWINS}
                thr = twin.threshold(vals["null"])
                for t in TWINS:
                    res[f"{n}|{d}|{t}"] = twin.power(vals[t], thr)
            print(n, "done", flush=True)
    json.dump(res, open(HERE / "results.json", "w"), indent=1)
    out = [f"Real: MuJoCo {R}, Student-t(3) sensor noise sd {twin.SD} rad. Rejection threshold = 95th percentile of the exact twin's statistic at the same n and detector.",
           f"Replicates per cell: MMD {REPS}, C2ST {C2_REPS}. Power with Wilson 95% interval. Null rows are about 0.05 by construction.",
           f"{'twin':<18}{'n':>5}  " + "  ".join(f"{d:<20}" for d in DET)]
    for t in TWINS:
        for n in NS:
            out.append(f"{t:<18}{n:>5}  " + "  ".join("{:<20}".format("%.2f [%.2f,%.2f]" % res[f"{n}|{d}|{t}"]) for d in DET))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
