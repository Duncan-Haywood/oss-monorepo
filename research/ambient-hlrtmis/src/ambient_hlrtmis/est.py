"""Copy of the ambient-dshard estimators (naive, EM, Dawid-Skene, hardness-aware for two auditors) plus three-auditor versions at the end. Stylised."""
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




def easy_accuracy(acc, h, hard_acc):
    """Accuracy on easy messages that keeps the auditors' overall accuracy at `acc` when a fraction h
    of messages is hard (accuracy hard_acc): (1-h)*easy + h*hard_acc = acc."""
    return (acc - h * hard_acc) / (1 - h)


def joint_audit2_hard(C, acc, h, hard_acc, prior):
    """Exact P(a1, a2, o) for the hard-message model: with probability h a message is hard, and both
    auditors then use a uniform-error matrix of accuracy hard_acc; otherwise both use accuracy
    easy_accuracy(acc, h, hard_acc). Given hardness and the true class the auditors are independent, so
    each auditor's marginal accuracy is exactly acc, and only their dependence changes with h."""
    Ae, Ah = confusion(easy_accuracy(acc, h, hard_acc)), confusion(hard_acc)
    return (1 - h) * np.einsum("t,ta,tb,to->abo", prior, Ae, Ae, C) + h * np.einsum("t,ta,tb,to->abo", prior, Ah, Ah, C)


def draw_audit2_hard(C, acc, h, hard_acc, prior, n, rng):
    """n messages from the hard-message model -> counts[a1, a2, o]."""
    Ae, Ah = confusion(easy_accuracy(acc, h, hard_acc)), confusion(hard_acc)
    hard = rng.random(n) < h

    def lab(M_easy, M_hard, t):
        r = rng.random(n)[:, None]
        e = (r > M_easy[t].cumsum(axis=1)).sum(axis=1)
        d = (r > M_hard[t].cumsum(axis=1)).sum(axis=1)
        return np.where(hard, d, e).clip(max=K - 1)

    t = rng.choice(K, n, p=prior)
    a1, a2 = lab(Ae, Ah, t), lab(Ae, Ah, t)
    o = (rng.random(n)[:, None] > C[t].cumsum(axis=1)).sum(axis=1).clip(max=K - 1)
    counts = np.zeros((K, K, K))
    np.add.at(counts, (a1, a2, o), 1)
    return counts


def estimate_ds_hard(counts, iters=3000, tol=1e-12, init=(0.9, 0.5, 0.3, 0.7)):
    """Hardness-aware Dawid-Skene: a latent flag h in {easy, hard} per message, matrices A_easy and
    A_hard shared by both auditors (an assumption that matches the generator, so this is a best case for
    the estimator), classifier matrix C independent of h. Started from the informed guess `init` =
    (easy accuracy, hard accuracy, P(hard), classifier accuracy). Returns (prior, C, A_easy, A_hard, p_hard)."""
    Ae, Ah, C = confusion(init[0]), confusion(init[1]), confusion(init[3])
    ph, prior = init[2], PRIOR.copy()
    norm = lambda m: m / np.maximum(m.sum(axis=1, keepdims=True), 1e-300)
    for _ in range(iters):
        wE = (1 - ph) * np.einsum("t,ta,tb,to->tabo", prior, Ae, Ae, C)
        wH = ph * np.einsum("t,ta,tb,to->tabo", prior, Ah, Ah, C)
        z = np.maximum(wE.sum(axis=0) + wH.sum(axis=0), 1e-300)
        wE, wH = wE / z, wH / z
        nE, nH = np.einsum("tabo,abo->t", wE, counts), np.einsum("tabo,abo->t", wH, counts)
        nAe = np.einsum("tabo,abo->ta", wE, counts) + np.einsum("tabo,abo->tb", wE, counts)
        nAh = np.einsum("tabo,abo->ta", wH, counts) + np.einsum("tabo,abo->tb", wH, counts)
        nC = np.einsum("tabo,abo->to", wE + wH, counts)
        new = ((nE + nH) / (nE + nH).sum(), norm(nC), norm(nAe), norm(nAh), nH.sum() / (nE + nH).sum())
        done = max(np.abs(new[0] - prior).max(), np.abs(new[1] - C).max(), np.abs(new[2] - Ae).max(),
                   np.abs(new[3] - Ah).max(), abs(new[4] - ph)) < tol
        prior, C, Ae, Ah, ph = new
        if done:
            break
    return prior, C, Ae, Ah, ph


