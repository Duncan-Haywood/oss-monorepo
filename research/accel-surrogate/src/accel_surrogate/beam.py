"""Cantilever with 8 piecewise-constant section heights: the 'simulator' the surrogate imitates.

fe_tip_deflection: Euler-Bernoulli Hermite-beam finite elements (4 elements per segment), tip load P.
timoshenko_gap: relative extra deflection from shear deformation (closed form per segment), the
model-form gap a surrogate does not need to beat.
"""
import numpy as np

L = 1.0          # m
B = 0.03         # m, width
E = 70e9         # Pa
NU = 0.33
P = 100.0        # N
NSEG = 8
SUB = 4          # FE elements per segment
H_LO, H_HI = 0.02, 0.06   # m, section heights


def fe_tip_deflection(h):
    ne = NSEG * SUB
    le = L / ne
    n = 2 * (ne + 1)
    K = np.zeros((n, n))
    for e in range(ne):
        I = B * h[e // SUB] ** 3 / 12.0
        c = E * I / le ** 3
        k = c * np.array([[12, 6 * le, -12, 6 * le],
                          [6 * le, 4 * le ** 2, -6 * le, 2 * le ** 2],
                          [-12, -6 * le, 12, -6 * le],
                          [6 * le, 2 * le ** 2, -6 * le, 4 * le ** 2]])
        K[2 * e:2 * e + 4, 2 * e:2 * e + 4] += k
    f = np.zeros(n)
    f[n - 2] = P                       # transverse load at the tip node
    free = np.arange(2, n)             # clamp node 0 (w and theta)
    return np.linalg.solve(K[np.ix_(free, free)], f[free])[-2]


def fe_flops():
    """Dense-solve flop estimate (2/3 n^3 for LU on the free dofs) plus assembly; an estimate."""
    n = 2 * NSEG * SUB
    return 2.0 / 3.0 * n ** 3 + NSEG * SUB * 16 * 4


def eb_tip_closed(h):
    """Exact Euler-Bernoulli tip deflection by unit-load integration, per segment."""
    d = L / NSEG
    tot = 0.0
    for i in range(NSEG):
        a, b = i * d, (i + 1) * d
        # integral of (L-x)^2 dx over [a,b]
        s = ((L - a) ** 3 - (L - b) ** 3) / 3.0
        tot += P * s / (E * B * h[i] ** 3 / 12.0)
    return tot


def timoshenko_shear_extra(h):
    G = E / (2 * (1 + NU))
    kappa = 5.0 / 6.0
    d = L / NSEG
    return sum(P * d / (kappa * G * B * h[i]) for i in range(NSEG))


def timoshenko_gap(h):
    """Relative difference (Timoshenko - EB) / EB of the tip deflection."""
    return timoshenko_shear_extra(h) / eb_tip_closed(h)


def sample_designs(rng, n):
    return rng.uniform(H_LO, H_HI, size=(n, NSEG))
