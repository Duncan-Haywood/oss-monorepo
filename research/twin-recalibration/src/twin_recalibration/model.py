"""Twin recalibration in the scalar LQ setting. Plant x' = a x + b_t u + w, w ~ N(0, s2); the input gain is a random walk,
b_t = b_{t-1} + eta, eta ~ N(0, qd). The twin is *frozen* between recalibrations. A recalibration is an open-loop identification
experiment of N steps with a Rademacher input u = +-sqrt(ve) (so sum u^2 = N ve exactly), after which b is estimated by least squares on
y = x' - a x = b u + w. The controller then plays the certainty-equivalent gain k*(b_hat) for L steps. One cycle is N + L steps.
The excess stage cost over a clairvoyant controller (one that sees b_t) is what we minimise."""
import math, random

__all__ = ["cost", "optimal_gain", "gain_slope", "cost_curvature", "regret_coef", "exp_step_cost", "exp_cycle_cost", "est_var0",
           "cycle_excess", "best_schedule", "closed_form", "kalman_regret", "simulate", "cliff_estimate", "fail_prob"]


def cost(a, b, k, q=1.0, r=0.1, s2=1.0):
    c = a - b * k
    return math.inf if abs(c) >= 1 else s2 * (q + r * k * k) / (1 - c * c)


def optimal_gain(a, b, q=1.0, r=0.1):
    B = r * (1 - a * a) - q * b * b
    p = (-B + math.sqrt(B * B + 4 * b * b * q * r)) / (2 * b * b)
    return a * b * p / (r + b * b * p)


def gain_slope(a, b, q=1.0, r=0.1, h=1e-5):
    return (optimal_gain(a, b + h, q, r) - optimal_gain(a, b - h, q, r)) / (2 * h)


def cost_curvature(a, b, q=1.0, r=0.1, s2=1.0, h=1e-4):
    k = optimal_gain(a, b, q, r)
    return (cost(a, b, k + h, q, r, s2) - 2 * cost(a, b, k, q, r, s2) + cost(a, b, k - h, q, r, s2)) / (h * h)


def regret_coef(a, b, q=1.0, r=0.1, s2=1.0):
    """rho = J_kk (dk*/db)^2 / 2: excess stage cost per unit variance of the plant-gain error (second order)."""
    return 0.5 * cost_curvature(a, b, q, r, s2) * gain_slope(a, b, q, r) ** 2


def exp_step_cost(a, b, ve, q=1.0, r=0.1, s2=1.0):
    """Steady-state excess cost of one open-loop experiment step over the clairvoyant cost J*: c = c0 + gamma ve with
    c0 = q s2/(1-a^2) - J* (the price of leaving the loop open) and gamma = q b^2/(1-a^2) + r (price per unit input energy). Needs |a|<1."""
    J = cost(a, b, optimal_gain(a, b, q, r), q, r, s2)
    return q * s2 / (1 - a * a) - J + ve * (q * b * b / (1 - a * a) + r)


def exp_cycle_cost(a, b, N, ve, q=1.0, r=0.1, s2=1.0):
    """Exact expected excess cost of an N-step experiment started from the closed-loop stationary state, including the transient
    that the inflated state variance leaves after control resumes. Sum_i (q V_i + r ve) - N J* + (q + r k^2)(V_N - V_cl)/(1 - c^2)."""
    k = optimal_gain(a, b, q, r)
    c = a - b * k
    J = cost(a, b, k, q, r, s2)
    Vcl = s2 / (1 - c * c)
    V, tot = Vcl, 0.0
    for _ in range(N):
        tot += q * V + r * ve - J
        V = a * a * V + b * b * ve + s2
    return tot + (q + r * k * k) * (V - Vcl) / (1 - c * c)


