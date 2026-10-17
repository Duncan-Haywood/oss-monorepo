"""Kronecker (additive-recurrence) lattices with different generator vectors, and a resonance score.

A randomly shifted Kronecker sequence is x_i = (shift + alpha * i) mod 1. `free_qmcdr` used Roberts' R_d
generator, alpha_j = phi_d^-(j+1), and found an erratic error at d = 5. Here the generator is a parameter:

  rd      alpha_j = phi_d^-(j+1)                  (Roberts)
  sqrt    alpha_j = frac(sqrt(p_j)), p_j the j-th prime
  random  a fresh uniform alpha in every randomisation (the average over generators; not a sequence one would ship)

The resonance score of a generator measures how close it is to an integer relation: small values mean
some low-order frequency k has k . alpha almost an integer, so the partial sums of exp(2 pi i k . x_i) do
not cancel and that Fourier mode of the integrand is aggregated badly.
"""
import itertools
import math
import random

from free_qmcdr.model import PRIMES, _phi, Integrand  # noqa: F401  (reuse the return functions and exact means)

__all__ = ["alpha", "kron_sample", "rmse_curve", "resonance", "rmse_at"]


def alpha(kind, d):
    if kind == "rd":
        g = _phi(d)
        return [(1.0 / g ** (j + 1)) % 1.0 for j in range(d)]
    if kind == "sqrt":
        return [math.sqrt(PRIMES[j]) % 1.0 for j in range(d)]
    raise ValueError(kind)


def kron_sample(kind, n, d, rng):
    """n points of a randomly shifted Kronecker sequence with generator `kind` (see module docstring)."""
    shift = [rng.random() for _ in range(d)]
    a = [rng.random() for _ in range(d)] if kind == "random" else alpha(kind, d)
    return [[(shift[j] + a[j] * (i + 1)) % 1.0 for j in range(d)] for i in range(n)]


def rmse_at(integrand, kind, n, reps, seed):
    rng = random.Random(f"{seed}/{integrand.name}/{kind}/{n}")
    se = 0.0
    for _ in range(reps):
        e = integrand.estimate(kron_sample(kind, n, integrand.d, rng)) - integrand.mean
        se += e * e
    return math.sqrt(se / reps)


def rmse_curve(integrand, kind, ns, reps, seed):
    return [rmse_at(integrand, kind, n, reps, seed) for n in ns]


def resonance(a, kmax=4):
    """min over nonzero integer k with |k_j| <= kmax (k and -k identified) of ||k . a|| * prod_j max(1, |k_j|),
    where ||.|| is the distance to the nearest integer. Smaller is worse; returns (score, k)."""
    best, arg = float("inf"), None
    rng = range(-kmax, kmax + 1)
    for k in itertools.product(rng, repeat=len(a)):
        if not any(k):
            continue
        first = next(x for x in k if x)
        if first < 0:
            continue
        s = sum(x * y for x, y in zip(k, a))
        dist = abs(s - round(s))
        w = 1
        for x in k:
            w *= max(1, abs(x))
        v = dist * w
        if v < best:
            best, arg = v, k
    return best, arg
