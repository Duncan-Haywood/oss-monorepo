"""Discrete-event simulation of the same cell, with switches that remove or add one departure from
product form at a time. Own implementation (heapq); not shared with research/robofab-cell-bound.

mode "pf" (product-form-compatible): per pass the arm does one service (load + unload together),
then the job takes a printer for the print time only, then an inspection station.
mode "hold": the real cell semantics: a printer is seized at the start of the load and released at
the end of the unload; the arm does load and unload as separate FIFO services.
dist: "exp" (exponential), "det" (deterministic) or "ln" (lognormal, coefficient of variation cv).
"""
import heapq, math
import numpy as np


def _draw(rng, mean, dist, cv):
    if dist == "det":
        return mean
    if dist == "exp":
        return rng.exponential(mean)
    s2 = math.log(1 + cv * cv)
    return mean * math.exp(rng.normal(-s2 / 2, math.sqrt(s2)))


def simulate(types, printers, inspectors, wip, mode="pf", dist="exp", cv=0.3,
             horizon=24 * 60.0, warmup=4 * 60.0, seed=0):
    """Good parts per minute after warm-up. ``types`` as in mva.cell_demands (equal mix by weight)."""
    rng = np.random.default_rng(seed)
    w = np.array([t["weight"] for t in types], float); w /= w.sum()
    ev, seq = [], 0
    def push(t, kind, j):
        nonlocal seq
        seq += 1
        heapq.heappush(ev, (t, seq, kind, j))
    typ = {}
    jid = 0
    q_arm, q_prn, q_ins = [], [], []
    arm_busy, free_p, free_i = False, printers, inspectors
    done = 0

    def new_job():
        nonlocal jid
        jid += 1
        typ[jid] = types[rng.choice(len(types), p=w)]
        q_arm.append((jid, "both" if mode == "pf" else "load"))     # first step of a pass

    def start(now):
        nonlocal arm_busy, free_p, free_i
        while free_i > 0 and q_ins:
            j = q_ins.pop(0); free_i -= 1
            push(now + _draw(rng, typ[j]["inspect"], dist, cv), "ins_done", j)
        if mode == "pf":
            while free_p > 0 and q_prn:
                j = q_prn.pop(0); free_p -= 1
                push(now + _draw(rng, typ[j]["print"], dist, cv), "print_done", j)
        if not arm_busy and q_arm:
            # FIFO among eligible entries: unloads, or loads when a printer is free
            k = next((i for i, a in enumerate(q_arm) if a[1] == "unload" or mode == "pf" or free_p > 0), None)
            if k is not None:
                if mode == "hold" and q_arm[k][1] == "load":
                    free_p -= 1          # the printer is seized when the load starts
                j, op = q_arm.pop(k)
                t = typ[j]
                mean = {"both": t["load"] + t["unload"], "load": t["load"], "unload": t["unload"]}[op]
                arm_busy = True
                push(now + _draw(rng, mean, dist, cv), "arm_done_" + op, j)

    for _ in range(wip):
        new_job()
    start(0.0)
    while ev:
        now, _, kind, j = heapq.heappop(ev)
        if now > horizon:
            break
        t = typ[j]
        if kind == "arm_done_both":
            arm_busy = False; q_prn.append(j)
        elif kind == "print_done":
            free_p += 1; q_ins.append(j)
        elif kind == "arm_done_load":
            arm_busy = False
            push(now + _draw(rng, t["print"], dist, cv), "print_done_h", j)
        elif kind == "print_done_h":
            q_arm.append((j, "unload"))
        elif kind == "arm_done_unload":
            arm_busy = False; free_p += 1; q_ins.append(j)
        elif kind == "ins_done":
            free_i += 1
            if rng.random() < t["q"]:
                q_arm.append((j, "both" if mode == "pf" else "load"))
            else:
                if now >= warmup:
                    done += 1
                del typ[j]
                new_job()
        start(now)
    return done / (horizon - warmup)


def replicate(*args, seeds=range(20), **kw):
    x = np.array([simulate(*args, seed=s, **kw) for s in seeds])
    return float(x.mean()), float(x.std(ddof=1) / math.sqrt(len(x)))
