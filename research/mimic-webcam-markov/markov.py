"""Per-person Markov-chain generators for the webcam-signal imitation game.

Builds on ../mimic-webcam-persongen, whose next step asked whether a learned,
non-parametric per-person model (a Markov chain over quantised frames) reaches
the own-stitch rows where the fitted parametric generator was caught at 1.000.

A chain is fitted on one pool of real windows (a person's fit half, or the other
people's): frames are quantised to k k-means states, transitions are counted
(with add-alpha smoothing), and a window is a walk of 100 states. Emission is
either the state centroid ("centroid", smooth, no real frame reused) or a random
real frame of the state ("member", reuses real frames like stitching does).
"""
import os
import sys

import numpy as np
from sklearn.cluster import KMeans

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "mimic-webcam-persongen"))
import persongen as P  # noqa: E402

T = 100
KS = (8, 32, 128)
GENERATORS = tuple(f"{who} markov{k} {em}" for who in ("own", "pooled") for k in KS
                   for em in ("centroid", "member"))


class Chain:
    def __init__(self, W, k, rng, alpha=0.1):
        F = W.reshape(-1, W.shape[-1])
        k = int(min(k, len(np.unique(F, axis=0))))
        km = KMeans(k, n_init=1, random_state=int(rng.integers(1 << 30))).fit(F)
        lab = km.labels_.reshape(W.shape[:2])
        self.centers = km.cluster_centers_
        self.members = [F[km.labels_ == s] for s in range(k)]
        C = np.full((k, k), alpha)
        np.add.at(C, (lab[:, :-1].ravel(), lab[:, 1:].ravel()), 1.0)
        self.P = C / C.sum(1, keepdims=True)
        self.start = np.bincount(lab[:, 0], minlength=k) + alpha
        self.start = self.start / self.start.sum()
        self.k = k

    def sample(self, n, rng, emit="centroid"):
        out = np.empty((n, T, self.centers.shape[1]))
        for i in range(n):
            s = rng.choice(self.k, p=self.start)
            for t in range(T):
                out[i, t] = self.centers[s] if emit == "centroid" else \
                    self.members[s][rng.integers(len(self.members[s]))]
                s = rng.choice(self.k, p=self.P[s])
        return out


def parse(name):
    who, k, emit = name.split()
    return who, int(k.removeprefix("markov")), emit


def build(X, person, seed, generators=GENERATORS):
    """Same contract as persongen.build, with Markov chains as the generators."""
    rng = np.random.default_rng(seed)
    real, _ = P.build(X, person, seed, generators=())
    sp = P.split_people(person)
    ids = list(sp)
    own_fit = {p: X[sp[p][0]] for p in ids}
    fakes = {}
    for g in generators:
        who, k, emit = parse(g)
        fa, fb, oa, ob = [], [], [], []
        for p in ids:
            pool = own_fit[p] if who == "own" else np.vstack([own_fit[q] for q in ids if q != p])
            ch = Chain(pool, k, rng)
            na, nb = len(sp[p][0]), len(sp[p][1])
            fa.append(ch.sample(na, rng, emit))
            fb.append(ch.sample(nb, rng, emit))
            oa += [p] * na
            ob += [p] * nb
        fakes[g] = (np.vstack(fa), np.vstack(fb), np.array(oa), np.array(ob))
    return real, fakes
