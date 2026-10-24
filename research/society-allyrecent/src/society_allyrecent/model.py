"""Allies who fade by what they saw in their last k partners (society-allywatch with a shorter look-back).

Same crowd as society-allyfade (well-mixed, memory rule of society-robotnorms, committed robots that
walk L, a bloc of stubborn allies that walk L, everyone keeps a memory of their last M partners).
The only change is the fading rule. In `fade="const"` each ally converts with probability c per round
(society-allyfade). In `fade="watch"` an ally converts with probability c * f, where f is the share of
their last k partners (k <= m) that walked R: an ally who has watched the crowd walk the other way gets discouraged, one
who has watched it walk their way stays. Same c means the same rate for an ally who has seen only R.

Stdlib only. Stylised: no geometry, one binary decision per meeting.
"""
import random

L, R = 1, 0


def simulate(n=200, rho=0.05, sl=0.2, c=0.0, fade="const", k=9, m=9, eps=0.02, rounds=1500, seed=0):
    """Returns final share of humans with an L memory majority, the first round a majority of humans
    had one (None if never) and how many allies were left."""
    rng = random.Random(seed)
    nr = round(rho * n)
    humans = n - nr
    nl = round(sl * humans)
    fixed = [None] * n
    for i in range(nr + nl):
        fixed[i] = L
    mem = [[R] * m for _ in range(n)]
    ptr = [0] * n
    cnt = [0] * n
    half = m // 2

    def choose(i):
        if i >= nr and rng.random() < eps:
            return L if rng.random() < 0.5 else R
        if fixed[i] is not None:
            return fixed[i]
        return L if cnt[i] > half else R

    def remember(i, side):
        old = mem[i][ptr[i]]
        mem[i][ptr[i]] = side
        cnt[i] += side - old
        ptr[i] = (ptr[i] + 1) % m

    allies = list(range(nr, nr + nl))
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
            if fade == "const":
                p = c
            else:  # share of R among the ally's last k partners (k = m is society-allywatch)
                p = c * sum(1 - mem[i][(ptr[i] - 1 - d) % m] for d in range(k)) / k
            if rng.random() < p:
                fixed[i] = None
            else:
                keep.append(i)
        allies = keep
        if first is None and sum(cnt[i] > half for i in range(nr, n)) * 2 > humans:
            first = t
    final = sum(cnt[i] > half for i in range(nr, n)) / humans
    return {"final_share_l": final, "first_majority_round": first, "allies_left": len(allies)}


def tipped(result):
    return result["final_share_l"] > 0.5