def est_var0(N, ve, qd, s2=1.0, drift_in_window=True):
    """Error variance of the twin's estimate, relative to the gain at the END of the window: s2/(N ve) from the noise plus
    qd (N-1)(2N-1)/(6N) because least squares recovers the window-average gain of a random walk."""
    v = s2 / (N * ve)
    return v + (qd * (N - 1) * (2 * N - 1) / (6 * N) if drift_in_window else 0.0)


def cycle_excess(a, b, qd, N, L, ve, q=1.0, r=0.1, s2=1.0, exact_cost=True, drift_in_window=True):
    """Average excess stage cost per step of the schedule (N experiment steps, then L control steps with a frozen twin):
    [C(N) + rho (L P0 + qd L (L+1)/2)] / (N + L), where control step j after the window has error variance P0 + qd j."""
    rho = regret_coef(a, b, q, r, s2)
    C = exp_cycle_cost(a, b, N, ve, q, r, s2) if exact_cost else N * exp_step_cost(a, b, ve, q, r, s2)
    P0 = est_var0(N, ve, qd, s2, drift_in_window)
    return (C + rho * (L * P0 + qd * L * (L + 1) / 2)) / (N + L)


def cliff_estimate(a, b, q=1.0, r=0.1):
    """Largest estimate b_hat whose certainty-equivalent gain destabilises the true plant b: b k*(b_hat) = 1 + a (k* is decreasing in b_hat)."""
    lo, hi = 1e-3, b
    for _ in range(200):
        mid = (lo + hi) / 2
        if b * optimal_gain(a, mid, q, r) > 1 + a:
            lo = mid
        else:
            hi = mid
    return hi


def fail_prob(a, b, P0, qd=0.0, L=1, q=1.0, r=0.1, m=600):
    """Probability that a cycle destabilises: some control step j <= L has b_t k*(b_hat) >= 1 + a. b_hat ~ N(b, P0) (error relative to the
    gain at the end of the window); the gain then random-walks, and the first-passage probability of a margin M = (1+a)/k*(b_hat) - b is
    taken from the reflection principle, min(1, 2 Phi(-M / sqrt(qd L))) (exact for Brownian motion, an upper bound for the discrete walk).
    Integrated over b_hat on a fixed grid of +-7 sd."""
    sd, tot, wt = math.sqrt(P0), 0.0, 0.0
    Phi = lambda z: 0.5 * (1 + math.erf(z / math.sqrt(2)))
    for i in range(m + 1):
        z = -7 + 14 * i / m
        bh = b + z * sd
        w = math.exp(-z * z / 2)
        if bh <= 1e-3:
            pf = 1.0
        else:
            M = (1 + a) / optimal_gain(a, bh, q, r) - b
            pf = 1.0 if M <= 0 else (min(1.0, 2 * Phi(-M / math.sqrt(qd * L))) if qd * L > 0 else 0.0)
        tot += w * pf; wt += w
    return tot / wt


def best_schedule(a, b, qd, ve, q=1.0, r=0.1, s2=1.0, exact_cost=True, drift_in_window=True, Nmax=400, Lmax=400000, max_fail=1.0):
    """Integer (N, L) minimising cycle_excess subject to fail_prob <= max_fail. For each N the best L is found by a ternary search in L."""
    best = (math.inf, 0, 0)
    for N in range(2, Nmax + 1):
        if fail_prob(a, b, est_var0(N, ve, qd, s2, drift_in_window), qd, 1, q, r) > max_fail:
            continue
        f = lambda L: cycle_excess(a, b, qd, N, L, ve, q, r, s2, exact_cost, drift_in_window) if fail_prob(
            a, b, est_var0(N, ve, qd, s2, drift_in_window), qd, L, q, r, m=120) <= max_fail else math.inf
        lo, hi = 1, Lmax
        while hi - lo > 2:
            m1, m2 = lo + (hi - lo) // 3, hi - (hi - lo) // 3
            if f(m2) == math.inf or f(m1) < f(m2):
                hi = m2
            else:
                lo = m1
        L = min(range(lo, hi + 1), key=f)
        if f(L) < best[0]:
            best = (f(L), N, L)
    return best[1], best[2], best[0]


