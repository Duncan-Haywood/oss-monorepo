"""Two-stage keyword-spotting cascade arithmetic. Pure numpy, no training.

Stage 1 (small model) runs on every clip. If its integer-logit margin (top-1 minus top-2) is
below a threshold, stage 2 (bigger model) also runs on the same features and its answer is used.
Energy per clip = E1 + escalated_fraction * E2: the MFCC front end is shared and not counted
(`accel-frontend` prices it separately).
"""
import numpy as np


def margin(logits):
    """Top-1 minus top-2 integer logit, per row."""
    s = np.sort(logits, axis=1)
    return s[:, -1] - s[:, -2]


def thresholds(margins, n=60):
    """Candidate thresholds: 0 (never escalate), quantiles of the margins, and above the max (always)."""
    q = np.quantile(margins, np.linspace(0, 1, n))
    return np.unique(np.concatenate([[0], q, [margins.max() + 1]]))


def run(lg1, lg2, y, t):
    """Escalation fraction and accuracy when stage 2 answers every clip with margin(lg1) < t."""
    esc = margin(lg1) < t
    pred = np.where(esc, lg2.argmax(1), lg1.argmax(1))
    return float(esc.mean()), float((pred == y).mean())


def energy(e1, e2, frac):
    return e1 + frac * e2


def pareto(points):
    """Indices of points (energy, acc) not dominated (lower-or-equal energy and higher-or-equal acc, one strict)."""
    keep = []
    for i, (e, a) in enumerate(points):
        if not any((e2 <= e and a2 >= a) and (e2 < e or a2 > a) for j, (e2, a2) in enumerate(points) if j != i):
            keep.append(i)
    return keep
