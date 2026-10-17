"""Flying pixels at a depth edge: single-ray twin vs finite-width lidar beam with merged return pulses.

Scene: a near surface at range r1 fills the half-plane x < 0, a far wall at r2 = r1 + D lies behind it. The beam has a
Gaussian transverse profile of std 1 (all offsets are in beam std). With the beam centre at x = -u, the fraction of beam
energy on the near surface is w(u) = Phi(u). Received energies are E1 = w*rho1/r1^2 and E2 = (1-w)*rho2/r2^2; kappa is
their ratio at w = 1/2, kappa = (rho2/rho1)(r1/r2)^2.

Twin: one ray, returns r1 if u > 0 else r2. Real sensor, pulses closer than the detector resolution (D below it) merge
and the reported range is the energy-weighted centroid r1 + D*f, f = E2/(E1+E2). A return is a ghost (flying pixel) if it
is more than eps from both surfaces, i.e. f in (eps/D, 1 - eps/D).
"""
import math
import random
from statistics import NormalDist

_N = NormalDist()
Phi = _N.cdf
Phi_inv = _N.inv_cdf


def far_fraction(u, kappa):
    """f(u) = E2/(E1+E2) for beam offset u."""
    w = Phi(u)
    return kappa * (1.0 - w) / (w + kappa * (1.0 - w))


def merged_range(u, r1, D, kappa):
    return r1 + D * far_fraction(u, kappa)


def twin_range(u, r1, D):
    return r1 if u > 0 else r1 + D


def u_of_f(f, kappa):
    """Inverse of far_fraction: w/(1-w) = kappa (1-f)/f."""
    odds = kappa * (1.0 - f) / f
    return Phi_inv(odds / (1.0 + odds))


def ghost_band(eps_over_D, kappa):
    """(u_lo, u_hi) of beam offsets whose merged return is a ghost; empty (None) if eps >= D/2."""
    if not 0.0 < eps_over_D < 0.5:
        return None
    return u_of_f(1.0 - eps_over_D, kappa), u_of_f(eps_over_D, kappa)


def ghost_width(eps_over_D, kappa):
    """Width of the ghost band in beam std (0 if no ghost exists)."""
    b = ghost_band(eps_over_D, kappa)
    return 0.0 if b is None else b[1] - b[0]


def ghost_centre(eps_over_D, kappa):
    b = ghost_band(eps_over_D, kappa)
    return None if b is None else 0.5 * (b[0] + b[1])


def ghost_width_scan(eps_over_D, kappa, du=1e-4, span=12.0):
    """Independent check: scan u on a fine grid and measure the ghost set directly from the returned range."""
    n = int(2 * span / du)
    cnt = 0
    for i in range(n):
        f = far_fraction(-span + (i + 0.5) * du, kappa)
        if eps_over_D < f < 1.0 - eps_over_D:
            cnt += 1
    return cnt * du


def ghosts_per_edge(eps_over_D, kappa, q):
    """Expected ghost returns per edge crossing when the beam std is q scan steps (q = sigma_theta / step)."""
    return ghost_width(eps_over_D, kappa) * q


def p_edge_has_ghost(eps_over_D, kappa, q):
    """Probability (over a uniform scan phase) that an edge crossing yields at least one ghost return."""
    return min(1.0, ghosts_per_edge(eps_over_D, kappa, q))


def strongest_return_edge_shift(kappa):
    """Offset u* at which a strongest-return detector switches surfaces (E1 = E2): Phi(u*) = kappa/(1+kappa)."""
    return Phi_inv(kappa / (1.0 + kappa))


def eps_for_width(width, kappa, lo=1e-9, hi=0.5 - 1e-12):
    """Smallest tolerance fraction eps/D whose ghost band is no wider than `width` (width decreases in eps/D)."""
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if ghost_width(mid, kappa) > width:
            lo = mid
        else:
            hi = mid
    return hi


def simulate_scan(eps_over_D, kappa, q, n_beams, rng, edge_every):
    """Beams sweep a scene with a depth edge about every `edge_every` beams (each edge jittered uniformly by +-edge_every/4),
    alternating polarity (near surface on the left, then on the right). Beam std is q scan steps. Returns the fraction of
    beams whose merged return is a ghost."""
    n_edges = n_beams // edge_every + 2
    pos = [k * edge_every + rng.uniform(-0.25, 0.25) * edge_every for k in range(n_edges)]
    ghosts = 0
    for i in range(n_beams):
        k = round(i / edge_every)
        d = i - pos[k]
        u = (-d if k % 2 == 0 else d) / q  # u > 0: beam centre on the near-surface side
        f = far_fraction(u, kappa)
        if eps_over_D < f < 1.0 - eps_over_D:
            ghosts += 1
    return ghosts / n_beams


def ghost_persistence(eps_over_D, kappa, jitter, n_scans, k_min, rng, n_beams=200000):
    """Static robot, n_scans repeated scans of one edge with pointing jitter `jitter` (beam std units, i.i.d. per scan).
    Nominal beam offsets u0 are drawn uniformly on the ghost band widened by 1 on each side; those inside the band are ghost
    samples, and a sample persists if it is a ghost in at least k_min of the scans. Returns (number of ghost samples,
    fraction of them that persist)."""
    band = ghost_band(eps_over_D, kappa)
    if band is None:
        return 0.0, 0.0
    lo, hi = band
    n_ghost = n_pers = 0
    for _ in range(n_beams):
        u0 = rng.uniform(lo - 1.0, hi + 1.0)
        if not lo < u0 < hi:
            continue
        n_ghost += 1
        hits = sum(1 for _ in range(n_scans) if lo < u0 + rng.gauss(0.0, jitter) < hi)
        if hits >= k_min:
            n_pers += 1
    return n_ghost, (n_pers / n_ghost if n_ghost else 0.0)
