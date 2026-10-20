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


def stall_aware_rate(types, printers, inspectors, n_customers, share=0.5, iters=200):
    """Throughput (cycles per minute) with the printer demand inflated by the arm's queueing delay.

    A printer is seized at the start of the load and released at the end of the unload, so it also
    sits through the wait for the arm to unload it. That wait is not known to MVA; take it from the
    arm station itself, as a fixed point: D_printer = D_held + share * (R_arm - D_arm), with R_arm
    the arm's mean residence time per good part from MVA at the current D_printer. ``share`` is the
    fraction of the arm's per-good-part waiting that falls on unloads (0.5: loads and unloads are
    equally many, and a load only waits for the arm, not for the held printer). Damped iteration.
    """
    (arm, prn, ins), m = cell_demands(types, printers, inspectors, hold_printer=True)
    extra = 0.0
    for _ in range(iters):
        X, _, Q = mva([arm, prn + extra, ins], m, n_customers)
        wait = max(Q[0] / X - arm, 0.0)
        new = share * wait
        if abs(new - extra) < 1e-10:
            break
        extra = 0.5 * extra + 0.5 * new
    return X, extra
