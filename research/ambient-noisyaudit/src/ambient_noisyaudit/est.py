"""Learning the prior and confusion matrix of a noisy urgency label from audits that are themselves
noisy. Stylised; reuses the ambient-confest estimation maths."""
import numpy as np
from .sim import MODES, URGENCY, utilities

CLASSES = tuple(URGENCY)
PRIOR = np.array([URGENCY[u][2] for u in CLASSES])
K = len(CLASSES)


def confusion(acc):
    """Uniform-error confusion matrix M[true, reported]."""
    M = np.full((K, K), (1 - acc) / (K - 1))
    np.fill_diagonal(M, acc)
    return M


def u_table(p, ctx):
    return np.array([[utilities(p, *ctx, t)[m] for m in MODES] for t in CLASSES])


def joint_audit(C, A, prior):
    """Exact P(a, o) = sum_t prior[t] A[t, a] C[t, o] for auditor label a and classifier label o."""
    return np.einsum("t,ta,to->ao", prior, A, C)


def draw_audit(C, A, prior, n, rng):
    """n audited messages -> counts[a, o]."""
    t = rng.choice(K, n, p=prior)
    a = (rng.random(n)[:, None] > A[t].cumsum(axis=1)).sum(axis=1).clip(max=K - 1)
    o = (rng.random(n)[:, None] > C[t].cumsum(axis=1)).sum(axis=1).clip(max=K - 1)
    counts = np.zeros((K, K))
    np.add.at(counts, (a, o), 1)
    return counts


def estimate_naive(counts, alpha=0.0):
    """Treat the auditor's label as the truth (the ambient-confest estimator)."""
    cls = counts.sum(axis=1)
    prior = (cls + alpha) / (cls.sum() + alpha * K)
    rows = counts + alpha
    tot = rows.sum(axis=1, keepdims=True)
    Chat = np.where(tot > 0, rows / np.where(tot > 0, tot, 1), 1.0 / K)
    return prior, Chat


def estimate_em(counts, A, iters=500, tol=1e-12):
    """Maximum likelihood for (prior, C) when the auditor's confusion matrix A is known, by EM over
    the unseen true class t. Starts from the naive estimate. Returns (prior, C)."""
    prior, C = estimate_naive(counts, 0.5)
    for _ in range(iters):
        # E-step: P(t | a, o) proportional to prior[t] A[t, a] C[t, o]
        w = np.einsum("t,ta,to->tao", prior, A, C)
        w = w / np.maximum(w.sum(axis=0, keepdims=True), 1e-300)
        nt = np.einsum("tao,ao->t", w, counts)           # expected true-class counts
        nto = np.einsum("tao,ao->to", w, counts)         # expected (true, observed) counts
        new_prior = nt / nt.sum()
        new_C = nto / np.maximum(nto.sum(axis=1, keepdims=True), 1e-300)
        done = max(np.abs(new_prior - prior).max(), np.abs(new_C - C).max()) < tol
        prior, C = new_prior, new_C
        if done:
            break
    return prior, C


def posterior(C, prior):
    joint = prior[:, None] * C
    s = joint.sum(axis=0, keepdims=True)
    s = np.where(s > 0, s, 1.0)
    return (joint / s).T


def modes_from_estimate(U, prior_hat, C_hat):
    post = posterior(C_hat, prior_hat)
    return [int(np.argmax(post[o] @ U)) for o in range(K)]


def value(U, modes, C, prior):
    """True expected utility of a label-to-mode map under the true prior and confusion matrix."""
    return float(sum((prior * C[:, o]) @ U[:, modes[o]] for o in range(K)))


def policies(U, C, prior, prior_naive, C_naive, prior_em, C_em):
    blind = float(prior @ U[:, int(np.argmax(prior @ U))])
    return {"blind": blind,
            "bayes_true": value(U, modes_from_estimate(U, prior, C), C, prior),
            "bayes_naive": value(U, modes_from_estimate(U, prior_naive, C_naive), C, prior),
            "bayes_em": value(U, modes_from_estimate(U, prior_em, C_em), C, prior)}
