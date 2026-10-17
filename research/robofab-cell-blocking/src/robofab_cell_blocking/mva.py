"""Exact mean value analysis (MVA) for a closed single-class network with multi-server FCFS stations.

Reiser and Lavenberg (1980) give MVA; the load-dependent form below (service rate min(n, m) at a
station with m servers) is the textbook recursion for product-form networks (Bolch et al., 2006).
Time unit: minutes. ``demand`` is the mean service demand per customer completion (good part).
"""
import numpy as np


def mva(demands, servers, n_customers):
    """Return (throughput, per-station utilisation, mean queue length) at population ``n_customers``.

    demands[i]: mean total service demand of station i per cycle; servers[i]: number of servers.
    Throughput is cycles per minute. Population 0 gives zeros.
    """
    D = np.asarray(demands, float)
    m = np.asarray(servers, int)
    K, N = len(D), int(n_customers)
    p = [np.zeros(N + 1) for _ in range(K)]      # p[i][n] = P(n customers at i | population level)
    for i in range(K):
        p[i][0] = 1.0
    X, R = 0.0, np.zeros(K)
    for pop in range(1, N + 1):
        for i in range(K):
            n = np.arange(1, pop + 1)
            R[i] = np.sum(n / np.minimum(n, m[i]) * D[i] * p[i][n - 1])
        X = pop / R.sum()
        for i in range(K):
            new = np.zeros(N + 1)
            n = np.arange(1, pop + 1)
            new[n] = X * D[i] / np.minimum(n, m[i]) * p[i][n - 1]
            new[0] = 1.0 - new[1:].sum()
            p[i] = new
    util = X * D / m
    return X, util, X * R


def cell_demands(types, printers, inspectors, hold_printer=False):
    """Per-good-part demands (arm, printing, inspection) for a mix of job types.

    ``types``: list of dicts with keys weight, print, load, unload, inspect, q. A good part of a type
    with failure probability q needs 1/(1-q) passes. With ``hold_printer`` the printer is also
    occupied during its load and unload, which MVA can only represent as extra printer demand
    (it ignores the wait for the arm).
    """
    w = np.array([t["weight"] for t in types], float)
    w /= w.sum()
    def mean(f):
        return float(sum(wi * f(t) / (1 - t["q"]) for wi, t in zip(w, types)))
    arm = mean(lambda t: t["load"] + t["unload"])
    prn = mean(lambda t: t["print"] + (t["load"] + t["unload"] if hold_printer else 0.0))
    ins = mean(lambda t: t["inspect"])
    return [arm, prn, ins], [1, printers, inspectors]


def balanced_bounds(demands, servers, n_customers):
    """Asymptotic bounds: min(N / sum D, min_i m_i / D_i)."""
    D = np.asarray(demands, float); m = np.asarray(servers, float)
    return min(n_customers / D.sum(), float((m / D).min()))


def _means(types):
    """Per-good-part mean passes k, load/unload times and second moments (before the cv factor)."""
    w = np.array([t["weight"] for t in types], float); w /= w.sum()
    f = lambda g: float(sum(wi * g(t) / (1 - t["q"]) for wi, t in zip(w, types)))
    return dict(k=f(lambda t: 1.0), U=f(lambda t: t["unload"]), L=f(lambda t: t["load"]),
                S2=f(lambda t: t["load"] ** 2 + t["unload"] ** 2), S2u=f(lambda t: t["unload"] ** 2))


def blocking_mva(types, printers, inspectors, n_customers, wait="priority", cv=0.3, iters=200):
    """MVA with the printer held through load, print and unload, plus a fitted stall.

    The printer is also occupied while a finished print waits for the arm. Two estimates of that
    wait ("stall") per pass are iterated to a fixed point with the throughput X (damped):
    ``wait="priority"``: non-preemptive M/G/1 with unloads given priority over loads (as the
    simulator does when a printer is free): W = R0 / (1 - rho_u), R0 = X * sum(E[S^2]) / 2.
    ``wait="mva"``: the arm's mean queueing delay per visit from the MVA itself,
    (R_arm - D_arm) / (2k). Returns throughput (good parts per minute) and the stall per good part.
    """
    D, m = cell_demands(types, printers, inspectors, hold_printer=True)
    a = _means(types)
    X, stall = mva(D, m, n_customers)[0], 0.0
    for _ in range(iters):
        if wait == "priority":
            rho_u = min(X * a["U"], 0.98)
            W = X * a["S2"] * (1 + cv * cv) / 2 / (1 - rho_u)
        else:
            Xm, _, Q = mva([D[0], D[1] + stall, D[2]], m, n_customers)
            W = max(Q[0] / Xm - D[0], 0.0) / (2 * a["k"])
        stall = a["k"] * W
        Xn = mva([D[0], D[1] + stall, D[2]], m, n_customers)[0]
        if abs(Xn - X) < 1e-12:
            X = Xn; break
        X = 0.5 * X + 0.5 * Xn
    return X, stall


def split_blocking_mva(types, printers, inspectors, n_customers, cv=0.3):
    """Latency and capacity treated apart.

    Load and unload time is already in the arm station's delay, so adding it to the printer's demand
    double-counts it whenever printers are not the bottleneck. This predictor runs MVA with the plain
    printer demand plus the fitted stall (the part the arm station does not count), then caps the result at
    the printer capacity P / (print + load + unload + stall), where the hold really limits throughput.
    """
    Dp, m = cell_demands(types, printers, inspectors)
    Dh, _ = cell_demands(types, printers, inspectors, hold_printer=True)
    a = _means(types)
    X = mva(Dp, m, n_customers)[0]
    for _ in range(300):
        rho_u = min(X * a["U"], 0.98)
        stall = a["k"] * X * a["S2"] * (1 + cv * cv) / 2 / (1 - rho_u)
        Xn = min(mva([Dp[0], Dp[1] + stall, Dp[2]], m, n_customers)[0], printers / (Dh[1] + stall))
        if abs(Xn - X) < 1e-12:
            X = Xn; break
        X = 0.5 * X + 0.5 * Xn
    return X, stall
