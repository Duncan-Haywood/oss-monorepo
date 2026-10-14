"""Innovation-gated scalar update: Gaussian-sensor twin vs a real sensor with outliers.

Prior error e = x - xhat ~ N(0, P). Measurement y = x + v, innovation nu = y - xhat = e + v. The real noise is a Gaussian
scale mixture: component c has weight w_c and variance R_c (an outlier is a component with a large R_c). The filter
applies gain K = P/(P+R_twin) to nu if |nu| <= c (the gate) and skips the update otherwise. The twin's sensor is a single
Gaussian, so the gate is sized from the twin: c = z * sqrt(P + R_twin), z = Phi^{-1}(1 - alpha/2).

All error moments below are exact: given component c, nu ~ N(0, S_c) with S_c = P + R_c and e | nu ~ N(P nu/S_c, P R_c/S_c).
"""
import math
import random

INF = float("inf")


def Phi(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def phi(x):
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)


def z_of_alpha(alpha):
    """Two-sided normal quantile: P(|N(0,1)| > z) = alpha."""
    lo, hi = 0.0, 40.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if 2.0 * (1.0 - Phi(mid)) > alpha:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def mixture(eps, kappa, R=1.0):
    """Inlier N(0, R) w.p. 1-eps, outlier N(0, kappa^2 R) w.p. eps."""
    return [(1.0 - eps, R), (eps, kappa * kappa * R)]


def gain(P, R_twin):
    return P / (P + R_twin)


def accept_prob(P, comps, c):
    return sum(w * (2.0 * Phi(c / math.sqrt(P + R)) - 1.0) for w, R in comps)


def mse_update(P, comps, K, c):
    """Exact post-update MSE of: x_hat += K nu if |nu| <= c else unchanged."""
    if c == INF:
        return sum(w * ((1.0 - K) ** 2 * P + K * K * R) for w, R in comps)
    tot = 0.0
    for w, R in comps:
        S = P + R
        s = math.sqrt(S)
        z = c / s
        pa = 2.0 * Phi(z) - 1.0
        m2 = S * (pa - 2.0 * z * phi(z))  # E[nu^2 ; accept]
        beta = P / S
        cv = P * R / S  # Var(e | nu)
        acc = (beta - K) ** 2 * m2 + cv * pa  # E[(e - K nu)^2 ; accept]
        e2acc = beta * beta * m2 + cv * pa  # E[e^2 ; accept]
        tot += w * (acc + (P - e2acc))
    return tot


def inlier_reject(P, R, c):
    """Probability that a clean measurement (variance R) is gated out."""
    return 2.0 * (1.0 - Phi(c / math.sqrt(P + R)))


def outlier_accept(P, R_out, c):
    return 2.0 * Phi(c / math.sqrt(P + R_out)) - 1.0


def worst_kappa(P, eps, R, K, c, lo=0.5, hi=1e4, n=2000):
    """kappa maximising the gated MSE (log grid) and the value."""
    best = (0.0, -1.0)
    for i in range(n + 1):
        k = lo * (hi / lo) ** (i / n)
        v = mse_update(P, mixture(eps, k, R), K, c)
        if v > best[1]:
            best = (k, v)
    return best


def best_z(P, comps, K, R_twin, lo=0.2, hi=8.0, n=1500):
    """Gate half-width z (in sigma of the twin innovation) minimising the real MSE on a grid."""
    s = math.sqrt(P + R_twin)
    best = (0.0, INF)
    for i in range(n + 1):
        z = lo + (hi - lo) * i / n
        v = mse_update(P, comps, K, z * s)
        if v < best[1]:
            best = (z, v)
    return best


def sample_mse(P, comps, K, c, n, rng):
    """Monte Carlo estimate of mse_update."""
    tot = 0.0
    sP = math.sqrt(P)
    ws = [w for w, _ in comps]
    sd = [math.sqrt(R) for _, R in comps]
    for _ in range(n):
        e = rng.gauss(0.0, sP)
        j = rng.choices(range(len(comps)), ws)[0]
        nu = e + rng.gauss(0.0, sd[j])
        tot += (e - K * nu) ** 2 if abs(nu) <= c else e * e
    return tot / n


# ---- recovery from a jump in a random-walk plant (a = 1): x' = x + w, y = x + v -------------------------------------

def steady_prior(Q, R):
    """Steady-state prior variance of the scalar random-walk Kalman filter: P = P_post + Q, fixed point of the Riccati map."""
    P = Q
    for _ in range(100000):
        Pn = P - P * P / (P + R) + Q
        if abs(Pn - P) < 1e-15:
            break
        P = Pn
    return P


def lockout_formula(D, z, Q, R, Pss):
    """Noise-free count of consecutive rejected updates after a jump D in the state.

    While rejecting, the prior variance grows by Q per step, P_k = Pss + (k-1) Q, and update k is accepted once
    |D| <= z sqrt(P_k + R).  Rejections = max(0, ceil((D^2/z^2 - R - Pss)/Q))."""
    need = (D * D) / (z * z) - R - Pss
    return max(0, math.ceil(need / Q - 1e-12))


def simulate_recovery(D, z, Q, R, K_gain_twin, rng, gated=True, tol=1.0, cap=100000):
    """One run. Filter starts at steady state, true state jumps by D; returns (rejected_steps, steps_until |error| <= tol).

    The filter's gain is the steady-state gain (twin = real here), its prior variance grows by Q on a rejected step so the
    gate widens; on an accepted step the variance resets to its steady value (a standard simplification)."""
    Pss = steady_prior(Q, R)
    K = Pss / (Pss + R)
    x = D  # error in the prior mean right after the jump (state - estimate)
    P = Pss
    rejected = 0
    first_ok = None
    for t in range(1, cap + 1):
        x += rng.gauss(0.0, math.sqrt(Q))  # random walk drift of the error
        y_err = rng.gauss(0.0, math.sqrt(R))
        nu = x + y_err
        if (not gated) or abs(nu) <= z * math.sqrt(P + R):
            x -= K * nu
            P = Pss
        else:
            rejected += 1 if first_ok is None else 0
            P += Q
        if first_ok is None and abs(x) <= tol:
            first_ok = t
            return rejected, t
    return rejected, cap
