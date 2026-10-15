"""Outer momentum in DiLoCo-style training on a quadratic (companion to local-sgd-bias, which fixed the bias of
averaging and left the outer optimiser open).
Loss (1/2) sum_i a_i x_i^2 in the Hessian eigenbasis. A round runs H inner gradient steps of size eta from the global
point, so mode i is multiplied by (1 - eta a_i)^H; the pseudo-gradient (start minus end) is g_i = s_i x_i with
    s_i = 1 - (1 - eta a_i)^H   in (0, 1],
i.e. the outer optimiser sees a quadratic with curvatures s_i, and s saturates: modes with eta a_i >= 1 (per H) all look
like s = 1. Hence H inner steps compress the outer condition number from a_max/a_min to s_max/s_min ~ kappa/H.
The outer optimiser (PyTorch conventions, v <- beta v + g):
    heavy ball   x <- x - alpha v
    Nesterov     x <- x - alpha (g + beta v)          (DiLoCo default: alpha 0.7, beta 0.9)
Each mode is an exact 2x2 linear map on (x, v); its spectral radius is the per-round contraction of that mode."""
import cmath
import math

__all__ = ["curvature", "spectrum", "kappa_H", "mode_radius", "rate", "hb_optimal", "gd_optimal", "rounds",
           "tuned_rate", "wallclock", "best_H", "kappa_H_approx", "simulate", "DILOCO"]

DILOCO = (0.7, 0.9, "nesterov")


def curvature(eta, a, H):
    return 1.0 - (1.0 - eta * a) ** H


def spectrum(a_list, eta, H):
    return [curvature(eta, a, H) for a in a_list]


def kappa_H(a_min, a_max, eta, H):
    return curvature(eta, a_max, H) / curvature(eta, a_min, H)


def kappa_H_approx(kappa, H):
    """Inner step eta = 1/a_max: kappa_H = 1/(1-(1-1/kappa)^H) ~ kappa/H for H << kappa."""
    return 1.0 / (1.0 - (1.0 - 1.0 / kappa) ** H)


def _matrix(s, alpha, beta, kind):
    if kind == "heavy":
        return (1 - alpha * s, -alpha * beta, s, beta)
    if kind == "nesterov":
        return (1 - alpha * s * (1 + beta), -alpha * beta * beta, s, beta)
    raise ValueError(kind)


def mode_radius(s, alpha, beta, kind="nesterov"):
    """Spectral radius of the 2x2 outer map of a mode with curvature s (exact)."""
    m11, m12, m21, m22 = _matrix(s, alpha, beta, kind)
    tr, det = m11 + m22, m11 * m22 - m12 * m21
    root = cmath.sqrt(tr * tr / 4 - det)
    return max(abs(tr / 2 + root), abs(tr / 2 - root))


def rate(ss, alpha, beta, kind="nesterov"):
    """Per-round contraction of the whole quadratic = worst mode."""
    return max(mode_radius(s, alpha, beta, kind) for s in ss)


def hb_optimal(s_min, s_max):
    """Heavy-ball tuning on curvatures in [s_min, s_max]: returns (alpha, beta, rate)."""
    k = s_max / s_min
    q = (math.sqrt(k) - 1) / (math.sqrt(k) + 1)
    return 4 / (math.sqrt(s_max) + math.sqrt(s_min)) ** 2, q * q, q


def gd_optimal(s_min, s_max):
    """Plain outer step (beta = 0), alpha = 2/(s_min+s_max): rate (k-1)/(k+1)."""
    k = s_max / s_min
    return 2 / (s_min + s_max), 0.0, (k - 1) / (k + 1)


def rounds(rho, eps):
    """Continuous number of rounds to shrink the error by eps."""
    return 0.0 if rho <= 0 else math.log(eps) / math.log(rho)


def tuned_rate(a_min, a_max, eta, H, momentum=True):
    ss = (curvature(eta, a_min, H), curvature(eta, a_max, H))
    return (hb_optimal if momentum else gd_optimal)(*ss)[2]


def wallclock(kappa, H, C, eps, momentum=True):
    """Time to eps for eta = 1/a_max, tuned outer optimiser: rounds x (H inner steps + C for one synchronisation)."""
    rho = tuned_rate(1.0 / kappa, 1.0, 1.0, H, momentum)
    return rounds(rho, eps) * (H + C)


def best_H(kappa, C, eps, Hmax=None, momentum=True):
    """Integer H minimising wallclock; returns (H, time)."""
    Hmax = Hmax or int(4 * kappa)
    return min(((H, wallclock(kappa, H, C, eps, momentum)) for H in range(1, Hmax + 1)), key=lambda p: p[1])


def simulate(a_list, eta, H, alpha, beta, kind, n_rounds, x0=None):
    """Literal simulation: H inner gradient steps per round, pseudo-gradient, outer optimiser. Returns |x| per round."""
    x = list(x0) if x0 else [1.0] * len(a_list)
    v = [0.0] * len(a_list)
    out = [math.sqrt(sum(t * t for t in x))]
    for _ in range(n_rounds):
        for i, a in enumerate(a_list):
            y = x[i]
            for _ in range(H):
                y -= eta * a * y
            g = x[i] - y
            v[i] = beta * v[i] + g
            x[i] -= alpha * (v[i] if kind == "heavy" else g + beta * v[i])
        out.append(math.sqrt(sum(t * t for t in x)))
    return out
