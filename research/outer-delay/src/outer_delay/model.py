"""Delayed outer updates in DiLoCo-style training on a quadratic (companion to outer-momentum, which assumed the
outer step is applied before the next round starts).
Mode with outer curvature s = 1-(1-eta a)^H in (0,1] (see outer-momentum). In overlapped training the synchronisation of
round t is hidden behind the next tau rounds of compute, so the pseudo-gradient applied at round t was computed from the
global point tau rounds old:
    v_t = beta v_{t-1} + s x_{t-tau},   x_{t+1} = x_t - alpha v_t                    (heavy ball, beta=0: plain)
Characteristic polynomial (tau=0 recovers outer-momentum):
    z^{tau+2} - (1+beta) z^{tau+1} + beta z^tau + alpha s z = 0
With beta=0 the mode is stable iff alpha s < 2 sin(pi/(4 tau+2)) (classical delayed-gradient bound, ~ pi/(2 tau+1)).
Eager variant: a fresh fraction w of the applied pseudo-gradient comes from the current point, the rest is tau rounds
old, g_t = s (w x_t + (1-w) x_{t-tau}), giving z^{tau+1} - (1 - alpha s w) z^tau + alpha s (1-w) = 0 (see mixed_radius).
Wallclock: a synchronisation costs C inner steps; hidden behind tau rounds of H steps it costs max(0, C - tau H) extra."""
import cmath
import math

__all__ = ["roots", "mode_radius", "rate", "stable_step", "stable_step_bisect", "tuned_gd", "tuned_hb", "rounds",
           "round_time", "wallclock", "best_plan", "simulate", "curvature", "overlap_gain_bound", "mixed_radius",
           "mixed_stable_step", "tuned_mixed", "mixed_simulate"]


def curvature(eta, a, H):
    return 1.0 - (1.0 - eta * a) ** H


def _poly(s, alpha, beta, tau):
    """Coefficients c[k] of z^k, k=0..tau+2, of the characteristic polynomial (monic)."""
    c = [0.0] * (tau + 3)
    c[tau + 2] += 1.0
    c[tau + 1] -= 1.0 + beta
    c[tau] += beta
    c[1] += alpha * s
    return c


def roots(c):
    """All roots of the monic polynomial with coefficients c (Aberth-Ehrlich iteration, Horner evaluation)."""
    n = len(c) - 1
    z = [cmath.exp(1j * (2 * math.pi * k / n + 0.4)) for k in range(n)]
    for _ in range(400):
        delta = 0.0
        for i in range(n):
            p, dp = c[n], 0.0
            for k in range(n - 1, -1, -1):
                dp = dp * z[i] + p
                p = p * z[i] + c[k]
            if p == 0:
                continue
            ratio = p / dp if dp != 0 else 1e-9
            rep = sum(1.0 / (z[i] - z[j]) for j in range(n) if j != i and z[i] != z[j])
            step = ratio / (1.0 - ratio * rep)
            z[i] -= step
            delta = max(delta, abs(step))
        if delta < 1e-14:
            break
    return z


def mode_radius(s, alpha, beta, tau):
    """Exact per-round contraction of a mode with curvature s under delay tau (spectral radius of the recursion)."""
    if tau == 0:  # closed form, avoids the root finder
        tr, det = 1 + beta - alpha * s, beta
        r = cmath.sqrt(tr * tr / 4 - det)
        return max(abs(tr / 2 + r), abs(tr / 2 - r))
    return max(abs(z) for z in roots(_poly(s, alpha, beta, tau)))


def rate(ss, alpha, beta, tau):
    return max(mode_radius(s, alpha, beta, tau) for s in ss)


def stable_step(tau):
    """Largest alpha*s for which plain delayed outer descent (beta=0) is stable: 2 sin(pi/(4 tau+2))."""
    return 2 * math.sin(math.pi / (4 * tau + 2))


def stable_step_bisect(tau, beta=0.0, tol=1e-9):
    """Numerical stability threshold on alpha*s (s=1) from the spectral radius, for cross-checking the closed form."""
    lo, hi = 0.0, 4.0
    while hi - lo > tol:
        mid = (lo + hi) / 2
        if mode_radius(1.0, mid, beta, tau) < 1 - 1e-12:
            lo = mid
        else:
            hi = mid
    return lo


def _grid(lo, hi, n):
    return [lo + (hi - lo) * j / (n - 1) for j in range(n)]


def _golden(f, a, b, it=60):
    g = (math.sqrt(5) - 1) / 2
    c, d = b - g * (b - a), a + g * (b - a)
    fc, fd = f(c), f(d)
    for _ in range(it):
        if fc < fd:
            b, d, fd = d, c, fc
            c = b - g * (b - a)
            fc = f(c)
        else:
            a, c, fc = c, d, fd
            d = a + g * (b - a)
            fd = f(d)
    return (a + b) / 2


def tuned_gd(s_min, s_max, tau, n=2):
    """Best plain step alpha for curvatures in [s_min,s_max]: returns (alpha, rate). Rate is unimodal in alpha."""
    ss = _grid(s_min, s_max, n)
    hi = stable_step(tau) / s_max
    a = _golden(lambda al: rate(ss, al, 0.0, tau), 1e-9, hi, it=45)
    return a, rate(ss, a, 0.0, tau)


