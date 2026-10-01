"""Multi-task peer prediction (Dasgupta-Ghosh style bonus-penalty agreement) when lazy verifiers share a default.
Binary task, Y~Bern(p). Verifier i works w.p. a_i and reports Y; otherwise reports a per-task default D~Bern(d),
independent of Y and common to all lazy verifiers (e.g. the same public model's guess). q=1-p, s=d(1-d)."""
import random

__all__ = ["cov", "pay", "effort_gain", "threshold", "lazy_pay", "honest_pay", "gold_rate", "gold_effort_gain",
          "simulate_pay", "best_response_path", "mean_field_threshold", "default_accuracy"]


def cov(ai, aj, p, d):
    """Cov(X_i, X_j) of the two reports."""
    return ai * aj * p * (1 - p) + (1 - ai) * (1 - aj) * d * (1 - d)


def pay(ai, aj, p, d, G=1.0):
    """Expected bonus-penalty payment G*(1{X_i=X_j on task t} - 1{X_i=X_j on independent tasks}) = 2 G Cov."""
    return 2 * G * cov(ai, aj, p, d)


def effort_gain(aj, p, d, G, k):
    """Coefficient of a_i in i's expected utility (pay linear in a_i, effort cost k*a_i)."""
    return 2 * G * (aj * p * (1 - p) - (1 - aj) * d * (1 - d)) - k


def threshold(p, d, G, k):
    """Partner effort level a* above which working is a best response; >1 means effort is never worth it."""
    s = d * (1 - d)
    return (k / (2 * G) + s) / (p * (1 - p) + s)


def lazy_pay(p, d, G=1.0):
    """Payment per verifier at the all-lazy equilibrium (a=0): 2 G d(1-d)."""
    return 2 * G * d * (1 - d)


def honest_pay(p, G=1.0):
    return 2 * G * p * (1 - p)


def default_accuracy(p, d):
    return p * d + (1 - p) * (1 - d)


def gold_rate(p, d, G, k, R=1.0):
    """Smallest gold-check fraction g (paid R for a report matching the truth) making effort dominant even if the
    partner is fully lazy: g R (1 - acc_D) >= 2 G s + k."""
    return (2 * G * d * (1 - d) + k) / (R * (1 - default_accuracy(p, d)))


def gold_effort_gain(aj, p, d, G, k, g, R=1.0):
    return effort_gain(aj, p, d, G, k) + g * R * (1 - default_accuracy(p, d))


def mean_field_threshold(p, d, G, k, n):
    """With n verifiers paid against one uniformly random peer, i's coefficient depends on the mean of the others'
    efforts; the symmetric interior equilibrium is the same a* for every n."""
    return threshold(p, d, G, k)


def simulate_pay(ai, aj, p, d, tasks, seed=0):
    """Monte Carlo of the actual payment: agreement on the same task minus agreement across shuffled tasks."""
    rng = random.Random(seed)
    xi, xj = [], []
    for _ in range(tasks):
        y = rng.random() < p
        dd = rng.random() < d
        xi.append(y if rng.random() < ai else dd)
        xj.append(y if rng.random() < aj else dd)
    same = sum(a == b for a, b in zip(xi, xj)) / tasks
    perm = xj[1:] + xj[:1]
    cross = sum(a == b for a, b in zip(xi, perm)) / tasks
    return same - cross


def best_response_path(a0, p, d, G, k, steps=60, lr=0.2):
    """Smoothed best-response dynamics of a symmetric population: a <- clip(a + lr*sign-gain)."""
    a = a0
    path = [a]
    for _ in range(steps):
        gain = effort_gain(a, p, d, G, k)
        a = min(1.0, max(0.0, a + lr * gain))
        path.append(a)
    return path
