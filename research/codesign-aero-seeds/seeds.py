"""Replicate analysis helpers: rank statistics across independent tuning replicates (stdlib + numpy)."""
import numpy as np


def ranks(v):
    r = np.empty(len(v)); r[np.argsort(v)] = np.arange(len(v)); return r


def spearman(a, b):
    return float(np.corrcoef(ranks(a), ranks(b))[0, 1])


def pairwise_spearman(M):
    """M: replicates x cells. Spearman of every replicate pair."""
    k = len(M)
    return [spearman(M[i], M[j]) for i in range(k) for j in range(i + 1, k)]


def top_set(v, k):
    return set(int(i) for i in np.argsort(v)[:k])


def winner_counts(M):
    """How often each cell is the argmin (lowest error) across replicates."""
    out = {}
    for row in M:
        w = int(np.argmin(row)); out[w] = out.get(w, 0) + 1
    return out


def indistinguishable_from_best(M, z=2.0):
    """Cells whose mean error is within z standard errors (of the difference to the best cell's mean) of the best.
    M: replicates x cells; paired by replicate. Returns indices (best included)."""
    mean = M.mean(0); b = int(np.argmin(mean)); k = len(M)
    keep = []
    for c in range(M.shape[1]):
        d = M[:, c] - M[:, b]
        se = d.std(ddof=1) / np.sqrt(k) if k > 1 else np.inf
        if c == b or d.mean() <= z * se:
            keep.append(c)
    return keep
