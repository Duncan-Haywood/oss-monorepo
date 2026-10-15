"""Learning a noisy urgency label's prior and confusion matrix from a mix of gold audits (true class
observed) and noisy audits (an auditor label of unknown accuracy). Stylised."""
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


def _draw(M, t, rng):
    return (rng.random(len(t))[:, None] > M[t].cumsum(axis=1)).sum(axis=1).clip(max=K - 1)


def draw_audits(C, A, prior, n_gold, n_noisy, rng):
    """Returns (gold[t, o], noisy[a, o]) count matrices."""
    gold = np.zeros((K, K)); noisy = np.zeros((K, K))
    t = rng.choice(K, n_gold, p=prior)
    np.add.at(gold, (t, _draw(C, t, rng)), 1)
    t = rng.choice(K, n_noisy, p=prior)
    np.add.at(noisy, (_draw(A, t, rng), _draw(C, t, rng)), 1)
    return gold, noisy


def _norm_rows(M):
    s = M.sum(axis=1, keepdims=True)
    return np.where(s > 0, M / np.where(s > 0, s, 1), 1.0 / K)


def estimate_goldonly(gold, alpha=1.0):
    cls = gold.sum(axis=1)
    return (cls + alpha) / (cls.sum() + alpha * K), _norm_rows(gold + alpha)


def estimate_noisyasgold(noisy, alpha=1.0):
    """Treat the auditor label as the truth (the ambient-confest estimator)."""
    return estimate_goldonly(noisy, alpha)


def estimate_pooled_naive(gold, noisy, alpha=1.0):
    """Pool gold and noisy counts, ignoring the auditor's errors."""
    return estimate_goldonly(gold + noisy, alpha)


def estimate_joint(gold, noisy, alpha=0.5, iters=2000, tol=1e-10, a0=0.8):
    """Maximum likelihood (with a small Dirichlet pseudo-count alpha on every row, so a zero-count
    cell cannot freeze) for (prior, C, A) by EM over the unseen true class of the noisy audits.
    The gold audits pin C and the prior; the noisy ones then identify A and add information.
    Returns (prior, C, A)."""
    prior, C = estimate_goldonly(gold, alpha)
    A = confusion(a0)   # starting auditor accuracy; the true value in the main grid is 0.8
    for _ in range(iters):
        w = np.einsum("t,ta,to->tao", prior, A, C)
        w = w / np.maximum(w.sum(axis=0, keepdims=True), 1e-300)
        nta = np.einsum("tao,ao->ta", w, noisy)
        nto = np.einsum("tao,ao->to", w, noisy) + gold
        nt = nto.sum(axis=1)
        new_prior = (nt + alpha) / (nt.sum() + alpha * K)
        new_C = _norm_rows(nto + alpha)
        new_A = _norm_rows(nta + alpha)
        done = max(np.abs(new_prior - prior).max(), np.abs(new_C - C).max(), np.abs(new_A - A).max()) < tol
        prior, C, A = new_prior, new_C, new_A
        if done:
            break
    return prior, C, A


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


def blind_value(U, prior):
    return float(prior @ U[:, int(np.argmax(prior @ U))])
