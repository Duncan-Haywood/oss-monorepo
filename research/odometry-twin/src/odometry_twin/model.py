"""Along-track odometry error over T steps.  Each traversal has one persistent bias b ~ N(0, sb^2) (scale or
gyro error) plus white noise w_t ~ N(0, sw^2), so the real error is E_T = T b + sum w_t and
Var_real(T) = T^2 sb^2 + T sw^2.  A twin fitted to one-step increment statistics sees s1^2 = sb^2 + sw^2 per
step and, treating it as white, predicts Var_twin(T) = T s1^2.  rho = sb^2 / s1^2 is the persistent fraction."""
import math, random

__all__ = ["Phi", "Phi_inv", "var_real", "var_twin", "ratio", "miss_prob", "interval_twin", "interval_real",
           "accept_prob", "recall", "false_accept", "simulate_chain", "fit_ratio", "recall_with_estimate",
           "sample_error"]


def Phi(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def Phi_inv(p):
    lo, hi = -12.0, 12.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if Phi(mid) < p:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def var_real(T, s1, rho):
    return s1 * s1 * (rho * T * T + (1.0 - rho) * T)


def var_twin(T, s1):
    return s1 * s1 * T


def ratio(T, rho):
    """Var_real / Var_twin = 1 + (T-1) rho."""
    return 1.0 + (T - 1.0) * rho


def sample_error(T, s1, rho, rng):
    b = rng.gauss(0.0, s1 * math.sqrt(rho))
    sw = s1 * math.sqrt(1.0 - rho)
    return T * b + sum(rng.gauss(0.0, sw) for _ in range(T))


def miss_prob(var, tol):
    """P(|E| > tol) for E ~ N(0, var)."""
    return 2.0 * (1.0 - Phi(tol / math.sqrt(var)))


def interval_twin(tol, s1, delta):
    """Largest T (continuous) at which the *twin* says P(|E_T| > tol) = delta."""
    z = Phi_inv(1.0 - delta / 2.0)
    return (tol / z) ** 2 / (s1 * s1)


def interval_real(tol, s1, rho, delta):
    """Largest T at which the real error meets P(|E_T| > tol) = delta (root of rho T^2 + (1-rho) T = c)."""
    z = Phi_inv(1.0 - delta / 2.0)
    c = (tol / (z * s1)) ** 2
    if rho == 0.0:
        return c
    a, b = rho, 1.0 - rho
    return (-b + math.sqrt(b * b + 4.0 * a * c)) / (2.0 * a)


def accept_prob(S_gate, g, var_res, offset=0.0):
    """P(|r| <= g sqrt(S_gate)) for r ~ N(offset, var_res)."""
    h = g * math.sqrt(S_gate)
    s = math.sqrt(var_res)
    return Phi((h - offset) / s) - Phi((-h - offset) / s)


def recall(T, s1, rho, nu, g, model="twin", infl=1.0):
    """Probability a *true* loop closure passes the gate.  Gate variance S = model variance + nu^2, where the
    model is the twin (T s1^2), the calibrated real variance, or the twin times a fitted inflation `infl`."""
    vr = var_real(T, s1, rho)
    vm = {"twin": var_twin(T, s1), "real": vr, "infl": infl * var_twin(T, s1)}[model]
    return accept_prob(vm + nu * nu, g, vr + nu * nu)


def false_accept(T, s1, rho, nu, g, d, model="twin", infl=1.0):
    """Probability an aliased closure (true residual shifted by an offset d) passes the gate."""
    vr = var_real(T, s1, rho)
    vm = {"twin": var_twin(T, s1), "real": vr, "infl": infl * var_twin(T, s1)}[model]
    return accept_prob(vm + nu * nu, g, vr + nu * nu, d)


def simulate_chain(T, s1, rho, nu, g, q, d, tol, model, rng, segments=400, warm=20, infl=1.0):
    """Repeated segments of T steps, a closure offered at the end of each (aliased with prob q, shifted by d).
    The filter tracks a belief variance P: P += model variance per segment; on accept K = P/(P+nu^2),
    x -= K r, P *= 1-K.  Returns (fraction of segments ending with |x|>tol after the update, RMS x,
    accepted fraction of true closures, accepted fraction of aliased closures)."""
    sb, sw = s1 * math.sqrt(rho), s1 * math.sqrt(1.0 - rho)
    vm = {"twin": var_twin(T, s1), "real": var_real(T, s1, rho), "infl": infl * var_twin(T, s1)}[model]
    x, P = 0.0, nu * nu
    exceed = ss = ta = tn = aa = an = 0
    for i in range(segments + warm):
        x += T * rng.gauss(0.0, sb) + math.sqrt(T) * rng.gauss(0.0, sw)
        P += vm
        aliased = rng.random() < q
        r = x + rng.gauss(0.0, nu) + (d if aliased else 0.0)
        S = P + nu * nu
        ok = abs(r) <= g * math.sqrt(S)
        if ok:
            K = P / S
            x -= K * r
            P *= 1.0 - K
        if i >= warm:
            exceed += abs(x) > tol
            ss += x * x
            if aliased:
                an += 1
                aa += ok
            else:
                tn += 1
                ta += ok
    n = segments
    return exceed / n, math.sqrt(ss / n), ta / max(tn, 1), aa / max(an, 1)


def fit_ratio(errors, T, s1):
    """Moment estimate of Var_real(T)/Var_twin(T) from n ground-truth end-of-traversal errors."""
    return sum(e * e for e in errors) / len(errors) / var_twin(T, s1)


def recall_with_estimate(T, s1, rho, nu, g, n, rng, reps=4000, d=None):
    """Mean recall (and, if d is given, mean false-accept rate) of a gate whose variance is the twin's times a
    ratio fitted from n real traversal errors at lag T; the estimate is n * ratio_hat ~ ratio * chi2_n."""
    R = ratio(T, rho)
    rec = fa = 0.0
    for _ in range(reps):
        chi = sum(rng.gauss(0.0, 1.0) ** 2 for _ in range(n)) / n
        infl = R * chi
        rec += recall(T, s1, rho, nu, g, "infl", infl)
        if d is not None:
            fa += false_accept(T, s1, rho, nu, g, d, "infl", infl)
    return rec / reps, (fa / reps if d is not None else None)
