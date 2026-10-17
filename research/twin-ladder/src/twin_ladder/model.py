"""A ladder of digital twins of one real system, used as nested control variates (multifidelity Monte Carlo, Peherstorfer et al. 2016).
Model 0 is the real system (cost c_0, correlation 1 with itself); model i has correlation rho_i with the real return and cost c_i.
Order the models by decreasing correlation, rho_{k+1} = 0, a_i = rho_i^2 - rho_{i+1}^2.  With m_0 <= m_1 <= ... <= m_k episodes of each,
  Var = sigma_R^2 * sum_i a_i / m_i          (exact for any distribution: it only uses second moments),
and under budget C = sum c_i m_i the optimum is  m_i = C sqrt(a_i/c_i) / S,  Var* = sigma_R^2 S^2 / C,  S = sum_j sqrt(a_j c_j).
Feasibility (m nondecreasing) needs a_i/c_i nondecreasing along the ladder."""
import itertools, math, random

__all__ = ["rho_star", "ladder_var", "ladder_alloc", "feasible", "best_ladder", "rung_pays", "rung_gain", "chain_rhos",
           "sample_chain", "mfmc_estimate", "int_var"]


def rho_star(r):
    """Smallest correlation for which a twin costing r times its parent pays: 2 sqrt(r)/(1+r)."""
    return 2 * math.sqrt(r) / (1 + r)


def _terms(rhos, costs):
    """rhos[0]=1 (real) then twins in decreasing correlation; returns (a_i, c_i)."""
    r2 = [x * x for x in rhos] + [0.0]
    return [r2[i] - r2[i + 1] for i in range(len(rhos))], list(costs)


def ladder_var(rhos, costs, C=1.0):
    """Optimal variance (units of sigma_R^2) with budget C for the ladder (rhos[0]=1, decreasing).  Ignores feasibility."""
    a, c = _terms(rhos, costs)
    return sum(math.sqrt(x * y) for x, y in zip(a, c)) ** 2 / C


def ladder_alloc(rhos, costs, C=1.0):
    a, c = _terms(rhos, costs)
    S = sum(math.sqrt(x * y) for x, y in zip(a, c))
    return [C * math.sqrt(x / y) / S for x, y in zip(a, c)]


def feasible(rhos, costs):
    """Optimal m_i nondecreasing (every retained rung really is sampled at least as often as its parent) and rho strictly decreasing."""
    if any(rhos[i + 1] >= rhos[i] for i in range(len(rhos) - 1)):
        return False
    a, c = _terms(rhos, costs)
    q = [x / y for x, y in zip(a, c)]
    return all(q[i + 1] >= q[i] - 1e-15 for i in range(len(q) - 1))


def best_ladder(twins, c0, C=1.0):
    """twins = [(rho, cost), ...].  Best feasible subset (brute force, k <= ~12).  Returns (variance, chosen indices sorted by rho desc)."""
    order = sorted(range(len(twins)), key=lambda i: -twins[i][0])
    best = (1.0 * c0 / C, ())
    for k in range(1, len(twins) + 1):
        for sub in itertools.combinations(order, k):
            rhos = [1.0] + [twins[i][0] for i in sub]
            costs = [c0] + [twins[i][1] for i in sub]
            if feasible(rhos, costs):
                v = ladder_var(rhos, costs, C)
                if v < best[0] - 1e-15:
                    best = (v, sub)
    return best


def rung_pays(rho1, rho2, c1, c2):
    """Does appending a cheaper, less correlated twin 2 below twin 1 (both already correlated rho1, rho2 with the real return) cut the
    variance?  Yes iff rho2/rho1 > rho*(c2/c1): the same test as a single twin against reality, with the step correlation."""
    return rho2 / rho1 > rho_star(c2 / c1)


def rung_gain(rho1, rho2, c1, c2, c0=1.0):
    """Relative variance change from appending twin 2 (unconstrained formula): Var(with) / Var(without) - 1."""
    return ladder_var([1.0, rho1, rho2], [c0, c1, c2]) / ladder_var([1.0, rho1], [c0, c1]) - 1.0


def chain_rhos(step_corr):
    """Markov chain of fidelity levels: corr(level j, level j+1) = step_corr[j]; correlation with the real level is the running product."""
    out, p = [], 1.0
    for q in step_corr:
        p *= q
        out.append(p)
    return out


# --- simulation of the actual estimator -------------------------------------------------------------------------------------
def sample_chain(n, mus, rhos, rng):
    """n joint draws of (real, twin_1, ..., twin_k) unit-variance Gaussians with means mus and corr(real, twin_i) = rhos[i] along a
    Markov chain (rhos are cumulative products of step correlations, decreasing)."""
    steps = [rhos[0]] + [rhos[i] / rhos[i - 1] for i in range(1, len(rhos))]
    rows = []
    for _ in range(n):
        z = rng.gauss(0, 1)
        row = [mus[0] + z]
        for j, q in enumerate(steps):
            z = q * z + math.sqrt(1 - q * q) * rng.gauss(0, 1)
            row.append(mus[j + 1] + z)
        rows.append(row)
    return rows


def int_var(rhos, ms):
    """Exact variance (units of sigma_R^2) of the estimator with integer sample sizes ms (nondecreasing)."""
    a, _ = _terms(rhos, [1] * len(rhos))
    return sum(x / m for x, m in zip(a, ms))


def mfmc_estimate(rows, ms, alphas):
    """Nested MFMC estimator.  rows[t][i] = model i on context t; model i is evaluated on the first ms[i] contexts (ms nondecreasing).
    Y = mean_{m0}(R) + sum_i alpha_i (mean_{m_i}(T_i) - mean_{m_{i-1}}(T_i))."""
    y = sum(rows[t][0] for t in range(ms[0])) / ms[0]
    for i in range(1, len(ms)):
        hi = sum(rows[t][i] for t in range(ms[i])) / ms[i]
        lo = sum(rows[t][i] for t in range(ms[i - 1])) / ms[i - 1]
        y += alphas[i - 1] * (hi - lo)
    return y