# ---- three auditors (new in ambient-third) ----

def joint3_hard(C, acc, h, hard_acc, prior):
    """Exact P(a1, a2, a3, o) when three auditors share the hard-message flag (same model as joint_audit2_hard)."""
    Ae, Ah = confusion(easy_accuracy(acc, h, hard_acc)), confusion(hard_acc)
    f = lambda A: np.einsum("t,ta,tb,tc,to->abco", prior, A, A, A, C)
    return (1 - h) * f(Ae) + h * f(Ah)


def draw3_hard(C, acc, h, hard_acc, prior, n, rng):
    """n messages -> counts[a1, a2, a3, o]."""
    Ae, Ah = confusion(easy_accuracy(acc, h, hard_acc)), confusion(hard_acc)
    hard = rng.random(n) < h
    t = rng.choice(K, n, p=prior)

    def lab(M):
        r = rng.random(n)[:, None]
        return (r > M[t].cumsum(axis=1)).sum(axis=1).clip(max=K - 1)

    a = [np.where(hard, lab(Ah), lab(Ae)) for _ in range(3)]
    o = lab(C)
    counts = np.zeros((K, K, K, K))
    np.add.at(counts, (a[0], a[1], a[2], o), 1)
    return counts


def estimate_ds3(counts, iters=2000, tol=1e-12, init_acc=0.7):
    """Plain Dawid-Skene for three auditors plus the classifier, each with its own matrix, assuming
    independence given the true class. Returns (prior, C, [A1, A2, A3])."""
    As = [confusion(init_acc) for _ in range(3)]
    C, prior = confusion(init_acc), PRIOR.copy()
    norm = lambda m: m / np.maximum(m.sum(axis=1, keepdims=True), 1e-300)
    for _ in range(iters):
        w = np.einsum("t,ta,tb,tc,to->tabco", prior, As[0], As[1], As[2], C)
        w = w / np.maximum(w.sum(axis=0, keepdims=True), 1e-300)
        nt = np.einsum("tabco,abco->t", w, counts)
        nA = [np.einsum("tabco,abco->ta", w, counts), np.einsum("tabco,abco->tb", w, counts),
              np.einsum("tabco,abco->tc", w, counts)]
        nC = np.einsum("tabco,abco->to", w, counts)
        new = (nt / nt.sum(), norm(nC), [norm(m) for m in nA])
        done = max(np.abs(new[0] - prior).max(), np.abs(new[1] - C).max(),
                   *[np.abs(a - b).max() for a, b in zip(new[2], As)]) < tol
        prior, C, As = new
        if done:
            break
    return prior, C, As