def closed_form(a, b, qd, ve, q=1.0, r=0.1, s2=1.0):
    """Continuous-relaxation optimum (N >> 1, L >> N, linear experiment cost c per step, no drift inside the window):
    A = sqrt(c rho s2 / ve);  T* = (4 c s2 / (ve rho qd^2))^{1/3};  N* = sqrt(rho s2 T*/(ve c));  excess = 3 A / sqrt(T*) - rho qd / 2.
    Returns dict with T, N, L, excess, and the three equal terms."""
    rho, c = regret_coef(a, b, q, r, s2), exp_step_cost(a, b, ve, q, r, s2)
    A = math.sqrt(c * rho * s2 / ve)
    T = (4 * c * s2 / (ve * rho * qd * qd)) ** (1 / 3)
    N = math.sqrt(rho * s2 * T / (ve * c))
    return dict(T=T, N=N, L=T - N, excess=3 * A / math.sqrt(T) - rho * qd / 2, third=A / math.sqrt(T), rho=rho, c=c)


def kalman_regret(a, b, qd, s2=1.0, q=1.0, r=0.1):
    """Tracking regret of the always-on Kalman twin of `twin-upkeep` for a random walk, with the closed-loop information energy
    v0 = E u^2 = k^2 s2/(1-c^2): rho * m with m = qd/2 + sqrt(qd^2/4 + qd s2/v0)."""
    k = optimal_gain(a, b, q, r)
    c = a - b * k
    v0 = k * k * s2 / (1 - c * c)
    m = qd / 2 + math.sqrt(qd * qd / 4 + qd * s2 / v0)
    return regret_coef(a, b, q, r, s2) * m


def simulate(a, b0, qd, N, L, ve, cycles, seed=0, q=1.0, r=0.1, s2=1.0):
    """Closed loop with periodic recalibration (the gain path restarts from b0 at each cycle, so the local coefficients at b0 apply
    and cycles are i.i.d.; the random walk otherwise wanders off without bound), paired with a clairvoyant run on the same gain path and noise. A cycle whose
    twin-driven controller diverges (|x| > 1e4) is counted as a failure, discarded from the cost, and both states are reset.
    Returns (mean excess stage cost per step over surviving cycles, fraction of cycles that failed)."""
    rng = random.Random(seed)
    sd, amp = math.sqrt(qd), math.sqrt(ve)
    x, xo, b = 0.0, 0.0, b0
    burn = max(cycles // 10, 2)
    tot = tot_o = 0.0
    n = fails = 0
    for cyc in range(cycles + burn):
        us = ys = 0.0
        ct = cto = 0.0
        ok = True
        b = b0                                          # re-centre the gain each cycle: a random walk otherwise leaves the neighbourhood
        for i in range(N + L):
            b += sd * rng.gauss(0, 1)
            w = rng.gauss(0, 1) * math.sqrt(s2)
            if i < N:                                   # identification experiment (the clairvoyant copy keeps controlling)
                u = amp if rng.random() < 0.5 else -amp
            else:
                if i == N:
                    kh = optimal_gain(a, max(ys / us, 0.2), q, r)
                u = -kh * x
            uo = -optimal_gain(a, b, q, r) * xo
            ct += q * x * x + r * u * u
            cto += q * xo * xo + r * uo * uo
            xn = a * x + b * u + w
            if i < N:
                ys += u * (xn - a * x); us += u * u
            x, xo = xn, a * xo + b * uo + w
            if abs(x) > 1e4:
                ok = False
                break
        if not ok:
            x = xo = 0.0
            fails += cyc >= burn
        elif cyc >= burn:
            tot += ct; tot_o += cto; n += N + L
    return ((tot - tot_o) / n if n else math.nan), fails / cycles
