"""Validating a twin's rare-failure rate against n real trials.  The twin states a per-trial failure probability q; the real
system fails with p = c*q (c=1 is a perfect twin).  X ~ Binomial(n, p) real failures are observed.  Two validators are compared:
a *difference* test (exact two-sided binomial test of H0: p=q; the twin 'passes' if H0 is not rejected) and an *equivalence*
test (TOST with exact one-sided tests: the twin is 'validated' only if p <= q*D and p >= q/D are both rejected at level alpha).
Everything is exact binomial enumeration; nothing is simulated except in the tests and one cross-check."""
import math

__all__ = ["pmf_arr", "pvals_two_sided", "diff_pass_prob", "tost_region", "tost_prob", "n_first", "prior_bad_given_pass", "Z"]

Z = {0.10: 1.2815515655446004, 0.20: 0.8416212335729143, 0.025: 1.959963984540054, 0.05: 1.6448536269514722}


def _logpmf(x, n, p):
    if p <= 0.0:
        return 0.0 if x == 0 else -math.inf
    if p >= 1.0:
        return 0.0 if x == n else -math.inf
    return math.lgamma(n + 1) - math.lgamma(x + 1) - math.lgamma(n - x + 1) + x * math.log(p) + (n - x) * math.log1p(-p)


def _span(n, p, extra=0):
    m = n * p
    return min(n, int(m + 12.0 * math.sqrt(m + 1.0) + 30 + extra))


def pmf_arr(n, p, M=None):
    """Binomial pmf on 0..M (M defaults to a span covering all but ~1e-30 of the mass)."""
    M = _span(n, p) if M is None else M
    return [math.exp(_logpmf(x, n, p)) for x in range(M + 1)]


def pvals_two_sided(n, q, M):
    """Exact two-sided (minimum-likelihood) p-value of each x in 0..M under H0: p=q."""
    P = pmf_arr(n, q, M)
    out = []
    for x in range(M + 1):
        t = P[x] * (1.0 + 1e-7)
        out.append(min(1.0, sum(v for v in P if v <= t)))
    return out


def diff_pass_prob(n, q, p, alpha=0.05):
    """P(the difference test does not reject H0: p=q) when the real failure probability is p."""
    M = max(_span(n, q), _span(n, p))
    pv = pvals_two_sided(n, q, M)
    Pt = pmf_arr(n, p, M)
    return sum(Pt[x] for x in range(M + 1) if pv[x] > alpha)


def _cdf(n, p, M):
    P = pmf_arr(n, p, M)
    c, s = [], 0.0
    for v in P:
        s += v
        c.append(s)
    return c


def tost_region(n, q, D, alpha=0.05):
    """Failure counts (xl, xh) at which TOST validates p in [q/D, qD]: xl is the least x with P(X>=x | p=q/D) <= alpha, xh the
    greatest x with P(X<=x | p=qD) <= alpha.  None when the region is empty (too few trials to validate anything)."""
    M = max(_span(n, q * D), _span(n, q / D))
    lo, hi = _cdf(n, q / D, M), _cdf(n, min(1.0, q * D), M)
    xl = next((x for x in range(M + 1) if (1.0 - lo[x - 1] if x else 1.0) <= alpha), None)
    xh = max((x for x in range(M + 1) if hi[x] <= alpha), default=None)
    if xl is None or xh is None or xl > xh:
        return None
    return xl, xh


def tost_prob(n, q, D, p, alpha=0.05):
    """P(TOST validates the twin) when the real failure probability is p."""
    reg = tost_region(n, q, D, alpha)
    if reg is None:
        return 0.0
    xl, xh = reg
    Pt = pmf_arr(n, p, max(xh, _span(n, p)))
    return sum(Pt[x] for x in range(xl, min(xh, len(Pt) - 1) + 1))


def n_first(f, target, lo=10, hi=10 ** 7, step=1.03, hold=6):
    """Least n on a geometric grid with f(n) >= target that also holds on the next `hold` grid points (the exact power of a
    binomial test is a sawtooth in n, so the first crossing is not a sample size one can rely on)."""
    grid, n = [], lo
    while n <= hi:
        grid.append(int(n))
        n = max(n + 1, n * step)
    for i, n in enumerate(grid):
        if all(f(m) >= target for m in grid[i:i + hold + 1]):
            return n
    return None


def prior_bad_given_pass(n, q, logc_sd, bad, passer, grid=241, span=4.0):
    """Prior log c ~ N(0, logc_sd^2).  Returns (P(bad), P(pass), P(bad | pass), P(pass | bad)) where 'bad' means |ln c| >= ln(bad)
    and passer(p) is the probability a twin with real failure probability p passes validation."""
    lb = math.log(bad)
    num_bad = num_pass = num_both = 0.0
    for i in range(grid):
        z = -span + 2 * span * i / (grid - 1)
        w = math.exp(-0.5 * z * z)
        lc = z * logc_sd
        pp = passer(min(0.999, q * math.exp(lc)))
        isbad = abs(lc) >= lb
        num_bad += w * isbad
        num_pass += w * pp
        num_both += w * pp * isbad
    tot = sum(math.exp(-0.5 * (-span + 2 * span * i / (grid - 1)) ** 2) for i in range(grid))
    pb, pp_, pboth = num_bad / tot, num_pass / tot, num_both / tot
    return pb, pp_, pboth / pp_, pboth / pb
