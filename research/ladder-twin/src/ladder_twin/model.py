"""A ladder of twin fidelities.  Real world: decay rate lam ~ U(A,B) (e.g. an unknown drag/friction coefficient),
state x' = -lam x, x(0)=1, horizon T=1, true terminal state exp(-lam).  Twin level l integrates with explicit
Euler and n_l = 2^(l+1) fixed steps: f_l(lam) = (1 - lam/n_l)^n_l, at cost n_l steps.  Coupled pair (l, l-1) shares
lam (common random numbers) and costs n_l + n_{l-1}.  Two quantities of interest: the smooth terminal state
f_l, and the failure indicator 1{x_T > c} = 1{lam < lam_c(n)} with lam_c(n) = n(1 - c^(1/n)) (exact, closed form)."""
import math, random

__all__ = ["A", "B", "steps", "cost", "f", "f_true", "mean_f", "lam_crit", "true_lam_crit", "SmoothQoI",
           "IndicatorQoI", "allocate", "mlmc_cost", "single_level_cost", "run_mlmc", "run_single", "fit_rate"]

A, B = 1.0, 3.0


def steps(l):
    return 2 ** (l + 1)


def cost(l):
    """Steps for one coupled sample at level l (level 0 has no coarse partner)."""
    return steps(l) if l == 0 else steps(l) + steps(l - 1)


def f(lam, l):
    n = steps(l)
    return (1.0 - lam / n) ** n


def f_true(lam):
    return math.exp(-lam)


def mean_f(l):
    """Exact E[f_l] for lam~U(A,B): integral of (1-lam/n)^n."""
    n = steps(l)
    F = lambda t: -((1.0 - t / n) ** (n + 1)) * n / (n + 1)
    return (F(B) - F(A)) / (B - A)


def lam_crit(n, c):
    return n * (1.0 - c ** (1.0 / n))


def true_lam_crit(c):
    return -math.log(c)


def _simpson(g, a, b, m=4000):
    h = (b - a) / m
    s = g(a) + g(b)
    for i in range(1, m):
        s += g(a + i * h) * (4 if i % 2 else 2)
    return s * h / 3.0


class SmoothQoI:
    """Terminal state.  Exact bias and level variances by quadrature of a smooth integrand."""
    name = "smooth"

    def truth(self):
        return (math.exp(-A) - math.exp(-B)) / (B - A)

    def level_mean(self, l):
        return mean_f(l)

    def bias(self, l):
        return self.level_mean(l) - self.truth()

    def level_var(self, l):
        if l == 0:
            m = self.level_mean(0)
            m2 = _simpson(lambda x: f(x, 0) ** 2, A, B) / (B - A)
            return m2 - m * m
        d = lambda x: f(x, l) - f(x, l - 1)
        m = _simpson(d, A, B) / (B - A)
        m2 = _simpson(lambda x: d(x) ** 2, A, B) / (B - A)
        return m2 - m * m

    def sample(self, l, rng):
        lam = rng.uniform(A, B)
        return f(lam, 0) if l == 0 else f(lam, l) - f(lam, l - 1)


class IndicatorQoI:
    """Failure probability P(x_T > c): level mean and level variance in closed form (0/1 values)."""
    name = "failure"

    def __init__(self, c):
        self.c = c

    def _p(self, n):
        return min(1.0, max(0.0, (lam_crit(n, self.c) - A) / (B - A)))

    def truth(self):
        return min(1.0, max(0.0, (true_lam_crit(self.c) - A) / (B - A)))

    def level_mean(self, l):
        return self._p(steps(l))

    def bias(self, l):
        return self.level_mean(l) - self.truth()

    def level_var(self, l):
        if l == 0:
            p = self._p(steps(0))
            return p * (1 - p)
        p1, p0 = self._p(steps(l)), self._p(steps(l - 1))
        dis = abs(p1 - p0)              # P(disagree); the difference is in {-1,0,1} with one sign
        return dis - (p1 - p0) ** 2

    def sample(self, l, rng):
        lam = rng.uniform(A, B)
        ind = lambda n: 1.0 if lam < lam_crit(n, self.c) else 0.0
        return ind(steps(0)) if l == 0 else ind(steps(l)) - ind(steps(l - 1))


def fit_rate(xs):
    """Slope of log2 of successive ratios: x_l ~ 2^(-r l) -> returns r from last two entries."""
    return -math.log2(xs[-1] / xs[-2])


def allocate(qoi, L, eps):
    """Optimal N_l minimising sum N_l C_l subject to sum V_l/N_l <= eps^2/2 (continuous, then ceil)."""
    V = [qoi.level_var(l) for l in range(L + 1)]
    C = [cost(l) for l in range(L + 1)]
    S = sum(math.sqrt(v * c) for v, c in zip(V, C))
    return [max(1, math.ceil(2.0 / eps ** 2 * math.sqrt(v / c) * S)) if v > 0 else 1 for v, c in zip(V, C)]


def _min_level(qoi, eps, Lmax=30):
    for L in range(Lmax + 1):
        if abs(qoi.bias(L)) <= eps / math.sqrt(2.0):
            return L
    return None


def mlmc_cost(qoi, eps):
    """(L, N_l, total step cost) for RMSE target eps, bias <= eps/sqrt2 and variance <= eps^2/2."""
    L = _min_level(qoi, eps)
    if L is None:
        return None
    N = allocate(qoi, L, eps)
    return L, N, sum(n * cost(l) for l, n in enumerate(N))


def single_level_cost(qoi, eps):
    """Cheapest single fixed-step twin meeting the same target: the smallest level with bias <= eps/sqrt2, run
    N = 2 Var(f_L)/eps^2 times at n_L steps each."""
    L = _min_level(qoi, eps)
    if L is None:
        return None
    if isinstance(qoi, IndicatorQoI):
        p = qoi.level_mean(L)
        var = p * (1 - p)
    else:
        var = qoi.level_var(0) if L == 0 else _var_f(L)
    N = math.ceil(2.0 * var / eps ** 2)
    return L, N, N * steps(L)


def _var_f(l):
    m = mean_f(l)
    return _simpson(lambda x: f(x, l) ** 2, A, B) / (B - A) - m * m


def run_mlmc(qoi, L, N, rng):
    return sum(sum(qoi.sample(l, rng) for _ in range(n)) / n for l, n in enumerate(N))


def run_single(qoi, L, N, rng):
    tot = 0.0
    for _ in range(N):
        lam = rng.uniform(A, B)
        if isinstance(qoi, IndicatorQoI):
            tot += 1.0 if lam < lam_crit(steps(L), qoi.c) else 0.0
        else:
            tot += f(lam, L)
    return tot / N
