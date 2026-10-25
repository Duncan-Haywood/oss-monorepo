"""PPI for linear regression (Angelopoulos et al. 2023, "Prediction-powered inference", Sec. on linear
regression), design-based: the corpus (every x and every coder code f) is the fixed population and the
audit is a simple random sample of it, so the target is the OLS coefficient on the corpus's own human
labels. Needs numpy (the rest of `llmci` is stdlib only).

    theta = M^-1 [ mean_all x f + mean_audit x (y - f) ],  M = mean_all x x'
    var   = M^-1 Cov_audit(x (y - f)) M^-1 * (1 - n/N) / n
"""
import numpy as np

Z95 = 1.959963984540054


def ols(X, y):
    return np.linalg.solve(X.T @ X, X.T @ y)


def naive_ols(X, f_all):
    """Regress the coder's codes on X over the corpus; se from the usual OLS formula, ignoring coder error."""
    n, k = X.shape
    b = ols(X, f_all)
    r = f_all - X @ b
    cov = np.linalg.inv(X.T @ X) * (r @ r) / (n - k)
    return b, np.sqrt(np.diag(cov))


def human_ols(Xa, ya, N=None):
    """Regress the audit's human labels on X (sandwich se); `N` adds the finite-population correction."""
    n, k = Xa.shape
    b = ols(Xa, ya)
    r = ya - Xa @ b
    bread = np.linalg.inv(Xa.T @ Xa / n)
    meat = (Xa * r[:, None]).T @ (Xa * r[:, None]) / n
    cov = bread @ meat @ bread / n
    if N:
        cov *= 1 - n / N
    return b, np.sqrt(np.diag(cov))


def ppi_ols(X, f_all, idx, y_audit, lam=1.0):
    """X, f_all: whole corpus. idx: audited row indices. y_audit: their human labels."""
    N, k = X.shape
    Xa, fa = X[idx], f_all[idx]
    M = X.T @ X / N
    resid = y_audit - lam * fa
    psi = Xa * resid[:, None]
    mu = (X * f_all[:, None]).mean(axis=0) * lam + psi.mean(axis=0)
    Minv = np.linalg.inv(M)
    n = len(idx)
    cov = Minv @ np.cov(psi.T, ddof=1) @ Minv * (1 - n / N) / n
    return Minv @ mu, np.sqrt(np.diag(cov))
