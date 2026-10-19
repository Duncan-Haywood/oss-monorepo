"""People and robots sharing a one-at-a-time resource (a lift, a narrow pavement, a charging point).

One server crosses one agent at a time. People and robots arrive at random
(Poisson). Each crossing takes a fixed time. While agents wait, the server
picks who goes next by a rule that depends on the robots' *deference*:

* A selfish robot queues first come, first served, level with people.
* A deferential robot lets every waiting person go first, and only goes when
  no person is waiting.

With a share f of deferential robots, f = 0 is plain first come, first served
and f = 1 is non-preemptive priority for people. Optionally agents give up
after a patience time (people walk round, robots re-route), so an overloaded
resource loses throughput instead of queueing for ever.

Closed forms for the two ends (M/G/1 with deterministic service; Pollaczek and
Khinchine, and Cobham 1954 for non-preemptive priority) are in `theory`, and the
simulation is checked against them. Stdlib only. Stylised: one server, fixed
service times, Poisson arrivals, no real data, nobody observed.
"""
import random

HUMAN, SELFISH, DEFER = 0, 1, 2


def theory(lam_h, lam_r, s_h=1.0, s_r=1.0):
    """Mean queueing wait (before service) for people and robots under FIFO and under people-first priority."""
    rho_h, rho = lam_h * s_h, lam_h * s_h + lam_r * s_r
    if rho >= 1:
        raise ValueError("load must be below 1 for a steady state")
    w0 = (lam_h * s_h ** 2 + lam_r * s_r ** 2) / 2
    fifo = w0 / (1 - rho)
    return {"fifo_h": fifo, "fifo_r": fifo,
            "prio_h": w0 / (1 - rho_h), "prio_r": w0 / ((1 - rho_h) * (1 - rho))}


def simulate(lam_h, lam_r, f_defer=0.0, s_h=1.0, s_r=1.0, horizon=20000.0, warmup=1000.0,
             seed=0, patience_h=None, patience_r=None):
    """One run. Returns per-class counts and mean waits for agents that arrive after `warmup`.

    Arrivals stop at `horizon`; the queue is then served out. Waiting is queueing time only.
    Keys: n_<c>, served_<c>, wait_<c> (mean over served) for c in h, r, rs (selfish robots), rd (deferential robots).
    """
    rng = random.Random(seed)
    flag = random.Random(seed + 10_000_019)
    lam = lam_h + lam_r
    arr, t = [], 0.0
    while True:
        t += rng.expovariate(lam)
        if t >= horizon:
            break
        if rng.random() < lam_h / lam:
            arr.append((t, HUMAN))
        else:
            arr.append((t, DEFER if flag.random() < f_defer else SELFISH))
    q = {HUMAN: [], SELFISH: [], DEFER: []}
    head = {HUMAN: 0, SELFISH: 0, DEFER: 0}
    pat = {HUMAN: patience_h, SELFISH: patience_r, DEFER: patience_r}
    svc = {HUMAN: s_h, SELFISH: s_r, DEFER: s_r}
    n = {HUMAN: 0, SELFISH: 0, DEFER: 0}
    served = dict(n)
    wait = {HUMAN: 0.0, SELFISH: 0.0, DEFER: 0.0}
    i, now = 0, 0.0
    while True:
        while i < len(arr) and arr[i][0] <= now:
            q[arr[i][1]].append(arr[i][0])
            if arr[i][0] >= warmup:
                n[arr[i][1]] += 1
            i += 1
        for c in q:
            p = pat[c]
            if p is not None:
                while head[c] < len(q[c]) and q[c][head[c]] + p <= now:
                    head[c] += 1
        waiting = {c: head[c] < len(q[c]) for c in q}
        if not any(waiting.values()):
            if i >= len(arr):
                break
            now = arr[i][0]
            continue
        if waiting[HUMAN]:
            cands = [c for c in (HUMAN, SELFISH) if waiting[c]]
        else:
            cands = [c for c in (SELFISH, DEFER) if waiting[c]]
        c = min(cands, key=lambda k: q[k][head[k]])
        a = q[c][head[c]]
        head[c] += 1
        if a >= warmup:
            served[c] += 1
            wait[c] += now - a
        now += svc[c]

    def mean(w, k):
        return w / k if k else float("nan")
    rob_n, rob_s = n[SELFISH] + n[DEFER], served[SELFISH] + served[DEFER]
    rob_w = wait[SELFISH] + wait[DEFER]
    return {"n_h": n[HUMAN], "served_h": served[HUMAN], "wait_h": mean(wait[HUMAN], served[HUMAN]),
            "n_r": rob_n, "served_r": rob_s, "wait_r": mean(rob_w, rob_s),
            "n_rs": n[SELFISH], "served_rs": served[SELFISH], "wait_rs": mean(wait[SELFISH], served[SELFISH]),
            "n_rd": n[DEFER], "served_rd": served[DEFER], "wait_rd": mean(wait[DEFER], served[DEFER]),
            "busy": (sum(served[c] * svc[c] for c in served)) / (horizon - warmup)}


def cost_rate(res, lam_h, lam_r, c_h=1.0, c_r=1.0):
    """Waiting cost per unit time: arrival rate x cost per unit wait x mean wait, summed over the two classes."""
    return lam_h * c_h * res["wait_h"] + lam_r * c_r * res["wait_r"]
