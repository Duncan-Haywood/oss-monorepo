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


def ppi_ols_lam(X, f_all, idx, y_audit, lam):
    """General PPI++ estimating equation for OLS at one scalar lam (Angelopoulos et al. 2023, PPI++, M-estimation
    form): solve lam mean_all x (f - x'th) + mean_audit x [(y - x'th) - lam (f - x'th)] = 0, which is linear:
    th = M_lam^-1 [lam mean_all x f + mean_audit x (y - lam f)], M_lam = lam M_all + (1 - lam) M_audit.
    lam = 0 is human-only OLS on the audit, lam = 1 is `ppi_ols`. Returns (coefficients, per-row influence
    matrix Psi of shape (n, k) with sqrt-variance sd(Psi)/sqrt(n) * sqrt(1 - n/N) per coordinate)."""
    N, k = X.shape
    n = len(idx)
    Xa, fa = X[idx], f_all[idx]
    Mlam = lam * (X.T @ X / N) + (1 - lam) * (Xa.T @ Xa / n)
    Minv = np.linalg.inv(Mlam)
    rhs = lam * (X * f_all[:, None]).mean(axis=0) + (Xa * (y_audit - lam * fa)[:, None]).mean(axis=0)
    th = Minv @ rhs
    e = (y_audit - lam * fa) - (1 - lam) * (Xa @ th)  # audit residual of the blended equation
    return th, (Xa * e[:, None]) @ Minv.T


def ppi_ols_tuned(X, f_all, idx, y_audit, grid=None):
    """Power-tuned PPI++ for OLS: per coefficient, the lam on a grid in [0, 1] with the smallest estimated se
    (in-sample on the audit). Because lam = 0 is on the grid and equals human-only OLS, the tuned se is at most
    human-only's by construction; the price of choosing lam on the same audit is paid in coverage and is what the
    experiment measures. Returns (coefficients, se, lams)."""
    N, k = X.shape
    n = len(idx)
    grid = np.linspace(0, 1, 21) if grid is None else grid
    best_b, best_se, best_lam = np.zeros(k), np.full(k, np.inf), np.zeros(k)
    for lam in grid:
        th, psi = ppi_ols_lam(X, f_all, idx, y_audit, lam)
        se = np.sqrt(psi.var(axis=0, ddof=1) * (1 - n / N) / n)
        better = se < best_se
        best_b[better], best_se[better], best_lam[better] = th[better], se[better], lam
    return best_b, best_se, best_lam


def ppi_ols_crossfit(X, f_all, idx, y_audit, rng_perm, grid=None):
    """Two-fold cross-fitted PPI++ for OLS. The audit is split in two halves by the permutation `rng_perm`
    (an array of positions 0..n-1); for each half, per-coefficient lam is chosen on the *other* half (smallest
    estimated se over the grid, as `ppi_ols_tuned`) and the estimate is computed on this half with that lam. The
    two half estimates are averaged with weight 1/2 and the se is 1/2 sqrt(se_A^2 + se_B^2) (disjoint audit rows,
    so the halves are treated as independent; the finite-population correction uses each half's own size).
    The half-sample se is sqrt(2) times the full-audit se, so the average has about the full-audit width.
    Returns (coefficients, se, mean of the two chosen lams)."""
    N, k = X.shape
    grid = np.linspace(0, 1, 21) if grid is None else grid
    halves = [rng_perm[: len(rng_perm) // 2], rng_perm[len(rng_perm) // 2:]]
    ths, ses, lams = [], [], []
    for a, b in ((0, 1), (1, 0)):
        ia, ib = np.asarray(idx)[halves[a]], np.asarray(idx)[halves[b]]
        _, _, lam = ppi_ols_tuned(X, f_all, ib, y_audit[halves[b]], grid)  # lam from the other half
        th = np.zeros(k)
        se = np.zeros(k)
        for lv in np.unique(lam):
            t, psi = ppi_ols_lam(X, f_all, ia, y_audit[halves[a]], lv)
            m = lam == lv
            th[m] = t[m]
            se[m] = np.sqrt(psi.var(axis=0, ddof=1) * (1 - len(ia) / N) / len(ia))[m]
        ths.append(th); ses.append(se); lams.append(lam)
    return (ths[0] + ths[1]) / 2, np.sqrt(ses[0] ** 2 + ses[1] ** 2) / 2, (lams[0] + lams[1]) / 2
