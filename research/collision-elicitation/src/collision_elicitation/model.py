"""Collision-probability elicitation. Stdlib only.

An operation returns one of K outputs with distribution p (nondeterminism from
reduction order, hardware, kernels). Gamma_k(p) = sum_i p_i^k is the chance k
independent runs all agree. It is elicited from k runs by paying the report
against the agreement indicator.
"""
import itertools, math, random, struct


def gamma(p, k=2):
    return sum(x ** k for x in p)


# ---- proper pair score ---------------------------------------------------
def pair_score(r, runs):
    """Negative squared error of report r against the all-agree indicator."""
    return -(r - (1.0 if len(set(runs)) == 1 else 0.0)) ** 2


def expected_score(r, p, k=2):
    g = gamma(p, k)
    return -((r - g) ** 2 + g * (1 - g))


def expected_score_enum(r, p, k=2):
    """Same expectation by enumerating all K^k run tuples (checks the closed form)."""
    tot = 0.0
    for tup in itertools.product(range(len(p)), repeat=k):
        pr = 1.0
        for i in tup:
            pr *= p[i]
        tot += pr * pair_score(r, tup)
    return tot


# ---- U-statistic estimator from n runs ------------------------------------
def u_stat(runs):
    n = len(runs)
    counts = {}
    for y in runs:
        counts[y] = counts.get(y, 0) + 1
    return sum(c * (c - 1) for c in counts.values()) / (n * (n - 1))


def disjoint_pairs(runs):
    m = len(runs) // 2
    return sum(runs[2 * i] == runs[2 * i + 1] for i in range(m)) / m


def u_var(p, n):
    """Exact Var of the all-pairs estimator: [4(n-2) z1 + 2 z2] / (n(n-1))."""
    g = gamma(p, 2)
    z1 = gamma(p, 3) - g * g
    z2 = g * (1 - g)
    return (4 * (n - 2) * z1 + 2 * z2) / (n * (n - 1))


def disjoint_var(p, n):
    g = gamma(p, 2)
    return g * (1 - g) / (n // 2)


def u_var_enum(p, n):
    """Exact variance by enumerating all K^n run vectors (tiny K, n)."""
    m1 = m2 = 0.0
    for runs in itertools.product(range(len(p)), repeat=n):
        pr = 1.0
        for i in runs:
            pr *= p[i]
        u = u_stat(runs)
        m1 += pr * u
        m2 += pr * u * u
    return m2 - m1 * m1


# ---- one-sample impossibility --------------------------------------------
def level_set_witness(p, q):
    """Two distributions with equal collision probability plus the mixture midpoint.
    A property elicitable from ONE run has convex level sets; if Gamma(mid) != Gamma(p)
    the level set is not convex, so no single-run score elicits Gamma."""
    mid = [(a + b) / 2 for a, b in zip(p, q)]
    return gamma(p), gamma(q), gamma(mid)


def equal_gamma_pair():
    """p=(.8,.2,0) and q a permuted/rotated spread with the same sum of squares."""
    p = [0.8, 0.2, 0.0]
    q = [0.2, 0.8, 0.0]
    return p, q


# ---- heterogeneous fleet ---------------------------------------------------
def fleet_gamma(pi):
    """Deterministic within a hardware class, classes differ: p = class shares, so
    Gamma = Simpson index sum pi^2; honest replicas disagree w.p. 1 - Gamma."""
    return gamma(pi, 2)


def strict_fail_rate(p, k):
    return 1 - gamma(p, k)


def contaminated_gamma(g, eps):
    """Fraction eps of runs are colluders returning one common wrong value:
    observed pair-agreement = (1-eps)^2 Gamma + eps^2."""
    return (1 - eps) ** 2 * g + eps ** 2


def blind_spot(g):
    """Contamination fraction that leaves pair agreement exactly unchanged:
    (1-e)^2 G + e^2 = G  <=>  e = 2G/(1+G)."""
    return 2 * g / (1 + g)


# ---- float32 reduction-order model ------------------------------------------
def f32(x):
    return struct.unpack("f", struct.pack("f", x))[0]


def sum_f32(vals, order):
    s = 0.0
    for i in order:
        s = f32(s + vals[i])
    return s


def kernel_orders(n_terms, n_classes, rng):
    """Each hardware class fixes one summation order."""
    orders = []
    for _ in range(n_classes):
        o = list(range(n_terms))
        rng.shuffle(o)
        orders.append(o)
    return orders


def class_outputs(vals, orders):
    return [sum_f32(vals, o) for o in orders]


def output_distribution(outs, pi):
    """Distribution over distinct float32 results when class c is drawn w.p. pi[c]."""
    d = {}
    for o, w in zip(outs, pi):
        d[o] = d.get(o, 0.0) + w
    return d


def sample_runs(dist, n, rng):
    keys = list(dist)
    ws = [dist[k] for k in keys]
    return rng.choices(keys, ws, k=n)


def runs_needed(p, delta, z=1.96):
    """Smallest n whose exact U-statistic sd, times z, is at most delta."""
    n = 2
    while z * math.sqrt(u_var(p, n)) > delta:
        n += 1
        if n > 10 ** 7:
            return None
    return n
