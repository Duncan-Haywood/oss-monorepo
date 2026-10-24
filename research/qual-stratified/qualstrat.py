"""Audit designs for a group gap: draw the hand-coded audit at random, with equal numbers per group, or with
Neyman allocation, and estimate the gap with group-wise prediction-powered inference.

Stdlib only. Builds on ../qual-gapaudit (gap estimators and gates). Each group's PPI uses only its audited items,
so a stratified draw needs no weights: the groups are separate estimates of separate means.
"""
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "qual-gapaudit"))
import qualgap as qg  # noqa: E402

q = qg.q


def draw(design, n_gold, a_all, b_all, rng, share_a=None):
    """Audited indices (in A, in B). design 'random': one sample from all items; 'equal': n/2 per group;
    'neyman': share_a of the audit to group A (from allocation())."""
    if design == "random":
        return qg.split(rng.sample(sorted(a_all + b_all), n_gold), set(a_all))
    share = 0.5 if design == "equal" else share_a
    na = min(len(a_all), max(2, round(n_gold * share)))
    nb = min(len(b_all), max(2, n_gold - na))
    return rng.sample(a_all, na), rng.sample(b_all, nb)


def allocation(llm, human, a_all, b_all):
    """Share of the audit for group A that minimises the variance of the gap's rectifier term, sum of var_g / n_g:
    proportional to the standard deviation of the human-minus-coder difference in each group (a difference of two
    group means is not weighted by group size). Oracle: uses the full data, so it is the best a pilot could do."""
    sa = q.var([human[i] - llm[i] for i in a_all]) ** 0.5
    sb = q.var([human[i] - llm[i] for i in b_all]) ** 0.5
    return sa / (sa + sb)
