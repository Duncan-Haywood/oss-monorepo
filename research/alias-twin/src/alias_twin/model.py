"""Alias twin.  A chirp-sequence radar measures radial speed from the phase advance between chirps, so it only sees it modulo
2 v_u (v_u = lambda / (4 T_pri), the unambiguous speed): m = wrap(v_r + noise), wrap(x) = x - 2 v_u floor((x + v_u) / (2 v_u)).
Twin: no folding, m = v_r + noise.
Task: ego speed v from a stationary scene; target i at azimuth theta_i has radial speed v c_i, c_i = cos theta_i.
Naive (twin-tuned) estimator: least squares, v_hat = sum c m / sum c^2.
Unfolding estimator: minimise the wrapped cost sum wrap(m_i - v' c_i)^2 over a grid of v', unwrap with the best v', refit.
"""
import math
import random


def wrap(x, vu):
    return x - 2.0 * vu * math.floor((x + vu) / (2.0 * vu))


def scene(n, fov_deg, rng):
    """Cosines of n azimuths drawn uniformly on [-fov, fov]."""
    f = math.radians(fov_deg)
    return [math.cos(rng.uniform(-f, f)) for _ in range(n)]


def measure(v, c, sigma, vu, rng, fold=True):
    out = []
    for ci in c:
        x = v * ci + rng.gauss(0.0, sigma)
        out.append(wrap(x, vu) if fold else x)
    return out


def ls(m, c):
    return sum(ci * mi for ci, mi in zip(c, m)) / sum(ci * ci for ci in c)


def wrapped_cost(m, c, vp, vu):
    return sum(wrap(mi - vp * ci, vu) ** 2 for mi, ci in zip(m, c))


def unfold_estimate(m, c, vu, vmax, step=0.1):
    """Grid search on the wrapped cost over v' in [0, vmax], then unwrap around the winner and refit by least squares."""
    best, bv = float("inf"), 0.0
    k = 0
    while k * step <= vmax:
        vp = k * step
        J = wrapped_cost(m, c, vp, vu)
        if J < best:
            best, bv = J, vp
        k += 1
    un = [bv * ci + wrap(mi - bv * ci, vu) for mi, ci in zip(m, c)]
    return ls(un, c)


def naive_bias(v, fov_deg, vu):
    """Exact noiseless large-n bias of the naive estimator for azimuths uniform on [-fov, fov]:
    -2 vu E[c k] / E[c^2], k = round(v c / (2 vu)) = number of j >= 1 with c > (2j-1) vu / v."""
    th = math.radians(fov_deg)
    eck = 0.0
    j = 1
    while (2 * j - 1) * vu / v < 1.0:
        a = math.acos((2 * j - 1) * vu / v)
        eck += math.sin(min(th, a)) / th
        j += 1
    ec2 = 0.5 * (1.0 + math.sin(2 * th) / (2 * th))
    return -2.0 * vu * eck / ec2


def twin_rmse(c, sigma):
    """Predicted RMSE of the naive estimator in the unfolded twin: sigma / sqrt(sum c^2)."""
    return sigma / math.sqrt(sum(ci * ci for ci in c))


def confusion_energy(c, vu):
    """Energy E_1 = 4 vu^2 (n - (sum c)^2 / sum c^2) of the best 'one fold off' wrong speed v' = v +- D, D = 2 vu sum c / sum c^2:
    the residual wrap(D c_i) = D c_i - 2 vu is the k = 1 pattern fitted against c.  Independent of the true speed v."""
    n = len(c)
    s, s2 = sum(c), sum(ci * ci for ci in c)
    return 4.0 * vu * vu * (n - s * s / s2), 2.0 * vu * s / s2


def phi(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def pair_error_prob(c, sigma, vu):
    """P(wrapped cost at v+D <= cost at v) ~ Phi(-sqrt(E_1) / (2 sigma)): cost difference ~ E_1 + 2 sqrt(E_1) sigma z."""
    E, _ = confusion_energy(c, vu)
    return phi(-math.sqrt(E) / (2.0 * sigma))
