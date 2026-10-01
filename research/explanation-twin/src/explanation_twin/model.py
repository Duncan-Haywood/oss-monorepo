"""A planner picks one of K plans by the sample-mean cost of n twin rollouts per plan and then *explains* the choice by
quoting that same simulated cost ("I chose plan k because it costs m in simulation, beating the runner-up by g").
Plan k has true (twin-population) mean cost mu_k; a rollout has sd sigma, so a plan's sample mean is N(mu_k, s^2) with
s = sigma/sqrt(n).  Everything below is exact for Gaussian sample means, computed by quadrature on a fine grid."""
import math, random

__all__ = ["Phi", "phi", "emax", "pick_and_quote", "k2_quote_bias", "folded_mean", "gap_quote_mean", "model_error_bias",
           "simulate_select", "coverage_naive_fresh"]

SQ2PI = math.sqrt(2.0 * math.pi)


def Phi(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def phi(x):
    return math.exp(-0.5 * x * x) / SQ2PI


def _grid(lo, hi, n=4001):
    h = (hi - lo) / (n - 1)
    return [lo + i * h for i in range(n)], h


def pick_and_quote(mus, s):
    """Exact (P(pick k), E[quoted cost], E[true mean of picked plan]) when the planner takes the argmin of independent
    N(mu_k, s^2) sample means and quotes the winning sample mean.  f_min(x) = sum_k phi_k(x) prod_{j!=k}(1-Phi_j(x))."""
    lo, hi = min(mus) - 9 * s, max(mus) + 9 * s
    xs, h = _grid(lo, hi)
    K = len(mus)
    pk = [0.0] * K
    eq = 0.0
    for x in xs:
        sf = [1.0 - Phi((x - m) / s) for m in mus]
        for k in range(K):
            p = 1.0
            for j in range(K):
                if j != k:
                    p *= sf[j]
            dens = phi((x - mus[k]) / s) / s * p
            pk[k] += dens * h
            eq += x * dens * h
    return pk, eq, sum(m * p for m, p in zip(mus, pk))


def emax(K):
    """E[max of K iid N(0,1)] = K * int x phi(x) Phi(x)^(K-1) dx  (0.5642 for K=2, 1.1630 for K=5)."""
    xs, h = _grid(-10.0, 10.0)
    return K * sum(x * phi(x) * Phi(x) ** (K - 1) * h for x in xs)


def k2_quote_bias(d, s):
    """Two plans with true means 0 and d>=0, sample-mean sd s each.  Closed form for E[quoted] - E[true mean of picked]:
    E[min] = -theta*phi(d/theta) + d*Phi(-d/theta), theta = s*sqrt(2); E[true of picked] = d*Phi(-d/theta)."""
    th = s * math.sqrt(2.0)
    return -th * phi(d / th)


def folded_mean(m, th):
    """E|N(m, th^2)|."""
    return th * math.sqrt(2.0 / math.pi) * math.exp(-m * m / (2 * th * th)) + m * (1.0 - 2.0 * Phi(-m / th))


def gap_quote_mean(d, s):
    """Two plans, true gap d>=0; the explanation quotes 'winner beats runner-up by |X1-X2|'.  Its mean, sd of diff th=s*sqrt2."""
    return folded_mean(d, s * math.sqrt(2.0))


def model_error_bias(K, tau, s):
    """Equal true real costs; the twin's cost of plan k is off by b_k ~ N(0, tau^2), fixed (more rollouts do not shrink it),
    and the planner selects on twin mean + rollout noise of sd s.  The twin cost quoted by a FRESH set of rollouts is
    unbiased for the twin cost (mu_k + b_k) of the picked plan, so quoted - real = b_k^ has mean -e_K tau^2/sqrt(tau^2+s^2)."""
    return -emax(K) * tau * tau / math.sqrt(tau * tau + s * s)


def simulate_select(mus, sigma, n, reps, rng, n1=None, tau=0.0):
    """Monte-Carlo of the planner with Gaussian sample means.  n1 rollouts select (default: all n, the naive planner that
    quotes its selection data); n-n1 fresh rollouts report.  tau>0 adds a fixed twin-model error b_k~N(0,tau^2) per plan
    per rep to the twin's plan costs (real cost of plan k is mus[k]).
    Returns dict: mean quoted-minus-real bias, mean regret vs best plan, share picking the best."""
    K = len(mus)
    best = min(range(K), key=lambda k: mus[k])
    n1 = n if n1 is None else n1
    n2 = n - n1
    bias = regret = hit = 0.0
    for _ in range(reps):
        b = [rng.gauss(0.0, tau) if tau else 0.0 for _ in range(K)]
        sel = [mus[k] + b[k] + rng.gauss(0.0, sigma / math.sqrt(n1)) for k in range(K)]
        k = min(range(K), key=lambda i: sel[i])
        quoted = sel[k] if n2 == 0 else mus[k] + b[k] + rng.gauss(0.0, sigma / math.sqrt(n2))
        bias += quoted - mus[k]
        regret += mus[k] - mus[best]
        hit += (k == best)
    return {"bias": bias / reps, "regret": regret / reps, "hit": hit / reps}


def coverage_naive_fresh(mus, sigma, n, reps, rng, z=1.959964):
    """Coverage of the picked plan's true mean by quoted +- z*sigma/sqrt(n): naive (quote selection data) vs fresh
    (independent n rollouts of the picked plan)."""
    K = len(mus)
    s = sigma / math.sqrt(n)
    cn = cf = 0
    for _ in range(reps):
        sel = [rng.gauss(m, s) for m in mus]
        k = min(range(K), key=lambda i: sel[i])
        cn += abs(sel[k] - mus[k]) <= z * s
        cf += abs(rng.gauss(mus[k], s) - mus[k]) <= z * s
    return cn / reps, cf / reps
