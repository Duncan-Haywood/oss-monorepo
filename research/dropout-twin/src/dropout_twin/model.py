"""A thin obstacle subtends m adjacent lidar beams; it is detected iff at least k of them return.  Each beam is
dropped (no return) with marginal probability p.  The twin drops beams i.i.d.; the 'real' sensor drops them as a
stationary two-state Markov chain along the scan with the SAME marginal p and lag-1 correlation lam (dust, glare, a
absorbing patch).  Chain: P(drop | previous dropped) = q = p + lam (1-p), P(drop | previous returned) = r = p (1-lam)."""
import math, random

__all__ = ["qr", "miss_iid", "miss_chain", "miss_markov", "miss_k1_markov", "min_width", "sample_mask", "fit_chain",
           "inflated_p", "scan_miss_mc"]


def qr(p, lam):
    return p + lam * (1.0 - p), p * (1.0 - lam)


def miss_iid(m, k, p):
    """P(fewer than k returns among m beams), returns ~ Bin(m, 1-p)."""
    return sum(math.comb(m, j) * (1 - p) ** j * p ** (m - j) for j in range(min(k, m + 1)))


def miss_chain(m, k, q, r):
    """Exact P(fewer than k of m consecutive beams return) under the stationary chain (q, r); DP over (state, returns<k)."""
    pi = r / (1.0 - q + r)
    # f[s][j]: prob of state s at current beam with j returns so far (j capped at k = detected)
    f = [[0.0] * (k + 1) for _ in range(2)]  # s=1 dropped, s=0 returned
    f[1][0] = pi
    f[0][min(1, k)] = 1.0 - pi
    for _ in range(m - 1):
        g = [[0.0] * (k + 1) for _ in range(2)]
        for s in (0, 1):
            pd = q if s == 1 else r
            for j in range(k + 1):
                v = f[s][j]
                if v == 0.0:
                    continue
                g[1][j] += v * pd
                g[0][min(j + 1, k)] += v * (1.0 - pd)
        f = g
    return sum(f[s][j] for s in (0, 1) for j in range(k))


def miss_markov(m, k, p, lam):
    return miss_chain(m, k, *qr(p, lam))


def miss_k1_markov(m, p, lam):
    """Closed form for k = 1: all m beams dropped = p q^(m-1)."""
    q, _ = qr(p, lam)
    return p * q ** (m - 1)


def min_width(delta, miss, mmax=2000):
    """Smallest m >= 1 with miss(m) <= delta (miss is nonincreasing in m); None if not reached by mmax."""
    tol = delta * (1 + 1e-9)
    for m in range(1, mmax + 1):
        if miss(m) <= tol:
            return m
    return None


def sample_mask(n, p, lam, rng):
    """n beams from the stationary chain; True = dropped."""
    q, r = qr(p, lam)
    out, s = [], rng.random() < p
    for _ in range(n):
        out.append(s)
        s = rng.random() < (q if s else r)
    return out


def fit_chain(mask):
    """MLE (q_hat, r_hat) from transition counts; None if a state is never visited before the end."""
    dd = d = rd = rr = 0
    for a, b in zip(mask, mask[1:]):
        if a:
            d += 1
            dd += b
        else:
            rr += 1
            rd += b
    if d == 0 or rr == 0:
        return None
    return dd / d, rd / rr


def inflated_p(m0, k, lam, p, tol=1e-12):
    """i.i.d. drop rate p' whose miss probability at width m0 matches the real chain's (a one-width calibration)."""
    target = miss_markov(m0, k, p, lam)
    lo, hi = 0.0, 1.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if miss_iid(m0, k, mid) < target:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def scan_miss_mc(n_scans, beams, m, k, p, lam, rng):
    """Monte Carlo check: full scans of `beams` beams, obstacle at a uniformly random offset."""
    miss = 0
    for _ in range(n_scans):
        mask = sample_mask(beams, p, lam, rng)
        o = rng.randrange(beams - m + 1)
        if sum(1 for b in mask[o:o + m] if not b) < k:
            miss += 1
    return miss / n_scans