def estimate_ds3_hard(counts, iters=3000, tol=1e-12, init=(0.9, 0.5, 0.3, 0.7)):
    """Hardness-aware DS for three auditors: latent flag, matrices A_easy and A_hard shared by the three
    auditors, classifier matrix C independent of hardness. init = (easy acc, hard acc, P(hard), classifier acc).
    Returns (prior, C, A_easy, A_hard, p_hard, loglik)."""
    Ae, Ah, C = confusion(init[0]), confusion(init[1]), confusion(init[3])
    ph, prior = init[2], PRIOR.copy()
    norm = lambda m: m / np.maximum(m.sum(axis=1, keepdims=True), 1e-300)
    ll = -np.inf
    for _ in range(iters):
        wE = (1 - ph) * np.einsum("t,ta,tb,tc,to->tabco", prior, Ae, Ae, Ae, C)
        wH = ph * np.einsum("t,ta,tb,tc,to->tabco", prior, Ah, Ah, Ah, C)
        z = np.maximum(wE.sum(axis=0) + wH.sum(axis=0), 1e-300)
        ll = float((counts * np.log(z)).sum() / counts.sum())
        wE, wH = wE / z, wH / z
        s = lambda w, sub: np.einsum(f"tabco,abco->{sub}", w, counts)
        nE, nH = s(wE, "t"), s(wH, "t")
        nAe = s(wE, "ta") + s(wE, "tb") + s(wE, "tc")
        nAh = s(wH, "ta") + s(wH, "tb") + s(wH, "tc")
        nC = s(wE + wH, "to")
        new = ((nE + nH) / (nE + nH).sum(), norm(nC), norm(nAe), norm(nAh), nH.sum() / (nE + nH).sum())
        done = max(np.abs(new[0] - prior).max(), np.abs(new[1] - C).max(), np.abs(new[2] - Ae).max(),
                   np.abs(new[3] - Ah).max(), abs(new[4] - ph)) < tol
        prior, C, Ae, Ah, ph = new
        if done:
            break
    return prior, C, Ae, Ah, ph, ll


# ---- likelihood-ranked multi-start (new in ambient-multistart) ----
START_GRID = tuple((e, h, p, 0.7) for e in (0.95, 0.85) for h in (0.4, 0.6) for p in (0.15, 0.4))


def estimate_ds3_hard_multistart(counts, starts=START_GRID, iters=3000, tol=1e-10):
    """Fit estimate_ds3_hard from every start and keep the fit with the highest log-likelihood.
    Returns (prior, C, A_easy, A_hard, p_hard, loglik, index of the winning start)."""
    best, bi = None, -1
    for i, s in enumerate(starts):
        fit = estimate_ds3_hard(counts, iters=iters, tol=tol, init=s)
        if best is None or fit[5] > best[5]:
            best, bi = fit, i
    return (*best, bi)


# ---- start-count study (new in ambient-startcount) ----
# Nested grids: the first K entries are the K-start grid, K in (1, 2, 4, 8, 16). The first 8 are START_GRID.
_G8 = [(0.95, 0.4, 0.15), (0.85, 0.6, 0.4), (0.95, 0.6, 0.4), (0.85, 0.4, 0.15),
       (0.95, 0.4, 0.4), (0.85, 0.6, 0.15), (0.95, 0.6, 0.15), (0.85, 0.4, 0.4)]
_G16 = [(e, h, p) for e in (0.95, 0.85) for h in (0.3, 0.5) for p in (0.15, 0.4)]
NESTED_GRID = tuple((e, h, p, 0.7) for e, h, p in _G8 + _G16)
KS = (1, 2, 4, 8, 16)


def random_starts(rng, k):
    """k random starts: easy accuracy U(0.7, 1), hard accuracy U(0.3, 0.7), P(hard) U(0.05, 0.5), classifier 0.7."""
    return tuple((rng.uniform(0.7, 1.0), rng.uniform(0.3, 0.7), rng.uniform(0.05, 0.5), 0.7) for _ in range(k))


def fit_all(counts, starts, iters=2000, tol=1e-10):
    """One dsH3 fit per start, in order; each fit is (prior, C, A_easy, A_hard, p_hard, loglik)."""
    return [estimate_ds3_hard(counts, iters=iters, tol=tol, init=s) for s in starts]


def best_of_first(fits, k):
    """The highest-log-likelihood fit among the first k (ties go to the earlier start)."""
    best = fits[0]
    for f in fits[1:k]:
        if f[5] > best[5]:
            best = f
    return best