def tuned_hb(s_min, s_max, tau, n=9, betas=None):
    """Best heavy-ball (alpha, beta) under delay tau: closed form at tau=0 (outer-momentum), nested search otherwise.
    Returns (alpha, beta, rate)."""
    if tau == 0 and betas is None:
        k = math.sqrt(s_max / s_min)
        q = (k - 1) / (k + 1)
        return 4 / (math.sqrt(s_max) + math.sqrt(s_min)) ** 2, q * q, q
    ss = _grid(s_min, s_max, n)
    hi = stable_step(tau) / s_max
    best = None
    for be in (betas if betas is not None else [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]):
        ahi = hi * (1 + be) * 1.0
        a = _golden(lambda al: rate(ss, al, be, tau), 1e-9, ahi, it=40)
        r = rate(ss, a, be, tau)
        if best is None or r < best[2]:
            best = (a, be, r)
    return best


def rounds(rho, eps):
    return 0.0 if rho <= 0 else math.log(eps) / math.log(rho)


def round_time(H, tau, C):
    """Time per round in inner-step units: H compute plus the part of the sync C not hidden behind tau rounds."""
    return H + max(0.0, C - tau * H)


def wallclock(kappa, H, tau, C, eps, momentum=True):
    """Time to eps, eta = 1/a_max, tuned outer optimiser for delay tau."""
    s_min = curvature(1.0, 1.0 / kappa, H)
    if momentum and tau > 0:  # momentum never helps once tau >= 1 (tests), so skip the 2-D search
        momentum = False
    r = (tuned_hb if momentum else tuned_gd)(s_min, 1.0, tau)[-1]
    return rounds(r, eps) * round_time(H, tau, C)


def best_plan(kappa, C, eps, Hs, taus, momentum=True):
    """Search (H, tau); returns (H, tau, time)."""
    return min(((H, t, wallclock(kappa, H, t, C, eps, momentum)) for H in Hs for t in taus), key=lambda p: p[2])


def simulate(a_list, eta, H, alpha, beta, tau, n_rounds, x0=None):
    """Literal simulation: each round's pseudo-gradient comes from H inner steps started at the global point of tau
    rounds ago (fresh rounds only exist once history is available; before that the initial point is used)."""
    n = len(a_list)
    hist = [list(x0) if x0 else [1.0] * n]
    v = [0.0] * n
    out = [math.sqrt(sum(t * t for t in hist[0]))]
    for t in range(n_rounds):
        stale = hist[max(0, t - tau)]
        new = []
        for i, a in enumerate(a_list):
            y = stale[i]
            for _ in range(H):
                y -= eta * a * y
            g = stale[i] - y
            v[i] = beta * v[i] + g
            new.append(hist[t][i] - alpha * v[i])
        hist.append(new)
        out.append(math.sqrt(sum(u * u for u in new)))
    return out


def overlap_gain_bound(tau):
    """Asymptotic (kappa_H >> 1) best possible speed-up of a delay-tau plain outer step that fully hides its sync over
    blocking plain averaging at the same H: (tau+1) sin(pi/(4 tau+2)) <= 1, with equality only at tau = 0, 1."""
    return (tau + 1) * math.sin(math.pi / (4 * tau + 2))


def mixed_radius(s, alpha, tau, w):
    """Spectral radius of the eager recursion x_{t+1} = x_t - alpha s (w x_t + (1-w) x_{t-tau})."""
    if tau == 0:
        return abs(1 - alpha * s)
    c = [0.0] * (tau + 2)
    c[tau + 1] = 1.0
    c[tau] -= 1.0 - alpha * s * w
    c[0] += alpha * s * (1.0 - w)
    return max(abs(z) for z in roots(c))


def mixed_stable_step(tau, w, hi=8.0, tol=1e-9):
    """Largest alpha*s (s = 1) below which the first instability has not yet appeared, by bisection from 0."""
    lo = 0.0
    while hi - lo > tol:
        mid = (lo + hi) / 2
        if mixed_radius(1.0, mid, tau, w) < 1 - 1e-12:
            lo = mid
        else:
            hi = mid
    return lo


def tuned_mixed(s_min, s_max, tau, w):
    """Best plain step for the eager recursion on [s_min, s_max]: returns (alpha, rate)."""
    top = mixed_stable_step(tau, w) / s_max
    f = lambda al: max(mixed_radius(s_min, al, tau, w), mixed_radius(s_max, al, tau, w))
    a = _golden(f, 1e-9, top, it=45)
    return a, f(a)


def mixed_simulate(a_list, eta, H, alpha, tau, w, n_rounds, x0=None):
    """Literal simulation of the eager scheme: pseudo-gradient = w * (fresh, from x_t) + (1-w) * (stale, from x_{t-tau})."""
    n = len(a_list)
    hist = [list(x0) if x0 else [1.0] * n]
    out = [math.sqrt(sum(t * t for t in hist[0]))]

    def pseudo(x, a):
        y = x
        for _ in range(H):
            y -= eta * a * y
        return x - y

    for t in range(n_rounds):
        stale = hist[max(0, t - tau)]
        new = [hist[t][i] - alpha * (w * pseudo(hist[t][i], a) + (1 - w) * pseudo(stale[i], a))
               for i, a in enumerate(a_list)]
        hist.append(new)
        out.append(math.sqrt(sum(u * u for u in new)))
    return out
