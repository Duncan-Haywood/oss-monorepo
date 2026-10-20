"""Bayesian piecewise-exponential hazard model with partial pooling across surveys.

log hazard for unit u (survey s), duration band b:
    eta_ub = g_b + a_s + r_sb             survey baseline: global duration curve, survey level,
                                          survey-specific shape (shrunk to the global curve)
           + c_s * (wedding_year - 1990)/10   survey-specific cohort slope
           + x_u' beta                    effects shared by every survey (incl. a wedding-year spline)
           + sum_k xd_uk delta_sk         survey deviations of each input's primary contrast, only
                                          for surveys that measured the input (random effects)

Likelihood: exact-time follow-up contributes Poisson terms (events, exposure) per band;
interval-censored panel spells contribute P(event in spell) = 1 - exp(-len * exp(eta))
(complementary log-log) at the spell's mid-duration band.

Priors (independent normals): g, a ~ N(0, 10^2); r ~ N(0, 0.5^2); c ~ N(0, 0.5^2);
beta ~ N(0, 1) on standardised inputs (log rate ratios); delta ~ N(0, tau^2), tau chosen by
the Laplace approximation to the marginal likelihood over a grid (empirical Bayes).

Posterior: Laplace approximation, N(mode, H^-1) with H the Fisher information plus prior
precision at the mode, found by damped Newton steps. Across multiple imputations the posterior
is the equal mixture of the per-imputation Laplace posteriors (draws are pooled).
"""
import numpy as np

from design import NB

PRIOR_SD = dict(g=10.0, a=10.0, r=0.5, c=0.5, beta=1.0)


class Layout:
    def __init__(self, S, Q_main, D):
        self.S, self.P, self.D = S, Q_main, D
        self.ig = np.arange(NB)
        self.ia = NB + np.arange(S)
        self.ir = NB + S + np.arange(S * NB)
        self.nphi = NB + S + S * NB
        self.ic = self.nphi + np.arange(S)
        self.ib = self.nphi + S + np.arange(Q_main)
        self.id = self.nphi + S + Q_main + np.arange(D)
        self.k = self.nphi + S + Q_main + D

    def prior_prec(self, tau):
        p = np.empty(self.k)
        p[self.ig] = 1 / PRIOR_SD['g'] ** 2
        p[self.ia] = 1 / PRIOR_SD['a'] ** 2
        p[self.ir] = 1 / PRIOR_SD['r'] ** 2
        p[self.ic] = 1 / PRIOR_SD['c'] ** 2
        p[self.ib] = 1 / PRIOR_SD['beta'] ** 2
        p[self.id] = 1 / tau ** 2
        return p

    def base(self, theta):
        """(S, NB) baseline log hazard."""
        g, a, r = theta[self.ig], theta[self.ia], theta[self.ir].reshape(self.S, NB)
        return g[None, :] + a[:, None] + r


def _A(L):
    """Map from phi = (g, a, r) to the S*NB baseline cells."""
    A = np.zeros((L.S * NB, L.nphi))
    for s in range(L.S):
        for b in range(NB):
            row = s * NB + b
            A[row, b] = 1
            A[row, NB + s] = 1
            A[row, NB + L.S + s * NB + b] = 1
    return A


class Data:
    """Everything the likelihood needs, unit-level, sorted by survey (contiguous slices)."""

    def __init__(self, s_idx, Xu, E, Y, iv, cz, S):
        s_idx = np.asarray(s_idx)
        self.order = np.argsort(s_idx, kind='stable')
        inv = np.empty_like(self.order)
        inv[self.order] = np.arange(len(self.order))
        self.s = s_idx[self.order]
        n = len(self.s)
        cz = np.asarray(cz, float)[self.order]
        self.X = np.empty((n, S + Xu.shape[1]))
        self.X[:, :S] = 0.0
        self.X[np.arange(n), self.s] = cz            # survey cohort-slope columns
        self.X[:, S:] = np.asarray(Xu, float)[self.order]
        self.E, self.Y = E[self.order], Y[self.order]
        self.iv = dict(iv)
        if len(iv['unit']):
            self.iv['unit'] = inv[iv['unit']]
        self.slices = {s: slice(*np.searchsorted(self.s, [s, s + 1])) for s in range(S)}


def _terms(L, D, theta):
    base = L.base(theta)
    lp = D.X @ theta[np.r_[L.ic, L.ib, L.id]]
    eb = np.exp(base[D.s] + lp[:, None])            # (n, NB) hazard, exact follow-up
    mu = D.E * eb
    ll = float((D.Y * np.log(np.where(D.Y > 0, eb, 1.0))).sum() - mu.sum())
    gU = D.Y - mu                                    # d ll / d eta_ub
    wU = mu                                          # Fisher weights
    iv = D.iv
    if len(iv['unit']):
        u, b = iv['unit'], iv['band']
        m = iv['length'] * np.exp(base[D.s[u], b] + lp[u])
        p = -np.expm1(-m)
        y = iv['y']
        ll += float((y * np.log(np.maximum(p, 1e-300)) - (1 - y) * m).sum())
        gi = np.where(y > 0, m * np.exp(-m) / np.maximum(p, 1e-300), -m)
        wi = m * m * np.exp(-m) / np.maximum(p, 1e-300)
        np.add.at(gU, (u, b), gi)
        np.add.at(wU, (u, b), wi)
    return ll, gU, wU, lp


