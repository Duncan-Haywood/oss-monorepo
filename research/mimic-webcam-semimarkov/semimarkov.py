"""Semi-Markov and second-order chain generators for the webcam-signal imitation game.

Builds on ../mimic-webcam-markov, whose next step named these two. Frames are
quantised to k k-means states as there. Two ways to fix the jump-every-step
behaviour of a first-order chain:

- ``semi``: a state is held for a dwell time drawn from that state's empirical
  run lengths in the fit windows; on leaving, the next state follows the
  jump chain (transitions between different states only).
- ``order2``: the next state depends on the last two states; pairs never seen
  in the fit windows back off to the first-order row.

Emission is the state centre ("centroid") or a random real frame of the state
("member"), as in mimic-webcam-markov.
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "mimic-webcam-markov"))
sys.path.insert(0, os.path.join(HERE, "..", "mimic-webcam-persongen"))
import markov as M  # noqa: E402
import persongen as P  # noqa: E402

T = M.T
KS = (8, 32)
KINDS = ("semi", "order2")
GENERATORS = tuple(f"{who} {kind}{k} {em}" for who in ("own", "pooled") for kind in KINDS
                   for k in KS for em in ("centroid", "member"))


def parse(name):
    who, kk, emit = name.split()
    kind = "semi" if kk.startswith("semi") else "order2"
    return who, kind, int(kk.removeprefix(kind)), emit


class Chain(M.Chain):
    """First-order chain plus empirical dwell times and second-order counts."""

    def __init__(self, W, k, rng, alpha=0.1):
        super().__init__(W, k, rng, alpha)
        lab = self.labels(W)
        self.dwell = [[] for _ in range(self.k)]
        J = np.full((self.k, self.k), 0.0)
        for row in lab:
            t = 0
            while t < len(row):
                u = t
                while u + 1 < len(row) and row[u + 1] == row[t]:
                    u += 1
                self.dwell[row[t]].append(u - t + 1)
                if u + 1 < len(row):
                    J[row[t], row[u + 1]] += 1
                t = u + 1
        for s in range(self.k):
            if not self.dwell[s]:
                self.dwell[s] = [1]
        J += alpha
        np.fill_diagonal(J, 0.0)
        self.J = J / J.sum(1, keepdims=True)
        self.second = {}
        for row in lab:
            for a, b, c in zip(row[:-2], row[1:-1], row[2:]):
                self.second.setdefault((a, b), np.zeros(self.k))[c] += 1

    def labels(self, W):
        F = W.reshape(-1, W.shape[-1])
        d = ((F[:, None, :] - self.centers[None]) ** 2).sum(-1)
        return d.argmin(1).reshape(W.shape[:2])

    def _emit(self, s, rng, emit):
        return self.centers[s] if emit == "centroid" else self.members[s][rng.integers(len(self.members[s]))]

    def sample_kind(self, n, rng, kind, emit="centroid"):
        out = np.empty((n, T, self.centers.shape[1]))
        for i in range(n):
            if kind == "semi":
                s = rng.choice(self.k, p=self.start)
                t = 0
                while t < T:
                    for _ in range(min(int(rng.choice(self.dwell[s])), T - t)):
                        out[i, t] = self._emit(s, rng, emit)
                        t += 1
                    s = rng.choice(self.k, p=self.J[s])
            else:
                a = rng.choice(self.k, p=self.start)
                out[i, 0] = self._emit(a, rng, emit)
                b = rng.choice(self.k, p=self.P[a])
                for t in range(1, T):
                    out[i, t] = self._emit(b, rng, emit)
                    c = self.second.get((a, b))
                    p = self.P[b] if c is None else c / c.sum()
                    a, b = b, rng.choice(self.k, p=p)
        return out


def build(X, person, seed, generators=GENERATORS):
    """Same contract as markov.build, with semi-Markov and second-order chains."""
    rng = np.random.default_rng(seed)
    real, _ = P.build(X, person, seed, generators=())
    sp = P.split_people(person)
    ids = list(sp)
    own_fit = {p: X[sp[p][0]] for p in ids}
    fakes = {}
    for g in generators:
        who, kind, k, emit = parse(g)
        fa, fb, oa, ob = [], [], [], []
        for p in ids:
            pool = own_fit[p] if who == "own" else np.vstack([own_fit[q] for q in ids if q != p])
            ch = Chain(pool, k, rng)
            na, nb = len(sp[p][0]), len(sp[p][1])
            fa.append(ch.sample_kind(na, rng, kind, emit))
            fb.append(ch.sample_kind(nb, rng, kind, emit))
            oa += [p] * na
            ob += [p] * nb
        fakes[g] = (np.vstack(fa), np.vstack(fb), np.array(oa), np.array(ob))
    return real, fakes
