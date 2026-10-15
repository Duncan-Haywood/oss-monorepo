"""Three ways to decide a two-arm prompt experiment, and a simulator for their error rates.

Arms A (champion) and B (candidate) produce one outcome per run. Runs arrive in pairs (one per
arm) so the arms stay balanced. After each pair a test may stop the experiment.

- fixed:  a z-test of the difference in means, looked at once, after n_max pairs.
- peek:   the same z-test looked at after every pair (the "just check the dashboard" policy).
- msprt:  a mixture sequential probability ratio test with a normal prior N(0, tau^2) on the
          difference (Robbins 1970; Johari et al. 2017). Rejects when the mixture likelihood
          ratio reaches 1/alpha; by Ville's inequality, under an exact normal model with known
          variance, the chance it ever rejects a true null is at most alpha, however often
          it is looked at. Here the variance is estimated and the data are not normal, so the
          guarantee is only approximate; `simulate` measures how close it is.
"""
import math, random


def z_threshold(alpha):
    """Two-sided normal critical value, by bisection on erfc (no scipy)."""
    lo, hi = 0.0, 10.0
    for _ in range(80):
        mid = (lo + hi) / 2
        if math.erfc(mid / math.sqrt(2)) > alpha:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def _var(sum_, sumsq, n, floor):
    """Sample variance of the running sums, floored (early binary data can have variance 0)."""
    if n < 2:
        return floor
    m = sum_ / n
    return max((sumsq - n * m * m) / (n - 1), floor)


def msprt_log_lr(diff, n, sigma2, tau2):
    """Log mixture likelihood ratio for a mean difference `diff` after n pairs.

    diff ~ N(theta, V) with V = 2 sigma2 / n under the normal model; prior theta ~ N(0, tau2).
    """
    v = 2.0 * sigma2 / n
    return 0.5 * math.log(v / (v + tau2)) + tau2 * diff * diff / (2.0 * v * (v + tau2))


def run_experiment(draw_a, draw_b, n_max, alpha, tau2, var_floor, rng, min_n=10):
    """Run one experiment for all three rules at once on the same stream of pairs.

    Returns {rule: (rejected, stop_n)}. peek and msprt stop at their first rejection; fixed
    looks only at n_max. `min_n` pairs must be seen before any early look (a variance estimate
    from two points is meaningless).
    """
    zc = z_threshold(alpha)
    log_thresh = math.log(1.0 / alpha)
    sa = sqa = sb = sqb = 0.0
    out = {"peek": (False, n_max), "msprt": (False, n_max)}
    for n in range(1, n_max + 1):
        a, b = draw_a(rng), draw_b(rng)
        sa += a; sqa += a * a; sb += b; sqb += b * b
        if n < min_n and n < n_max:
            continue
        va = _var(sa, sqa, n, var_floor)
        vb = _var(sb, sqb, n, var_floor)
        diff = (sb - sa) / n
        se = math.sqrt((va + vb) / n)
        if not out["peek"][0] and se > 0 and abs(diff) / se >= zc:
            out["peek"] = (True, n)
        if not out["msprt"][0]:
            if msprt_log_lr(diff, n, (va + vb) / 2.0, tau2) >= log_thresh:
                out["msprt"] = (True, n)
        if n == n_max:
            fixed = se > 0 and abs(diff) / se >= zc
            out["fixed"] = (fixed, n_max)
    return out


def simulate(draw_a, draw_b, n_max, alpha, tau2, var_floor, n_sims, seed):
    """Rejection rate and mean stopping time per rule over n_sims independent experiments."""
    rng = random.Random(seed)
    rej = {"fixed": 0, "peek": 0, "msprt": 0}
    stop = {"fixed": 0, "peek": 0, "msprt": 0}
    for _ in range(n_sims):
        res = run_experiment(draw_a, draw_b, n_max, alpha, tau2, var_floor, rng)
        for k, (r, n) in res.items():
            rej[k] += r; stop[k] += n
    return {k: (rej[k] / n_sims, stop[k] / n_sims) for k in rej}


def wilson(k, n, z=1.959964):
    """Wilson score interval for a proportion."""
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)


def fixed_n_pairs(sigma2, delta, alpha=0.05, power=0.8):
    """Pairs per arm for a two-sided z-test to detect a mean difference `delta` (normal approx)."""
    za = z_threshold(alpha)
    zb = z_threshold(2 * (1 - power))  # one-sided power point
    return math.ceil(2 * sigma2 * (za + zb) ** 2 / delta ** 2)