# ---- likelihood-ratio test of "no hard messages" (new in ambient-hlrt) ----

def fit_null(counts, iters=2000, tol=1e-10, init_acc=0.8):
    """The h = 0 model: one confusion matrix A shared by all three auditors, classifier matrix C, prior.
    Same as estimate_ds3_hard with P(hard) fixed at 0 (so A_hard drops out). Returns (prior, C, A, loglik)."""
    A, C, prior = confusion(init_acc), confusion(0.7), PRIOR.copy()
    norm = lambda m: m / np.maximum(m.sum(axis=1, keepdims=True), 1e-300)
    ll = -np.inf
    for _ in range(iters):
        w = np.einsum("t,ta,tb,tc,to->tabco", prior, A, A, A, C)
        z = np.maximum(w.sum(axis=0), 1e-300)
        ll = float((counts * np.log(z)).sum() / counts.sum())
        w = w / z
        s = lambda sub: np.einsum(f"tabco,abco->{sub}", w, counts)
        nt = s("t")
        new = (nt / nt.sum(), norm(s("to")), norm(s("ta") + s("tb") + s("tc")))
        done = max(np.abs(new[0] - prior).max(), np.abs(new[1] - C).max(), np.abs(new[2] - A).max()) < tol
        prior, C, A = new
        if done:
            break
    return prior, C, A, ll


def lrt_stat(counts, starts, iters=2000, tol=1e-10):
    """2 n (best alternative loglik - null loglik), the alternative being the best of `starts` hardness-aware
    fits. Clipped at 0 (the alternative contains the null as P(hard) -> 0, so a negative value is a search miss).
    Returns (statistic, null fit, best alternative fit)."""
    nf = fit_null(counts, iters, tol)
    best = None
    for s in starts:
        f = estimate_ds3_hard(counts, iters=iters, tol=tol, init=s)
        if best is None or f[5] > best[5]:
            best = f
    n = counts.sum()
    return max(0.0, 2 * n * (best[5] - nf[3])), nf, best


def sample_null(nf, acc_unused, n, rng):
    """Parametric-bootstrap draw from the fitted null: counts[a1, a2, a3, o] for n messages."""
    prior, C, A, _ = nf
    t = rng.choice(K, n, p=prior)

    def lab(M):
        return (rng.random(n)[:, None] > M[t].cumsum(axis=1)).sum(axis=1).clip(max=K - 1)

    a = [lab(A) for _ in range(3)]
    o = lab(C)
    counts = np.zeros((K, K, K, K))
    np.add.at(counts, (a[0], a[1], a[2], o), 1)
    return counts


def bootstrap_p(counts, starts, B, rng, iters=2000, tol=1e-10):
    """Parametric-bootstrap p-value (1 + #{T* >= T}) / (B + 1), refitting null and alternative on each of B
    draws from the fitted null. Returns (p, T)."""
    T, nf, _ = lrt_stat(counts, starts, iters, tol)
    n = int(counts.sum())
    exceed = sum(lrt_stat(sample_null(nf, None, n, rng), starts, iters, tol)[0] >= T for _ in range(B))
    return (1 + exceed) / (B + 1), T


# ---- unequal auditors, no hard messages (new in ambient-hlrtmis) ----

def draw3_unequal(C, accs, prior, n, rng):
    """n messages with h = 0 where auditor i has uniform-error accuracy accs[i]; independent given the
    true class. counts[a1, a2, a3, o]. The null fitted by fit_null shares one matrix, so this is a misspecified null."""
    t = rng.choice(K, n, p=prior)

    def lab(M):
        r = rng.random(n)[:, None]
        return (r > M[t].cumsum(axis=1)).sum(axis=1).clip(max=K - 1)

    a = [lab(confusion(x)) for x in accs]
    o = lab(C)
    counts = np.zeros((K, K, K, K))
    np.add.at(counts, (a[0], a[1], a[2], o), 1)
    return counts
