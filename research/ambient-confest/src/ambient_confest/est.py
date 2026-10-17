"""Estimating the prior and confusion matrix of a noisy urgency label from a labelled audit set,
then acting on the estimate. Stylised; reuses the ambient-misread policy maths."""
import numpy as np
from .sim import MODES, URGENCY, utilities

CLASSES = tuple(URGENCY)
PRIOR = np.array([URGENCY[u][2] for u in CLASSES])
K = len(CLASSES)


def confusion(acc):
    """Uniform-error confusion matrix C[true, observed]."""
    C = np.full((K, K), (1 - acc) / (K - 1))
    np.fill_diagonal(C, acc)
    return C


def u_table(p, ctx):
    return np.array([[utilities(p, *ctx, t)[m] for m in MODES] for t in CLASSES])  # true class, mode


def audit(C, prior, n, rng):
    """n audited messages: true class drawn from the prior, observed label from C. Returns counts[t, o]."""
    t = rng.choice(K, n, p=prior)
    cum = C[t].cumsum(axis=1)
    o = (rng.random(n)[:, None] > cum).sum(axis=1).clip(max=K - 1)
    counts = np.zeros((K, K))
    np.add.at(counts, (t, o), 1)
    return counts


def estimate(counts, alpha=0.0):
    """Prior and confusion from audit counts with additive smoothing alpha (0 = maximum likelihood).
    A class never seen gets a uniform row when alpha is 0."""
    cls = counts.sum(axis=1)
    prior = (cls + alpha) / (cls.sum() + alpha * K)
    rows = counts + alpha
    tot = rows.sum(axis=1, keepdims=True)
    Chat = np.where(tot > 0, rows / np.where(tot > 0, tot, 1), 1.0 / K)
    return prior, Chat


def posterior(C, prior):
    """P[o, t] = P(true t | observed o)."""
    joint = prior[:, None] * C
    s = joint.sum(axis=0, keepdims=True)
    s = np.where(s > 0, s, 1.0)
    return (joint / s).T


def modes_from_estimate(U, prior_hat, C_hat):
    """Mode chosen for each observed label by the Bayes rule under the estimated prior and C."""
    post = posterior(C_hat, prior_hat)
    return [int(np.argmax(post[o] @ U)) for o in range(K)]


def value(U, modes, C, prior):
    """True expected utility of a label-to-mode map under the true prior and confusion matrix."""
    return float(sum((prior * C[:, o]) @ U[:, modes[o]] for o in range(K)))


def policies(U, C, prior, counts, alpha):
    """True expected utility of: oracle, blind, naive, bayes_true, bayes_hat (estimated from counts)."""
    oracle = float((prior * U.max(axis=1)).sum())
    blind = float(prior @ U[:, int(np.argmax(prior @ U))])
    naive = value(U, [int(np.argmax(U[o])) for o in range(K)], C, prior)
    bayes_true = value(U, modes_from_estimate(U, prior, C), C, prior)
    ph, Ch = estimate(counts, alpha)
    bayes_hat = value(U, modes_from_estimate(U, ph, Ch), C, prior)
    return {"oracle": oracle, "blind": blind, "naive": naive, "bayes_true": bayes_true, "bayes_hat": bayes_hat}
