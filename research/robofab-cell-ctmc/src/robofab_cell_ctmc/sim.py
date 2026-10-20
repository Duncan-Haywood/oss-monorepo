"""Discrete-event simulation of the single-class held-printer cell with the CTMC's exact rules.

Print time is Erlang-k (gamma with integer shape k) or, with ``print_dist="ln"``, lognormal with the
same mean and coefficient of variation 1/sqrt(k); load, unload and inspect are exponential. A printer
is seized at the start of the load and released at the end of the unload. When the arm is free it
unloads before it loads (unload priority), as in ``ctmc.py``. Returns good parts per minute.
"""
import heapq, math
import numpy as np


def simulate(N, P, k, t_print, t_load, t_unload, t_inspect, q=0.0, print_dist="erlang",
             horizon=200_000.0, warmup=5_000.0, seed=0):
    rng = np.random.default_rng(seed)
    if print_dist == "erlang":
        draw_print = lambda: rng.gamma(k, t_print / k)
    else:
        s2 = math.log(1 + 1.0 / k)
        draw_print = lambda: t_print * math.exp(rng.normal(-s2 / 2, math.sqrt(s2)))
    ev, seq = [], 0

    def push(t, kind, j):
        nonlocal seq
        seq += 1
        heapq.heappush(ev, (t, seq, kind, j))

    q_load, q_unload, q_ins = list(range(N)), [], []
    arm_busy, free_p, ins_busy = False, P, False
    done = 0

    def start(now):
        nonlocal arm_busy, free_p, ins_busy
        if not arm_busy:
            if q_unload:
                arm_busy = True
                push(now + rng.exponential(t_unload), "unload_done", q_unload.pop(0))
            elif q_load and free_p > 0:
                free_p -= 1; arm_busy = True
                push(now + rng.exponential(t_load), "load_done", q_load.pop(0))
        if not ins_busy and q_ins:
            ins_busy = True
            push(now + rng.exponential(t_inspect), "ins_done", q_ins.pop(0))

    start(0.0)
    while ev:
        now, _, kind, j = heapq.heappop(ev)
        if now > horizon:
            break
        if kind == "load_done":
            arm_busy = False; push(now + draw_print(), "print_done", j)
        elif kind == "print_done":
            q_unload.append(j)
        elif kind == "unload_done":
            arm_busy = False; free_p += 1; q_ins.append(j)
        else:
            ins_busy = False
            if now >= warmup and rng.random() >= q:
                done += 1
            q_load.append(j)
        start(now)
    return done / (horizon - warmup)


def replicate(*args, seeds=range(10), **kw):
    x = np.array([simulate(*args, seed=s, **kw) for s in seeds], float)
    return float(x.mean()), float(x.std(ddof=1) / math.sqrt(len(x)))
