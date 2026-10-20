"""Copy of the ambient-noisyaudit estimators (single auditor, known accuracy) plus Dawid-Skene EM for
two auditors with unknown confusion matrices. Stylised."""
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


def draw_audit2(C, A1, A2, prior, n, rng):
    """n messages, each labelled by two independent auditors -> counts[a1, a2, o]."""
    def lab(M, t):
        return (rng.random(n)[:, None] > M[t].cumsum(axis=1)).sum(axis=1).clip(max=K - 1)
    t = rng.choice(K, n, p=prior)
    a1, a2, o = lab(A1, t), lab(A2, t), lab(C, t)
    counts = np.zeros((K, K, K))
    np.add.at(counts, (a1, a2, o), 1)
    return counts


def joint_audit2(C, A1, A2, prior):
    """Exact P(a1, a2, o)."""
    return np.einsum("t,ta,tb,to->abo", prior, A1, A2, C)


def estimate_ds(counts, iters=2000, tol=1e-12, init_acc=0.7):
    """Dawid-Skene EM: maximum likelihood for the prior and the confusion matrices of auditor 1,
    auditor 2 and the classifier, none known. Started from the posterior implied by auditor 1's label
    alone with a diagonal-dominant guess (this fixes the label-switching symmetry). Returns
    (prior, C_classifier, A1_hat, A2_hat)."""
    A1, A2, C = confusion(init_acc), confusion(init_acc), confusion(init_acc)
    prior = PRIOR.copy()
    for _ in range(iters):
        w = np.einsum("t,ta,tb,to->tabo", prior, A1, A2, C)
        w = w / np.maximum(w.sum(axis=0, keepdims=True), 1e-300)
        nt = np.einsum("tabo,abo->t", w, counts)
        nA1 = np.einsum("tabo,abo->ta", w, counts)
        nA2 = np.einsum("tabo,abo->tb", w, counts)
        nC = np.einsum("tabo,abo->to", w, counts)
        norm = lambda m: m / np.maximum(m.sum(axis=1, keepdims=True), 1e-300)
        new = (nt / nt.sum(), norm(nA1), norm(nA2), norm(nC))
        done = max(np.abs(new[0] - prior).max(), np.abs(new[1] - A1).max(),
                   np.abs(new[2] - A2).max(), np.abs(new[3] - C).max()) < tol
        prior, A1, A2, C = new
        if done:
            break
    return prior, C, A1, A2


def joint_audit2_corr(C, A1, A2, prior, rho):
    """Exact P(a1, a2, o) when, with probability rho per message, auditor 2 copies auditor 1's label
    (so both share the same error) and otherwise labels independently. Each auditor's marginal
    confusion matrix is unchanged; only their dependence given the true class changes."""
    ind = np.einsum("t,ta,tb,to->abo", prior, A1, A2, C)
    cp = np.einsum("t,ta,to->ao", prior, A1, C)
    copy = np.zeros((K, K, K))
    for a in range(K):
        copy[a, a, :] = cp[a, :]
    return (1 - rho) * ind + rho * copy


def draw_audit2_corr(C, A1, A2, prior, rho, n, rng):
    """n messages with the shared-error auditor pair -> counts[a1, a2, o]."""
    def lab(M, t):
        return (rng.random(n)[:, None] > M[t].cumsum(axis=1)).sum(axis=1).clip(max=K - 1)
    t = rng.choice(K, n, p=prior)
    a1, a2, o = lab(A1, t), lab(A2, t), lab(C, t)
    a2 = np.where(rng.random(n) < rho, a1, a2)
    counts = np.zeros((K, K, K))
    np.add.at(counts, (a1, a2, o), 1)
    return counts
