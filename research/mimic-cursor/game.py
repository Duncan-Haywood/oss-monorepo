"""The imitation game on cursor strokes, with and without shared feedback.

Each round the detector moves first (picks K feature functions and refits
against the imitator's current strokes), then the imitator moves (mutates its
generator code against the fixed detector). Each side gets BUDGET candidate
evaluations per round in every condition. The conditions differ only in what
the sides tell each other:

- blind: the imitator sees only the detector's score of each candidate; the
  detector sees only the imitator's released strokes.
- d2i: the detector also shares which feature functions it runs and how far
  apart people and the imitator are on each (its "why I caught you"). The
  imitator uses that to choose which gene to mutate.
- i2d: the imitator also shares its generator program, so the detector can
  draw I2D_FACTOR times more imitator strokes to fit and select on.
- both: d2i and i2d together.
"""
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

import programs as P

K = 3
BUDGET = 4
N_CTX = 240          # contexts per evaluation
I2D_FACTOR = 4
EXPLORE = 0.25
# An imitator is invalid above this copy rate. Fixed before the main runs from
# a calibration on held-out people (6.8%), the naive bot (9.3%) and a
# template replay within 3 degrees (89%) or 10 degrees (39%).
MAX_COPY = 0.15
CONDITIONS = ("blind", "d2i", "i2d", "both")


def fit_detector(groups, fh, fi):
    X = np.vstack([P.stack(fh, groups), P.stack(fi, groups)])
    y = np.r_[np.ones(len(fh[groups[0]])), np.zeros(len(fi[groups[0]]))]
    clf = make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=500))
    return clf.fit(X, y)


def auroc(clf, groups, fh, fi):
    s = np.r_[clf.predict_proba(P.stack(fh, groups))[:, 1],
              clf.predict_proba(P.stack(fi, groups))[:, 1]]
    y = np.r_[np.ones(len(fh[groups[0]])), np.zeros(len(fi[groups[0]]))]
    return float(roc_auc_score(y, s))


def cv_auroc(groups, fh, fi, rng, folds=3):
    nh, ni = len(fh[groups[0]]), len(fi[groups[0]])
    ah, ai = rng.permutation(nh) % folds, rng.permutation(ni) % folds
    out = []
    for k in range(folds):
        sub = lambda f, a, m: {g: v[m(a)] for g, v in f.items()}
        tr = fit_detector(groups, sub(fh, ah, lambda a: a != k), sub(fi, ai, lambda a: a != k))
        out.append(auroc(tr, groups, sub(fh, ah, lambda a: a == k), sub(fi, ai, lambda a: a == k)))
    return float(np.mean(out))


COPY = {"bank": None, "ref": None}
COPY_RATIO = 0.5


def copy_rate(strokes):
    """Share of strokes at least twice as close to the template pool as to
    people the imitator never saw, in the spirit of Meehan et al. (2020)'s
    data-copying test (COPY is set by run.py)."""
    dt, dr = P.nn_dist(strokes, COPY["bank"]), P.nn_dist(strokes, COPY["ref"])
    return float((dt < COPY_RATIO * dr).mean())


def imitate(genome, contexts, seed):
    rng = np.random.default_rng(seed)
    return [P.generate(genome, c[0, 1:], c[-1, 1:], rng) for c in contexts]


class Player:
    def __init__(self, cond, rng):
        self.cond, self.rng = cond, rng
        self.genome = P.NAIVE
        self.groups = [str(g) for g in rng.choice(P.GROUPS, K, replace=False)]
        self.clf = None
        self.sens = {g: {f: 0.0 for f in P.GROUPS} for g in P.GENES}
        self.shared = None   # what the detector shared: {group: gap}


def detector_step(pl, human_pool, rnd, seed):
    rng = pl.rng
    hctx = [human_pool[i] for i in rng.choice(len(human_pool), N_CTX, replace=False)]
    fh = P.features(hctx)
    n_im = N_CTX * (I2D_FACTOR if pl.cond in ("i2d", "both") else 1)
    ictx = [human_pool[i] for i in rng.choice(len(human_pool), n_im, replace=n_im > len(human_pool))]
    fi = P.features(imitate(pl.genome, ictx, seed))
    gap = P.gaps(fh, fi)
    # proposals: keep the current set, and swap the weakest group for the
    # unused groups with the largest gaps (the same rule in every condition;
    # i2d only changes how many imitator strokes the gaps and fits rest on)
    cur = pl.groups
    weakest = min(cur, key=lambda g: gap[g])
    unused = sorted((g for g in P.GROUPS if g not in cur), key=lambda g: -gap[g])
    cands = [cur] + [[g if g != weakest else u for g in cur] for u in unused[:BUDGET - 1]]
    scores = [cv_auroc(c, fh, fi, rng) for c in cands]
    pl.groups = cands[int(np.argmax(scores))]
    pl.clf = fit_detector(pl.groups, fh, fi)
    pl.shared = {g: gap[g] for g in pl.groups}
    return max(scores)


def imitator_step(pl, human_pool, rnd, seed):
    rng = pl.rng
    ctx = [human_pool[i] for i in rng.choice(len(human_pool), N_CTX, replace=False)]
    fh = P.features(ctx)
    see = pl.cond in ("d2i", "both")

    def evaluate(genome):
        # the detector's mean log-odds that the imitator's strokes are human:
        # unlike AUROC it still ranks candidates once the detector separates
        # the two classes completely
        strokes = imitate(genome, ctx, seed)
        fi = P.features(strokes)
        score = -float(np.mean(pl.clf.decision_function(P.stack(fi, pl.groups))))
        if copy_rate(strokes) > MAX_COPY:
            score += 1e6
        return score, P.gaps(fh, fi)

    base, base_gap = evaluate(pl.genome)
    best = (base, pl.genome)
    genes = list(P.GENES)
    for _ in range(BUDGET):
        if see and rng.random() > EXPLORE:
            target = max(pl.shared, key=pl.shared.get)
            w = np.array([pl.sens[g][target] for g in genes])
            w = np.exp((w - w.max()) / 0.3)
            gene = genes[rng.choice(len(genes), p=w / w.sum())]
        else:
            gene = genes[rng.integers(len(genes))]
        cand = P.mutate(pl.genome, gene, rng)
        a, gp = evaluate(cand)
        if see:
            # learn which gene moves which shared feature (the imitator can
            # run the detector's feature code because the detector shared it)
            for f in pl.shared:
                pl.sens[gene][f] = 0.7 * pl.sens[gene][f] + 0.3 * (base_gap[f] - gp[f])
        if a < best[0]:
            best = (a, cand)
    pl.genome = best[1]
    fi = P.features(imitate(pl.genome, ctx, seed))
    return auroc(pl.clf, pl.groups, fh, fi)
