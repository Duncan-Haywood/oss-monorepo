"""One-parameter contact task. Real reward: R*1{theta>=0} - c*(theta+m)^2 (hard edge at 0, nominal pose -m,
real optimum theta=0 with value R - c m^2 > 0). Twin: the edge is replaced by a logistic of width tau and may be
mislocated at e:  f(theta) = R*sigmoid((theta-e)/tau) - c*(theta+m)^2.  Pure Python."""
import math

R, C, M = 1.0, 1.0, 0.5  # normalised task: success worth 1, pose cost 1*(distance from nominal)^2, nominal 0.5 below the edge


def sig(u):
    return 1.0 / (1.0 + math.exp(-u)) if u >= 0 else math.exp(u) / (1.0 + math.exp(u))


def real_value(th, R=R, c=C, m=M):
    return (R if th >= 0 else 0.0) - c * (th + m) ** 2


def real_opt(R=R, c=C, m=M):
    return R - c * m * m


def real_regret(th, R=R, c=C, m=M):
    return real_opt(R, c, m) - real_value(th, R, c, m)


def twin_value(th, tau, e=0.0, R=R, c=C, m=M):
    return R * sig((th - e) / tau) - c * (th + m) ** 2


def twin_grad(th, tau, e=0.0, R=R, c=C, m=M):
    s = sig((th - e) / tau)
    return R * s * (1 - s) / tau - 2 * c * (th + m)


def stationary_points(tau, e=0.0, R=R, c=C, m=M):
    """All roots of twin_grad on [-m-1, max(e,0)+60 tau+2] (sign changes on a grid, refined by bisection), as (theta, is_max)."""
    lo, hi = -m - 1.0, max(e, 0.0) + 60 * tau + 2.0
    n = int((hi - lo) / min(tau / 25.0, 2e-3)) + 1
    h = (hi - lo) / n
    out, x0, g0 = [], lo, twin_grad(lo, tau, e, R, c, m)
    for i in range(1, n + 1):
        x1 = lo + i * h
        g1 = twin_grad(x1, tau, e, R, c, m)
        if g0 == 0 or g0 * g1 < 0:
            a, b, ga = x0, x1, g0
            for _ in range(80):
                mid = 0.5 * (a + b)
                gm = twin_grad(mid, tau, e, R, c, m)
                if ga * gm <= 0:
                    b = mid
                else:
                    a, ga = mid, gm
            out.append((0.5 * (a + b), g0 > 0 and g1 < 0))
        x0, g0 = x1, g1
    return out


def twin_optimum(tau, e=0.0, R=R, c=C, m=M):
    """Global maximiser of the twin objective."""
    maxima = [t for t, is_max in stationary_points(tau, e, R, c, m) if is_max]
    return max(maxima, key=lambda t: twin_value(t, tau, e, R, c, m))


def n_local_maxima(tau, e=0.0, R=R, c=C, m=M):
    return sum(1 for _, is_max in stationary_points(tau, e, R, c, m) if is_max)


def overshoot_asymptote(tau, R=R, c=C, m=M):
    """Small-tau approximation of the twin optimum (e=0): tau*ln(R/(2 c m tau))."""
    return tau * math.log(R / (2 * c * m * tau))


def gd(tau, e=0.0, eta=0.02, steps=200000, theta0=None, tol=1e-9, R=R, c=C, m=M):
    """Gradient ascent on the twin objective from the nominal pose. Returns (theta, steps used, converged)."""
    th = -m if theta0 is None else theta0
    for k in range(steps):
        g = twin_grad(th, tau, e, R, c, m)
        if abs(g) < tol:
            return th, k, True
        th += eta * g
    return th, steps, False


def trap_threshold(e=0.0, lo=0.01, hi=1.0, R=R, c=C, m=M):
    """Smallest tau for which the twin objective has a single local maximum (so ascent from the nominal pose cannot be trapped).
    Bisection on the number of local maxima; assumes a single crossing (checked by tests)."""
    for _ in range(40):
        mid = 0.5 * (lo + hi)
        if n_local_maxima(mid, e, R, c, m) > 1:
            lo = mid
        else:
            hi = mid
    return hi


def anneal(tau0, tau1, stages=40, eta=0.02, e=0.0, R=R, c=C, m=M):
    """Geometric tau schedule from tau0 to tau1, warm-started gradient ascent at each stage."""
    th = -m
    for i in range(stages):
        tau = tau0 * (tau1 / tau0) ** (i / (stages - 1))
        th, _, _ = gd(tau, e, eta, 200000, th, 1e-9, R, c, m)
    return th


def real_regret_edge(th, eps, R=R, c=C, m=M):
    """Regret of pose th when the REAL edge sits at eps (the twin's edge is at 0): best is th=max(eps,-m)."""
    val = (R if th >= eps else 0.0) - c * (th + m) ** 2
    best = max(R - c * (max(eps, -m) + m) ** 2, 0.0)  # or never leave the nominal pose
    return best - val


def exp_regret(th, s, R=R, c=C, m=M, nodes=4001):
    """E over eps ~ N(0, s^2) (real edge offset from the twin's edge) of the regret of a fixed pose th; trapezoid rule on +-6 s."""
    xs = [(-6 + 12 * i / (nodes - 1)) * s for i in range(nodes)]
    ws = [math.exp(-0.5 * (x / s) ** 2) for x in xs]
    return sum(w * real_regret_edge(th, x, R, c, m) for x, w in zip(xs, ws)) / sum(ws)


def best_pose(s, R=R, c=C, m=M, lo=-0.5, hi=0.8, n=1300):
    """Bayes-best fixed pose under the edge-offset prior, by grid (step 1e-3)."""
    ths = [lo + (hi - lo) * i / n for i in range(n + 1)]
    v = [exp_regret(t, s, R, c, m, 1201) for t in ths]
    i = min(range(len(ths)), key=lambda k: v[k])
    return ths[i], v[i]


def upper_threshold(lo=0.15, hi=0.6, e=0.0, R=R, c=C, m=M):
    """Largest tau whose twin optimum still lies at theta >= 0 (beyond it the twin optimum is below the real edge: real reward 0)."""
    for _ in range(30):
        mid = 0.5 * (lo + hi)
        if twin_optimum(mid, e, R, c, m) >= 0:
            lo = mid
        else:
            hi = mid
    return lo
