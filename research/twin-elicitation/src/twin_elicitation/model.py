"""Eliciting a digital twin by its decision value. Scalar LQ plant x' = a x + b u + w with a known and the input gain b uncertain.
A twin provider holds a posterior over b (nodes/weights) and reports either a point estimate bh (then the controller trained on
the twin, the Riccati gain k*(bh), is deployed) or a gain directly; it is paid the negative deployed cost, optionally capped."""
import math

__all__ = ["cost", "optimal_gain", "regret", "truncnorm", "uniform", "expected_cost", "bayes_gain", "decision_estimate",
           "ce_excess", "small_var_shift", "cost_bb", "info_value", "capped_cost", "cap_threshold"]


def cost(a, b, k, q=1.0, r=0.1, s2=1.0):
    c = a - b * k
    return math.inf if abs(c) >= 1 else s2 * (q + r * k * k) / (1 - c * c)


def optimal_gain(a, b, q=1.0, r=0.1):
    B = r * (1 - a * a) - q * b * b
    p = (-B + math.sqrt(B * B + 4 * b * b * q * r)) / (2 * b * b)
    return a * b * p / (r + b * b * p)


def regret(a, b, k, q=1.0, r=0.1, s2=1.0):
    return cost(a, b, k, q, r, s2) - cost(a, b, optimal_gain(a, b, q, r), q, r, s2)


def capped_cost(a, b, k, cap=math.inf, q=1.0, r=0.1, s2=1.0):
    """Payment-capped deployed cost: min(J, cap); the cap removes the cliff's infinite penalty."""
    return min(cost(a, b, k, q, r, s2), cap)


def _gl(n):
    xs, ws = [], []
    for i in range(1, n + 1):
        x = math.cos(math.pi * (i - 0.25) / (n + 0.5))
        for _ in range(100):
            p0, p1 = 1.0, x
            for j in range(2, n + 1):
                p0, p1 = p1, ((2 * j - 1) * x * p1 - (j - 1) * p0) / j
            dp = n * (x * p1 - p0) / (x * x - 1)
            dx = p1 / dp
            x -= dx
            if abs(dx) < 1e-15:
                break
        xs.append(x); ws.append(2 / ((1 - x * x) * dp * dp))
    return xs, ws


def _grid(lo, hi, dens, n):
    """Midpoint nodes on [lo, hi] weighted by an unnormalised density, normalised to sum 1 (capped costs have kinks, so no GL)."""
    h = (hi - lo) / n
    bs = [lo + (i + 0.5) * h for i in range(n)]
    ws = [dens(b) for b in bs]
    s = sum(ws)
    return bs, [w / s for w in ws]


def truncnorm(mu, tau, z=3.0, n=1500):
    """Posterior N(mu, tau^2) truncated to mu +- z tau (must stay positive)."""
    return _grid(mu - z * tau, mu + z * tau, lambda b: math.exp(-0.5 * ((b - mu) / tau) ** 2), n)


def uniform(mu, half, n=1500):
    return _grid(mu - half, mu + half, lambda b: 1.0, n)


def expected_cost(a, post, k, cap=math.inf, q=1.0, r=0.1, s2=1.0):
    bs, ws = post
    return sum(w * capped_cost(a, b, k, cap, q, r, s2) for b, w in zip(bs, ws))


def _golden(f, lo, hi, it=70):
    g = (math.sqrt(5) - 1) / 2
    c, d = hi - g * (hi - lo), lo + g * (hi - lo)
    fc, fd = f(c), f(d)
    for _ in range(it):
        if fc < fd:
            hi, d, fd = d, c, fc
            c = hi - g * (hi - lo); fc = f(c)
        else:
            lo, c, fc = c, d, fd
            d = lo + g * (hi - lo); fd = f(d)
    return (lo + hi) / 2


