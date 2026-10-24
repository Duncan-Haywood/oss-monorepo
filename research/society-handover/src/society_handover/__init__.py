"""Hand-over: robots replace allies as the allies fade. What is the cheapest schedule that keeps a crowd tipped?

Extends society-allyfade (allies who always walk the robots' side, L, each turn into ordinary memory-rule
walkers with probability c per round). Here, when an ally fades, with probability h a committed robot
(always L, no mistakes) takes their place instead. h = 0 is society-allyfade; h = 1 replaces every faded ally.
The robot count therefore grows from rho0 * n to rho0 * n + h * (faded allies).

Stdlib only. Stylised: no geometry, one binary decision per meeting.
"""
import random

L, R = 1, 0


def simulate(n=200, rho0=0.0, sl=0.2, c=0.0, h=0.0, m=9, eps=0.02, rounds=1500, seed=0):
    """One well-mixed crowd. Returns final share of humans (non-robots) with an L memory majority,
    robots at the end as a share of n, allies still committed, and the first round a majority of
    humans leaned L (None if never).

    Each round holds n/2 meetings; then every ally fades with probability c, becoming a robot with
    probability h and an ordinary walker otherwise.
    """
    rng = random.Random(seed)
    nr0 = round(rho0 * n)
    nl = round(sl * (n - nr0))
    # kind: 0 adaptive, 1 ally (stubborn L, errs), 2 robot (stubborn L, no errors)
    kind = [2] * nr0 + [1] * nl + [0] * (n - nr0 - nl)
    mem = [[R] * m for _ in range(n)]
    ptr = [0] * n
    cnt = [0] * n
    half = m // 2

    def choose(i):
        k = kind[i]
        if k == 2:
            return L
        if rng.random() < eps:
            return L if rng.random() < 0.5 else R
        return L if (k == 1 or cnt[i] > half) else R

    def remember(i, side):
        old = mem[i][ptr[i]]
        mem[i][ptr[i]] = side
        cnt[i] += side - old
        ptr[i] = (ptr[i] + 1) % m

    allies = [i for i in range(n) if kind[i] == 1]
    first = None
    for t in range(1, rounds + 1):
        for _ in range(n // 2):
            i = rng.randrange(n)
            j = rng.randrange(n - 1)
            j += j >= i
            si, sj = choose(i), choose(j)
            remember(i, sj)
            remember(j, si)
        keep = []
        for i in allies:
            if rng.random() < c:
                kind[i] = 2 if rng.random() < h else 0
            else:
                keep.append(i)
        allies = keep
        if first is None:
            hum = [i for i in range(n) if kind[i] != 2]
            if sum(cnt[i] > half for i in hum) * 2 > len(hum):
                first = t
    hum = [i for i in range(n) if kind[i] != 2]
    return {"final_share_l": sum(cnt[i] > half for i in hum) / len(hum),
            "robot_share": sum(k == 2 for k in kind) / n,
            "allies_left": len(allies), "first_majority_round": first}


def tipped(result):
    return result["final_share_l"] > 0.5
