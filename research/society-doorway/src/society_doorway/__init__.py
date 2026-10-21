"""Who yields at a door? A repeated go-or-yield game between people and robots.

Costs per encounter (lower is better). Both go: collision, cost `k` each. One goes, one
yields: the goer pays 0, the yielder waits `w`. Both yield: dithering, cost `d` each.
A person remembers the last `m` partners' actions and plays "go" with a logit response
(sharpness `beta`) to the fraction of them that went. A robot goes with fixed probability `g`
(`g = 0` always yields, `g = 1` always goes).
"""
import math
import random
from math import comb

K, W, D = 3.0, 1.0, 1.0


def cost_go(q, k=K, w=W, d=D):
    return k * q


def cost_yield(q, k=K, w=W, d=D):
    return w * q + d * (1 - q)


def go_prob(qhat, beta, k=K, w=W, d=D):
    """Probability a person goes when they believe a share qhat of partners go."""
    x = beta * (cost_go(qhat, k, w, d) - cost_yield(qhat, k, w, d))
    return 1.0 / (1.0 + math.exp(max(-50.0, min(50.0, x))))


def human_go(q, m, beta, **c):
    """Mean-field go probability when each of m remembered partners went with probability q."""
    return sum(comb(m, j) * q ** j * (1 - q) ** (m - j) * go_prob(j / m, beta, **c)
               for j in range(m + 1))


def equilibrium(r, g, m=9, beta=8.0, **c):
    """Fixed point q = (1-r) human_go(q) + r g: the share of all encounters' partners who go.
    The right side minus q is strictly decreasing for the logit response, so bisect."""
    lo, hi = 0.0, 1.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if (1 - r) * human_go(mid, m, beta, **c) + r * g - mid > 0:
            lo = mid
        else:
            hi = mid
    q = (lo + hi) / 2
    return q, human_go(q, m, beta, **c)


def costs(r, g, m=9, beta=8.0, k=K, w=W, d=D):
    """Mean cost per encounter for a person, a robot and the whole crowd at equilibrium."""
    q, p = equilibrium(r, g, m, beta, k=k, w=w, d=d)
    ch = p * cost_go(q, k, w, d) + (1 - p) * cost_yield(q, k, w, d)
    cr = g * cost_go(q, k, w, d) + (1 - g) * cost_yield(q, k, w, d)
    return {"q": q, "p_h": p, "cost_h": ch, "cost_r": cr, "cost_all": (1 - r) * ch + r * cr}


def simulate(r, g, n=200, m=9, beta=8.0, rounds=400, burn=100, seed=0, k=K, w=W, d=D):
    """n agents, a share r robots with go probability g. Each round everyone is paired at
    random; each plays, and records the partner's action in a memory of the last m."""
    rng = random.Random(seed)
    n -= n % 2
    nr = round(r * n)
    robot = [i < nr for i in range(n)]
    mem = [[rng.random() < 0.5 for _ in range(m)] for _ in range(n)]
    tot_go_h = cnt_h = tot_ch = tot_cr = cnt_r = 0.0
    for t in range(rounds):
        order = list(range(n))
        rng.shuffle(order)
        acts = [False] * n
        for i in range(n):
            if robot[i]:
                acts[i] = rng.random() < g
            else:
                acts[i] = rng.random() < go_prob(sum(mem[i]) / m, beta, k, w, d)
        for a in range(0, n, 2):
            i, j = order[a], order[a + 1]
            for x, y in ((i, j), (j, i)):
                c = k if acts[x] and acts[y] else (0.0 if acts[x] else (w if acts[y] else d))
                if t >= burn:
                    if robot[x]:
                        tot_cr += c
                        cnt_r += 1
                    else:
                        tot_ch += c
                        cnt_h += 1
                        tot_go_h += acts[x]
                mem[x].pop(0)
                mem[x].append(acts[y])
    return {"p_h": tot_go_h / cnt_h, "cost_h": tot_ch / cnt_h,
            "cost_r": tot_cr / cnt_r if cnt_r else float("nan")}