def bayes_gain(a, post, cap=math.inf, q=1.0, r=0.1, s2=1.0):
    """argmin_k E_post min(J_b(k), cap): the gain a provider paid by (capped) deployed cost reports. The capped objective is not
    convex (the cap turns the cliff into a finite step), so scan a grid over [0, min(3, stable limit)] then refine. Uncapped: the
    expected cost is +inf past the stable set k < (1+a)/max b, so the search stops there."""
    hi = (1 + a) / max(post[0]) * (1 - 1e-9) if math.isinf(cap) else 3.0
    f = lambda k: expected_cost(a, post, k, cap, q, r, s2)
    n = 300
    ks = [hi * i / n for i in range(n + 1)]
    i = min(range(n + 1), key=lambda j: f(ks[j]))
    return _golden(f, ks[max(i - 1, 0)], ks[min(i + 1, n)], 60)


def decision_estimate(a, k, q=1.0, r=0.1):
    """The twin parameter bh whose Riccati gain equals k: what a cost-paid provider reports when it must state a parameter.
    k*(b) is decreasing for b >= 0.3 at the default costs (the operating region), so bisect on [0.3, 3]."""
    lo, hi = 0.3, 3.0
    f = lambda b: optimal_gain(a, b, q, r) - k
    if f(lo) * f(hi) > 0:
        raise ValueError("gain outside range of k*")
    for _ in range(200):
        m = (lo + hi) / 2
        if f(lo) * f(m) <= 0:
            hi = m
        else:
            lo = m
    return (lo + hi) / 2


def ce_excess(a, post, q=1.0, r=0.1, s2=1.0):
    """Extra expected cost of deploying the certainty-equivalent gain k*(E b) instead of the Bayes gain."""
    mean = sum(b * w for b, w in zip(*post))
    return expected_cost(a, post, optimal_gain(a, mean, q, r), math.inf, q, r, s2) - expected_cost(a, post, bayes_gain(a, post, math.inf, q, r, s2), math.inf, q, r, s2)


def _d(f, x, h, order):
    if order == 1:
        return (f(x + h) - f(x - h)) / (2 * h)
    return (f(x + h) - 2 * f(x) + f(x - h)) / (h * h)


def small_var_shift(a, b0, var, q=1.0, r=0.1, s2=1.0, h=1e-3):
    """k_Bayes - k*(b0) = -var J_kbb / (2 J_kk) for small posterior variance (mean b0)."""
    ks = optimal_gain(a, b0, q, r)
    f = lambda k, b: cost(a, b, k, q, r, s2)
    jkk = _d(lambda k: f(k, b0), ks, h, 2)
    jkbb = _d(lambda b: _d(lambda k: f(k, b), ks, h, 1), b0, h, 2)
    return -var * jkbb / (2 * jkk)


def cost_bb(a, b0, q=1.0, r=0.1, s2=1.0, h=1e-3):
    """J_bb at (b0, k*(b0)): curvature of the deployed cost in the twin parameter."""
    ks = optimal_gain(a, b0, q, r)
    return _d(lambda b: cost(a, b, ks, q, r, s2), b0, h, 2)


def info_value(a, b0, tau, q=1.0, r=0.1, s2=1.0):
    """Decision value of resolving posterior sd tau to zero: min_k E J - J_{b0}(k*(b0)), for N(b0,tau^2) truncated at 3 tau."""
    post = truncnorm(b0, tau, 3.0, 800)
    kb = bayes_gain(a, post, math.inf, q, r, s2)
    return expected_cost(a, post, kb, math.inf, q, r, s2) - expected_cost(a, ([b0], [1.0]), optimal_gain(a, b0, q, r), math.inf, q, r, s2)


def cap_threshold(a, b_lo, b_hi, p_hi, q=1.0, r=0.1, s2=1.0):
    """Two-point posterior (b_lo w.p. 1-p_hi, b_hi w.p. p_hi) where the gain k*(b_lo) is unstable at b_hi. A cost-paid provider reports
    k*(b_lo), ignoring the rare plant, iff the payment cap M is below M* = (V - (1-p) J_lo(k*(b_lo))) / p, V the uncapped optimum;
    above M* it snaps to the uncapped (cliff-respecting) gain."""
    post = ([b_lo, b_hi], [1 - p_hi, p_hi])
    v = expected_cost(a, post, bayes_gain(a, post, math.inf, q, r, s2), math.inf, q, r, s2)
    return (v - (1 - p_hi) * cost(a, b_lo, optimal_gain(a, b_lo, q, r), q, r, s2)) / p_hi
