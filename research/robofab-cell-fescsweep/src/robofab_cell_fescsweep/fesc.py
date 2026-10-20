"""Flow-equivalent server (Norton) decomposition of the held-printer robot-printer cell.

Split the cell into the arm-and-printers subsystem and the inspection station. Short-circuit the
subsystem (a finished unload returns the job to the load queue at once) and solve it exactly as a
Markov chain at each fixed population n = 1..N, giving its throughput H(n). Replace it by one
load-dependent exponential server of rate H(n) and solve the two-station closed network, a birth-death
chain on the number of jobs at inspection. This is exact for product-form networks; the cell is not
one (the arm and printers are held together), so the result is an approximation, tested against the
full chain in ``ctmc.py``. Rates are per minute; the subsystem chain has no inspection state.
"""
import numpy as np
from .ctmc import stationary


def _dispatch(w, al, ph, u, au, P):
    if al == 0 and au == 0:
        if u > 0:
            return w, al, ph, u - 1, 1
        if w > 0 and (al + sum(ph) + u + au) < P:
            return w - 1, 1, ph, u, au
    return w, al, ph, u, au


def subsystem_rate(n, P, k, t_print, t_load, t_unload):
    """Unload completions per minute of the arm-and-printers subsystem closed on itself with n jobs."""
    def norm(w, al, ph, u, au):
        w, al, ph, u, au = _dispatch(w, al, tuple(ph), u, au, P)
        return (w, al, tuple(ph), u, au)
    start = norm(n, 0, (0,) * k, 0, 0)
    idx, order = {start: 0}, [start]
    rows, cols, rates, unl = [], [], [], []

    def add(src, dst, r, is_unload=False):
        if dst not in idx:
            idx[dst] = len(order); order.append(dst)
        rows.append(idx[src]); cols.append(idx[dst]); rates.append(r)
    i = 0
    while i < len(order):
        s = order[i]; i += 1
        w, al, ph, u, au = s
        if al:
            p2 = list(ph); p2[0] += 1
            add(s, norm(w, 0, p2, u, au), 1.0 / t_load)
        for j in range(k):
            if ph[j]:
                p2 = list(ph); p2[j] -= 1
                if j + 1 < k:
                    p2[j + 1] += 1
                    add(s, norm(w, al, p2, u, au), ph[j] * k / t_print)
                else:
                    add(s, norm(w, al, p2, u + 1, au), ph[j] * k / t_print)
        if au:
            add(s, norm(w + 1, al, ph, u, 0), 1.0 / t_unload)
    au_flag = np.array([x[4] for x in order], float)
    pi = stationary(len(order), np.array(rows), np.array(cols), np.array(rates))
    return float(pi @ au_flag) / t_unload, len(order)


def fesc_rate(N, P, k, t_print, t_load, t_unload, t_inspect, q=0.0):
    """Good parts per minute and the largest subsystem state count, by the decomposition."""
    H, biggest = [0.0], 0
    for n in range(1, N + 1):
        h, ns = subsystem_rate(n, P, k, t_print, t_load, t_unload)
        H.append(h); biggest = max(biggest, ns)
    mu = 1.0 / t_inspect
    # Birth-death on m = jobs at inspection (0..N): up-rate H(N-m), down-rate mu.
    p = np.ones(N + 1)
    for m in range(N):
        p[m + 1] = p[m] * H[N - m] / mu
    p /= p.sum()
    return (1 - q) * mu * (1 - p[0]), biggest
