"""Rollout sharing in a decentralised RL swarm as a public-goods game.

N agents; agent i generates x_i >= 0 rollouts at cost c_i each and every rollout is shared with all peers.  A peer's
rollout is worth theta in [0,1] of an own rollout (off-policy / diversity discount).  Agent i learns from
y_i = x_i + theta * sum_{j != i} x_j  and values it a_i * ln(1 + y_i)  (diminishing returns).  Payoff:
u_i = a_i ln(1 + y_i) - c_i x_i.  Facts checked here:
  * Nash (symmetric): y = a/c - 1 whatever N, so x = (a/c - 1)/k with k = 1 + theta (N-1): total effort does not grow with
    the swarm and every agent learns exactly as much as a lone agent would;
  * efficient (symmetric): x = a/c - 1/k, y = k a/c - 1;
  * theta = 1 with heterogeneous agents: only the agent with the largest a_i/c_i generates (Bergstrom-Blume-Varian);
  * a per-rollout matching subsidy tau_i = theta * sum_{j != i} a_j/(1+y_j) at the efficient point implements it; in the
    symmetric case tau/c = theta (N-1)/k < 1;
  * fraud: a junk rollout costs eps < c; with audit prob p per claimed rollout, forfeiture of tau and fine F, junk beats
    honesty iff c - eps > p (tau + F).
"""
import math, random

__all__ = ["payoffs", "best_response", "nash", "efficient", "welfare", "sym_nash", "sym_efficient", "sym_welfare",
           "subsidy", "nash_with_subsidy", "min_audit_rate", "fraud_payoff_mc"]


def _y(x, theta):
    X = sum(x)
    return [xi + theta * (X - xi) for xi in x]


def payoffs(x, a, c, theta, tau=None):
    y = _y(x, theta)
    return [a[i] * math.log1p(y[i]) - (c[i] - (tau[i] if tau else 0.0)) * x[i] for i in range(len(x))]


def welfare(x, a, c, theta):
    """Sum of payoffs at true cost (subsidies are transfers and net out)."""
    return sum(payoffs(x, a, c, theta))


def best_response(i, x, a, c, theta, tau=None):
    """argmax over x_i >= 0 of u_i given the others (closed form)."""
    others = sum(x) - x[i]
    price = c[i] - (tau[i] if tau else 0.0)
    if price <= 0:
        raise ValueError("non-positive net price: unbounded")
    y_star = a[i] / price - 1.0
    return max(0.0, y_star - theta * others)


def nash(a, c, theta, tau=None, iters=20000, tol=1e-13):
    """Gauss-Seidel best-response iteration (converges: concave aggregative game)."""
    x = [0.0] * len(a)
    for _ in range(iters):
        d = 0.0
        for i in range(len(a)):
            new = best_response(i, x, a, c, theta, tau)
            d = max(d, abs(new - x[i]))
            x[i] = new
        if d < tol:
            break
    return x


def _solve(A, b):
    n = len(b)
    M = [row[:] + [b[r]] for r, row in enumerate(A)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(M[r][col]))
        M[col], M[piv] = M[piv], M[col]
        for r in range(n):
            if r != col:
                f = M[r][col] / M[col][col]
                for cc in range(col, n + 1):
                    M[r][cc] -= f * M[col][cc]
    return [M[r][n] / M[r][r] for r in range(n)]


def efficient(a, c, theta, iters=500, tol=1e-12):
    """Maximise total welfare (concave) by projected Newton with an active set and Armijo backtracking."""
    N = len(a)
    w = lambda i, k: 1.0 if i == k else theta
    x = [0.5] * N
    for _ in range(iters):
        y = _y(x, theta)
        g = [sum(a[i] * w(i, k) / (1 + y[i]) for i in range(N)) - c[k] for k in range(N)]
        act = [x[k] <= 1e-10 and g[k] <= 0 for k in range(N)]
        free = [k for k in range(N) if not act[k]]
        if not free or max(abs(g[k]) for k in free) < tol:
            break
        H = [[sum(a[i] * w(i, k) * w(i, l) / (1 + y[i]) ** 2 for i in range(N)) for l in free] for k in free]
        for r in range(len(free)):
            H[r][r] += 1e-9  # theta=1 makes welfare depend on total effort only: singular Hessian
        d = _solve(H, [g[k] for k in free])  # ascent direction H^{-1} g (H is -Hessian, positive definite)
        f0 = welfare(x, a, c, theta)
        t = 1.0
        while t > 1e-14:
            z = list(x)
            for idx, k in enumerate(free):
                z[k] = max(0.0, x[k] + t * d[idx])
            if welfare(z, a, c, theta) >= f0 + 1e-4 * sum(g[k] * (z[k] - x[k]) for k in free):
                break
            t /= 2
        x = z
    return x


def subsidy(x, a, theta):
    """Pigouvian per-rollout subsidy: marginal value the rollout confers on the others."""
    y = _y(x, theta)
    return [theta * sum(a[j] / (1 + y[j]) for j in range(len(x)) if j != i) for i in range(len(x))]


def nash_with_subsidy(a, c, theta):
    """Nash play under the Pigouvian subsidy evaluated at the efficient allocation; returns (x, tau)."""
    tau = subsidy(efficient(a, c, theta), a, theta)
    return nash(a, c, theta, tau), tau


# symmetric closed forms (per agent, a/c > 1 for Nash to be positive)
def _k(N, theta): return 1 + theta * (N - 1)
def sym_nash(N, a, c, theta): return max(0.0, a / c - 1) / _k(N, theta)
def sym_efficient(N, a, c, theta): return max(0.0, a / c - 1 / _k(N, theta))


def sym_welfare(N, a, c, theta, x):
    return N * (a * math.log1p(_k(N, theta) * x) - c * x)


def min_audit_rate(c, eps, tau, F):
    """Smallest per-claim audit probability making honesty beat junk: p (tau + F) >= c - eps."""
    return min(1.0, max(0.0, (c - eps) / (tau + F)))


def fraud_payoff_mc(c, eps, tau, F, p, n=200000, seed=0):
    """Monte-Carlo mean payoff per rollout of (honest, junk); expected (tau - c, (1-p) tau - p F - eps)."""
    rng = random.Random(seed)
    junk = 0.0
    for _ in range(n):
        junk += (-F if rng.random() < p else tau) - eps
    return tau - c, junk / n
