"""Exact continuous-time Markov chain (CTMC) of the held-printer robot-printer cell, one job class.

The cell: N jobs circulate through one arm, P printers and one inspection station. A pass is: wait for
a free printer and the arm, load (arm busy, printer seized), print (Erlang-k, so its coefficient of
variation is 1/sqrt(k)), wait for the arm, unload (arm busy, printer released afterwards), inspect.
A part that fails (probability q) and a part that passes both return to the load queue (closed loop),
so q only scales the good-part rate: good rate = (1 - q) * inspection completion rate.
Load, unload and inspect are exponential. When the arm is free it unloads before it loads (unload
priority), which is what makes the state a count vector rather than an ordered queue; ``sim.py``
uses the same rule.

State: (w, al, ph, u, au, i): jobs waiting to load, arm loading (0/1), jobs in each print phase,
jobs waiting to unload, arm unloading (0/1), jobs at inspection (queue + server).
The stationary distribution is found by power iteration on the uniformised chain (numpy only).
"""
import numpy as np


def _dispatch(w, al, ph, u, au, P):
    """Arm starts the next eligible task if idle: an unload first, else a load when a printer is free."""
    if al == 0 and au == 0:
        if u > 0:
            return w, al, ph, u - 1, 1
        if w > 0 and (al + sum(ph) + u + au) < P:
            return w - 1, 1, ph, u, au
    return w, al, ph, u, au


def build(N, P, k, t_print, t_load, t_unload, t_inspect):
    """Return (states, rows, cols, rates, inspect_flag) of the CTMC; rates in events per minute."""
    start = _dispatch(N, 0, (0,) * k, 0, 0, P)
    start = (*start[:2], tuple(start[2]), *start[3:], 0)
    idx = {start: 0}
    order = [start]
    rows, cols, rates = [], [], []

    def add(src, dst, r):
        if dst not in idx:
            idx[dst] = len(order); order.append(dst)
        rows.append(idx[src]); cols.append(idx[dst]); rates.append(r)

    def norm(w, al, ph, u, au, i):
        w, al, ph, u, au = _dispatch(w, al, tuple(ph), u, au, P)
        return (w, al, tuple(ph), u, au, i)

    n = 0
    while n < len(order):
        s = order[n]; n += 1
        w, al, ph, u, au, i = s
        if al:
            p2 = list(ph); p2[0] += 1
            add(s, norm(w, 0, p2, u, au, i), 1.0 / t_load)
        for j in range(k):
            if ph[j]:
                p2 = list(ph); p2[j] -= 1
                if j + 1 < k:
                    p2[j + 1] += 1
                    add(s, norm(w, al, p2, u, au, i), ph[j] * k / t_print)
                else:
                    add(s, norm(w, al, p2, u + 1, au, i), ph[j] * k / t_print)
        if au:
            add(s, norm(w, al, ph, u, 0, i + 1), 1.0 / t_unload)
        if i:
            add(s, norm(w + 1, al, ph, u, au, i - 1), 1.0 / t_inspect)
    insp = np.array([x[5] > 0 for x in order])
    return order, np.array(rows), np.array(cols), np.array(rates), insp


def stationary(n_states, rows, cols, rates, tol=1e-13, max_iter=2_000_000):
    """Stationary distribution by power iteration on the uniformised chain (Jensen's method)."""
    out = np.bincount(rows, weights=rates, minlength=n_states)
    lam = 1.02 * out.max()
    pi = np.full(n_states, 1.0 / n_states)
    stay = 1.0 - out / lam
    for it in range(max_iter):
        new = pi * stay
        np.add.at(new, cols, pi[rows] * rates / lam)
        if it % 50 == 0 and np.abs(new - pi).sum() < tol:
            pi = new
            break
        pi = new
    return pi / pi.sum()


def throughput(N, P, k, t_print, t_load, t_unload, t_inspect, q=0.0):
    """Good parts per minute and the printer-stall share (finished printing, waiting for the arm)."""
    states, r, c, rt, insp = build(N, P, k, t_print, t_load, t_unload, t_inspect)
    pi = stationary(len(states), r, c, rt)
    rate = (1 - q) * float(pi[insp].sum()) / t_inspect
    stall = float(sum(p * s[3] for p, s in zip(pi, states))) / P
    return rate, stall, len(states)
