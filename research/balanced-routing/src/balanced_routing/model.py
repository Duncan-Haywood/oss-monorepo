"""Capacity-constrained soft routing as a congestion-priced market. Stdlib only.

B tokens, N experts, scores s[t][i], temperature tau, capacity fractions c[i] (sum >= 1).
Primal:  max_x  sum x_ti s_ti + tau*sum_t H(x_t)   s.t. sum_i x_ti = 1,  sum_t x_ti <= c_i B.
Dual:    min_{p>=0} D(p) = tau*sum_t logsumexp_i((s_ti - p_i)/tau) + B*sum_i c_i p_i,
with optimal assignment x_ti ∝ exp((s_ti - p_i)/tau): p_i is a per-expert congestion price.
"""
import math, random

__all__ = ["assign", "loads", "dual", "dual_grad", "primal_value", "solve_dual", "certificate",
           "sign_update", "gaussian_scores", "gauss_balance_loss", "audit_samples",
           "hard_loads", "hard_utility"]


def assign(S, p, tau):
    X = []
    for row in S:
        z = [(s - pi) / tau for s, pi in zip(row, p)]
        m = max(z)
        e = [math.exp(v - m) for v in z]
        t = sum(e)
        X.append([v / t for v in e])
    return X


def loads(X):
    n = len(X[0])
    return [sum(r[i] for r in X) for i in range(n)]


def dual(S, p, tau, c):
    tot = 0.0
    for row in S:
        z = [(s - pi) / tau for s, pi in zip(row, p)]
        m = max(z)
        tot += tau * (m + math.log(sum(math.exp(v - m) for v in z)))
    return tot + len(S) * sum(ci * pi for ci, pi in zip(c, p))


def dual_grad(S, p, tau, c):
    L = loads(assign(S, p, tau))
    B = len(S)
    return [B * ci - li for ci, li in zip(c, L)]


def primal_value(S, X, tau):
    v = 0.0
    for row, x in zip(S, X):
        v += sum(a * b for a, b in zip(row, x))
        v -= tau * sum(a * math.log(a) for a in x if a > 0)
    return v


def solve_dual(S, tau, c, iters=20000, tol=1e-9):
    """Projected accelerated gradient on D (smoothness B/(2 tau) -> step 2 tau/B). Returns (p, iters)."""
    B, N = len(S), len(S[0])
    step = 2 * tau / B
    p = [0.0] * N
    y = p[:]
    tk = 1.0
    for k in range(1, iters + 1):
        g = dual_grad(S, y, tau, c)
        pn = [max(0.0, yi - step * gi) for yi, gi in zip(y, g)]
        # projected-gradient residual at pn
        gn = dual_grad(S, pn, tau, c)
        res = max(abs(gi) if pi > 0 else max(0.0, -gi) for gi, pi in zip(gn, pn)) / B
        if res < tol:
            return pn, k
        tn = (1 + math.sqrt(1 + 4 * tk * tk)) / 2
        y = [a + (tk - 1) / tn * (a - b) for a, b in zip(pn, p)]
        p, tk = pn, tn
    return p, iters


def certificate(S, p, tau, c):
    """Verifier's certificate from prices alone: (lower, upper, gap). Upper = D(p) (weak duality);
    lower = primal value of x(p) mixed with the uniform assignment until capacities hold.
    Needs strict slack c_i > 1/N (Slater) so that uniform is strictly feasible."""
    assert all(ci > 1.0 / len(S[0]) for ci in c), "certificate needs c_i > 1/N"
    B, N = len(S), len(S[0])
    X = assign(S, p, tau)
    L = loads(X)
    lam = 0.0
    for li, ci in zip(L, c):
        if li > ci * B + 1e-12:
            lam = max(lam, (li - ci * B) / (li - B / N))
    U = [[1.0 / N] * N for _ in range(B)]
    Xm = [[(1 - lam) * a + lam * u for a, u in zip(r, ur)] for r, ur in zip(X, U)]
    lo = primal_value(S, Xm, tau)
    up = dual(S, p, tau, c)
    return lo, up, up - lo


def sign_update(sample, N, c, gamma, tau, steps, rng, p0=None):
    """Aux-loss-free balancing: p_i += gamma*sign(load_i - target_i), on a fresh minibatch each step.
    `sample(rng)` returns a batch of score rows. Returns the price path and per-step max relative load error."""
    p = list(p0) if p0 else [0.0] * N
    errs = []
    for _ in range(steps):
        S = sample(rng)
        B = len(S)
        L = loads(assign(S, p, tau))
        errs.append(max(li / (B * ci) for li, ci in zip(L, c)) - 1.0)
        p = [pi + gamma * (1 if li > B * ci else -1 if li < B * ci else 0) for pi, li, ci in zip(p, L, c)]
    return p, errs


def gaussian_scores(B, N, rng, means=None, sigma=1.0):
    means = means or [0.0] * N
    return [[rng.gauss(m, sigma) for m in means] for _ in range(B)]


def _phi(x):
    return math.exp(-x * x / 2) / math.sqrt(2 * math.pi)


def _Phi(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def gauss_balance_loss(mu, sigma, q=0.5):
    """Two experts, hard routing, gap d = s1-s2 ~ N(mu, sigma^2); expert 1 must get at most fraction q.
    Unconstrained: pick 1 iff d>0. Constrained (mu>0 case): pick 1 iff d>t with P(d>t)=q.
    Returns (utility_loss, t) where the utility of a rule is E[d 1(pick 1)] (+ const)."""
    def tail_mean(t):
        z = (t - mu) / sigma
        return mu * (1 - _Phi(z)) + sigma * _phi(z)
    lo, hi = mu - 10 * sigma, mu + 10 * sigma
    for _ in range(200):
        m = (lo + hi) / 2
        if 1 - _Phi((m - mu) / sigma) > q:
            lo = m
        else:
            hi = m
    t = (lo + hi) / 2
    t = max(t, 0.0)
    return tail_mean(0.0) - tail_mean(t), t


def hard_loads(S, p):
    N = len(S[0])
    L = [0] * N
    for row in S:
        L[max(range(N), key=lambda i: row[i] - p[i])] += 1
    return L


def hard_utility(S, p):
    """Total raw score when each token goes to argmax_i (s_i - p_i)."""
    return sum(r[max(range(len(r)), key=lambda i: r[i] - p[i])] for r in S)


def audit_samples(N, eps, delta):
    """Tokens a verifier must re-route from (scores, prices) to certify every expert's load fraction
    within eps of the claim with confidence 1-delta (Hoeffding + union bound)."""
    return math.ceil(math.log(2 * N / delta) / (2 * eps * eps))
