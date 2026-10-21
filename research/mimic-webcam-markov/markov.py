"""Learned per-person Markov generator for the webcam-signal imitation game.

Builds on ../mimic-webcam-persongen, which found that a hand-written parametric
generator is caught at AUROC 1.000 even when fitted on one person, while copies
of that person's own windows are caught at 0.57 to 0.65. This replaces the
hand-written program with a learned one that is not parametric: frames are
quantised with k-means into K states, a first-order transition matrix is
counted from the person's fit windows, and a window is a random walk over
states. Two emissions: `frame` draws a real frame of the state (copies frames,
learns the order), `gauss` draws the state's centroid plus per-channel
Gaussian noise (invents every frame).
"""
import os
import sys

import numpy as np
from sklearn.cluster import KMeans

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "mimic-webcam-persongen"))
import persongen as P  # noqa: E402

T = 100
GENERATORS = ("own markov frame", "own markov gauss", "pooled markov frame", "pooled markov gauss")


class Chain:
    """First-order Markov chain over k-means states of a pool of windows."""

    def __init__(self, W, k=32, seed=0, smooth=0.1):
        F = W.reshape(-1, W.shape[-1])
        k = max(2, min(k, len(F) // 5))
        km = KMeans(k, n_init=1, random_state=seed).fit(F)
        lab = km.labels_.reshape(W.shape[:2])
        self.k, self.F, self.lab = k, F, km.labels_
        self.cent = km.cluster_centers_
        self.sd = np.array([F[km.labels_ == j].std(0) if (km.labels_ == j).sum() > 1 else F.std(0)
                            for j in range(k)])
        C = np.full((k, k), smooth)
        for row in lab:
            np.add.at(C, (row[:-1], row[1:]), 1.0)
        self.trans = C / C.sum(1, keepdims=True)
        self.start = np.bincount(lab[:, 0], minlength=k) + smooth
        self.start = self.start / self.start.sum()
        self.members = [np.flatnonzero(km.labels_ == j) for j in range(k)]

    def sample(self, n, rng, emit="frame"):
        out = np.empty((n, T, self.F.shape[1]))
        for i in range(n):
            s = rng.choice(self.k, p=self.start)
            for t in range(T):
                if emit == "frame":
                    out[i, t] = self.F[rng.choice(self.members[s])]
                else:
                    out[i, t] = self.cent[s] + rng.normal(0, 1, self.cent.shape[1]) * self.sd[s]
                s = rng.choice(self.k, p=self.trans[s])
        return out.clip(0, 100)


def build(X, person, seed, k=32, generators=GENERATORS):
    """Like persongen.build but for the Markov generators."""
    rng = np.random.default_rng(seed)
    sp = P.split_people(person)
    ids = list(sp)
    own_fit = {p: X[sp[p][0]] for p in ids}
    real = {"fit": np.vstack([own_fit[p] for p in ids]), "held": np.vstack([X[sp[p][1]] for p in ids]),
            "fit_owner": np.array([p for p in ids for _ in sp[p][0]]),
            "held_owner": np.array([p for p in ids for _ in sp[p][1]])}
    fakes = {g: ([], [], [], []) for g in generators}
    for p in ids:
        na, nb = len(sp[p][0]), len(sp[p][1])
        chains = {}
        for g in generators:
            scope, _, emit = g.split(" ")
            if scope not in chains:
                pool = own_fit[p] if scope == "own" else np.vstack([own_fit[q] for q in ids if q != p])
                if scope == "pooled" and len(pool) > 400:  # bound k-means cost
                    pool = pool[rng.choice(len(pool), 400, replace=False)]
                chains[scope] = Chain(pool, k, seed + 1)
            c = chains[scope]
            fa, fb, oa, ob = fakes[g]
            fa.append(c.sample(na, rng, emit))
            fb.append(c.sample(nb, rng, emit))
            oa += [p] * na
            ob += [p] * nb
    return real, {g: (np.vstack(v[0]), np.vstack(v[1]), np.array(v[2]), np.array(v[3])) for g, v in fakes.items()}
