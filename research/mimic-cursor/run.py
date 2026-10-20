"""Run the game in every condition and seed; writes results/run_<cond>_<seed>.json.

Usage: python3 run.py [rounds] [seeds] [workers]
"""
import os

# one thread per worker process: the boosted trees otherwise oversubscribe the CPU
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "1")

import json  # noqa: E402
import sys  # noqa: E402
from concurrent.futures import ProcessPoolExecutor  # noqa: E402

import numpy as np  # noqa: E402
from sklearn.ensemble import HistGradientBoostingClassifier  # noqa: E402
from sklearn.metrics import roc_auc_score  # noqa: E402

import data  # noqa: E402
import game as G  # noqa: E402
import programs as P  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(HERE, "results")
N_TRAIN_SESS = 30
N_REF = 1200   # strokes per class for the reference detector
N_TEST = 800


N_COPY_SESS = 6  # training sessions kept out of the template bank, for the copy test


def split():
    s = data.load()
    keys = sorted(s)
    rng = np.random.default_rng(12345)
    order = [keys[i] for i in rng.permutation(len(keys))]
    tr, te = order[:N_TRAIN_SESS], order[N_TRAIN_SESS:]
    cp, tr = tr[:N_COPY_SESS], tr[N_COPY_SESS:]
    pool = [np.array(x, float) for k in tr for x in s[k]]
    test = [np.array(x, float) for k in te for x in s[k]]
    copyref = [np.array(x, float) for k in cp for x in s[k]]
    return pool, test, copyref


def setup_copy(pool, copyref):
    """Data-copying test banks: every template-pool stroke, and the strokes of
    six training-split people the imitator never sees."""
    G.COPY["bank"] = np.array([P.shape_vec(x) for x in pool])
    G.COPY["ref"] = np.array([P.shape_vec(x) for x in copyref])


def fixed_sets(pool, test):
    rng = np.random.default_rng(777)
    ref = [pool[i] for i in rng.choice(len(pool), N_REF, replace=False)]
    tst = [test[i] for i in rng.choice(len(test), N_TEST, replace=False)]
    return ref, tst


def reference_auroc(genome, ref, tst, fref, ftst):
    """A detector the loop never sees: boosted trees on every feature function,
    fit on training-session people vs the imitator, scored on held-out people."""
    fi_tr = P.features(G.imitate(genome, ref, 101))
    fi_te = P.features(G.imitate(genome, tst, 202))
    X = np.vstack([P.stack(fref, P.GROUPS), P.stack(fi_tr, P.GROUPS)])
    y = np.r_[np.ones(len(ref)), np.zeros(len(ref))]
    clf = HistGradientBoostingClassifier(max_iter=200, random_state=0).fit(X, y)
    Xt = np.vstack([P.stack(ftst, P.GROUPS), P.stack(fi_te, P.GROUPS)])
    yt = np.r_[np.ones(len(tst)), np.zeros(len(tst))]
    return float(roc_auc_score(yt, clf.predict_proba(Xt)[:, 1])), fi_te


def detector_json(pl):
    sc, lr = pl.clf.named_steps["standardscaler"], pl.clf.named_steps["logisticregression"]
    return {"groups": [str(g) for g in pl.groups], "mean": sc.mean_.tolist(),
            "scale": sc.scale_.tolist(), "coef": lr.coef_[0].tolist(),
            "intercept": float(lr.intercept_[0])}


def one(args):
    cond, seed, rounds = args
    pool, test, copyref = split()
    P.set_human(pool)
    setup_copy(pool, copyref)
    ref, tst = fixed_sets(pool, test)
    fref, ftst = P.features(ref), P.features(tst)
    pl = G.Player(cond, np.random.default_rng(1000 + seed))
    hist = []
    r0, _ = reference_auroc(pl.genome, ref, tst, fref, ftst)
    hist.append({"round": 0, "reference": r0, "genome": pl.genome})
    for rnd in range(1, rounds + 1):
        d_fit = G.detector_step(pl, pool, rnd, seed * 1000 + rnd)
        i_fit = G.imitator_step(pl, pool, rnd, seed * 1000 + rnd + 500)
        ref_a, fi_te = reference_auroc(pl.genome, ref, tst, fref, ftst)
        loop_a = G.auroc(pl.clf, pl.groups, ftst, fi_te)
        cr = G.copy_rate(G.imitate(pl.genome, tst, 202))
        hist.append({"round": rnd, "detector_cv": d_fit, "imitator_fit": i_fit,
                     "loop_test": loop_a, "reference": ref_a, "copy_rate": cr, "groups": [str(g) for g in pl.groups],
                     "shared": pl.shared, "genome": pl.genome, "detector": detector_json(pl)})
        print(f"{cond} s{seed} r{rnd}: det {d_fit:.3f} imit {i_fit:.3f} "
              f"loop-test {loop_a:.3f} ref {ref_a:.3f} copy {cr:.2f} {pl.groups}", flush=True)
    out = {"condition": cond, "seed": seed, "rounds": hist,
           "note": "Generated cursor strokes are simulated; nothing was sent to any site."}
    with open(os.path.join(RES, f"run_{cond}_{seed}.json"), "w") as f:
        json.dump(out, f, indent=1)
    return cond, seed


if __name__ == "__main__":
    rounds = int(sys.argv[1]) if len(sys.argv) > 1 else 12
    seeds = int(sys.argv[2]) if len(sys.argv) > 2 else 6
    workers = int(sys.argv[3]) if len(sys.argv) > 3 else 4
    os.makedirs(RES, exist_ok=True)
    jobs = [(c, s, rounds) for s in range(seeds) for c in G.CONDITIONS]
    with ProcessPoolExecutor(workers) as ex:
        for c, s in ex.map(one, jobs):
            print("done", c, s, flush=True)
