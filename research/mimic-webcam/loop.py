"""The imitation game on webcam signals, blind, with code as the free parameter.

Each round the detector moves first (picks 3 of 8 feature groups and refits
against the imitator's current samples), then the imitator mutates its
generator program against that fixed detector. Both sides get BUDGET candidate
evaluations per round. Scored on people neither side saw: the in-loop detector
on loop-validation people, and a reference detector (boosted trees on every
feature, never seen by the loop) on test people.
"""
import sys

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

import data as D
import ladder as L
import signals as S

K, BUDGET, N_FAKE = 3, 4, 300


def fit_clf(groups, fh, ff):
    X = np.vstack([S.stack(fh, groups), S.stack(ff, groups)])
    y = np.r_[np.ones(len(fh[groups[0]])), np.zeros(len(ff[groups[0]]))]
    return make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=400)).fit(X, y)


def auroc(clf, groups, fh, ff):
    s = np.r_[clf.decision_function(S.stack(fh, groups)), clf.decision_function(S.stack(ff, groups))]
    y = np.r_[np.ones(len(fh[groups[0]])), np.zeros(len(ff[groups[0]]))]
    return float(roc_auc_score(y, s))


def gaps(fh, ff):
    """Standardised mean gap per feature group between people and imitator."""
    out = {}
    for g in S.GROUPS:
        a, b = fh[g], ff[g]
        sd = np.sqrt((a.var(0) + b.var(0)) / 2) + 1e-9
        out[g] = float(np.mean(np.abs(a.mean(0) - b.mean(0)) / sd))
    return out


def play(seed, rounds=30, budget=BUDGET, ref_every=5):
    X, person, _ = D.load()
    tr, lo, te = S.split(person, seed)
    W_tr, W_lo, W_te = (X[np.isin(person, p)] for p in (tr, lo, te))
    fit = S.Fit(W_tr)
    rng = np.random.default_rng(seed)
    fh_tr, fh_lo = S.feature_groups(W_tr), S.feature_groups(W_lo)
    genome, groups = dict(S.NAIVE), [str(g) for g in rng.choice(S.GROUPS, K, replace=False)]
    log = []
    for rnd in range(rounds + 1):
        if rnd > 0:
            ff = S.feature_groups(S.generate(genome, fit, N_FAKE, rng))
            gp = gaps(fh_tr, ff)
            weakest = min(groups, key=lambda g: gp[g])
            unused = sorted((g for g in S.GROUPS if g not in groups), key=lambda g: -gp[g])
            cands = [groups] + [[g if g != weakest else u for g in groups] for u in unused[:budget - 1]]
            hf, ffold = rng.permutation(len(W_tr)) % 2, rng.permutation(N_FAKE) % 2
            sub = lambda f, m: {g: v[m] for g, v in f.items()}
            sc = [np.mean([auroc(fit_clf(c, sub(fh_tr, hf != k), sub(ff, ffold != k)), c,
                                 sub(fh_tr, hf == k), sub(ff, ffold == k)) for k in range(2)])
                  for c in cands]  # 2-fold score on the training people
            groups = cands[int(np.argmax(sc))]
            clf = fit_clf(groups, fh_tr, ff)
            # imitator step against the fixed detector
            def score(gm):
                f = S.feature_groups(S.generate(gm, fit, N_FAKE, rng))
                return -float(np.mean(clf.decision_function(S.stack(f, groups))))
            best, best_s = genome, score(genome)
            for _ in range(budget):
                cand = S.mutate(genome, list(S.GENES)[rng.integers(len(S.GENES))], rng)
                s = score(cand)
                if s < best_s:
                    best, best_s = cand, s
            genome = best
        if rnd % ref_every == 0 or rnd == rounds:
            fake_tr = S.generate(genome, fit, len(W_tr), rng)
            fake_te = S.generate(genome, fit, len(W_te), rng)
            ref = L.reference_auroc(fake_tr, W_tr, fake_te, W_te, seed)
            ff = S.feature_groups(S.generate(genome, fit, N_FAKE, rng))
            clf = fit_clf(groups, fh_tr, ff)
            lo_a = auroc(clf, groups, fh_lo, S.feature_groups(S.generate(genome, fit, len(W_lo), rng)))
            log.append(dict(round=rnd, reference=ref, loop=lo_a, groups=list(groups), genome=dict(genome)))
    return log


if __name__ == "__main__":
    import json
    seeds = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    rounds = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    budget = int(sys.argv[3]) if len(sys.argv) > 3 else BUDGET
    out = sys.argv[4] if len(sys.argv) > 4 else "results/loop.json"
    runs = [play(s, rounds, budget) for s in range(seeds)]
    json.dump(runs, open(out, "w"))
    print("final reference AUROC per seed:", [round(r[-1]["reference"], 3) for r in runs])
    print("final loop-detector AUROC per seed:", [round(r[-1]["loop"], 3) for r in runs])