def _grad_hess(L, D, theta, gU, wU, A, chunk=40000):
    S, k = L.S, L.k
    g = np.zeros(k)
    H = np.zeros((k, k))
    gc = np.zeros((S, NB))
    wc = np.zeros((S, NB))
    np.add.at(gc, D.s, gU)
    np.add.at(wc, D.s, wU)
    g[:L.nphi] = A.T @ gc.ravel()
    H[:L.nphi, :L.nphi] = A.T @ (wc.ravel()[:, None] * A)
    iu = np.r_[L.ic, L.ib, L.id]
    gu = gU.sum(1)
    wu = wU.sum(1)
    g[iu] = D.X.T @ gu
    G = np.zeros((len(iu), len(iu)))
    for a in range(0, len(gu), chunk):
        Xa = D.X[a:a + chunk]
        G += Xa.T @ (wu[a:a + chunk, None] * Xa)
    H[np.ix_(iu, iu)] = G
    C = np.zeros((S * NB, len(iu)))                 # baseline cell (s, b) x unit parameters
    for s, sl in D.slices.items():
        if sl.stop > sl.start:
            C[s * NB:(s + 1) * NB] = wU[sl].T @ D.X[sl]
    AC = A.T @ C
    H[np.ix_(np.arange(L.nphi), iu)] = AC
    H[np.ix_(iu, np.arange(L.nphi))] = AC.T
    return g, H


def fit(L, D, tau, theta0=None, max_iter=40, tol=1e-6, verbose=False):
    """Posterior mode and Hessian (Fisher + prior). Returns (theta, H, log posterior at mode)."""
    A = _A(L)
    prec = L.prior_prec(tau)
    theta = np.zeros(L.k) if theta0 is None else theta0.copy()
    if theta0 is None:
        tot_ev = D.Y.sum() + (D.iv['y'].sum() if len(D.iv['unit']) else 0)
        tot_ex = D.E.sum() + (D.iv['length'].sum() if len(D.iv['unit']) else 0)
        theta[L.ig] = np.log(tot_ev / tot_ex)
    ll, gU, wU, _ = _terms(L, D, theta)
    lpost = ll - 0.5 * (prec * theta ** 2).sum()
    for it in range(max_iter):
        g, H = _grad_hess(L, D, theta, gU, wU, A)
        g -= prec * theta
        H[np.diag_indices_from(H)] += prec
        step = np.linalg.solve(H, g)
        t = 1.0
        while True:
            cand = theta + t * step
            ll2, gU2, wU2, _ = _terms(L, D, cand)
            lp2 = ll2 - 0.5 * (prec * cand ** 2).sum()
            if np.isfinite(lp2) and lp2 >= lpost - 1e-9:
                break
            t /= 2
            if t < 1e-6:
                break
        theta, ll, gU, wU = cand, ll2, gU2, wU2
        delta_lp, lpost = lp2 - lpost, lp2
        if verbose:
            print(f'    newton {it}: log posterior {lpost:.3f} (+{delta_lp:.2e}), step {t}', flush=True)
        if abs(delta_lp) < tol * max(1.0, abs(lpost)) and t == 1.0:
            break
    g, H = _grad_hess(L, D, theta, gU, wU, A)
    H[np.diag_indices_from(H)] += prec
    return theta, H, lpost


def log_evidence(L, theta, H, lpost, tau):
    """Laplace approximation to log p(y | tau), up to a constant that does not depend on tau."""
    prec = L.prior_prec(tau)
    sign, logdet = np.linalg.slogdet(H)
    return lpost + 0.5 * np.log(prec).sum() - 0.5 * logdet


def draws(theta, H, n, rng):
    """Draws from N(theta, H^-1)."""
    Lc = np.linalg.cholesky(H)
    z = rng.standard_normal((n, len(theta)))
    # H = L L^T  =>  cov = L^-T L^-1; x = theta + L^-T z
    from scipy.linalg import solve_triangular
    return theta[None, :] + solve_triangular(Lc.T, z.T, lower=False).T


def unit_lp(L, theta, Xu, s_idx, cz, s_known=True):
    """Unit linear predictor (no baseline). Units of a survey not in the fit get c = 0."""
    lp = Xu @ theta[np.r_[L.ib, L.id]]
    if s_known:
        lp = lp + theta[L.ic][s_idx] * cz
    return lp


def expected(base_su, lp, E, iv_unit=None, iv_band=None, iv_len=None):
    """Expected events: exact units (n, NB) exposure E; interval spells -> probabilities."""
    mu = E * np.exp(base_su + lp[:, None])
    p = None
    if iv_unit is not None and len(iv_unit):
        m = iv_len * np.exp(base_su[iv_unit, iv_band] + lp[iv_unit])
        p = -np.expm1(-m)
    return mu, p
