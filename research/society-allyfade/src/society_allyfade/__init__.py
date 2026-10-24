"""Do allies on the robots' side leave a crowd tipped once they fade away?

Extends society-blocs (stubborn-L allies, stubborn-R holdouts, committed robots, the memory rule of
society-robotnorms) with the conversion idea of society-converts: each stubborn person turns into an
ordinary memory-rule walker with probability c per round, allies at rate c_l and holdouts at c_r.
Everybody keeps a memory of their last M partners, stubborn or not, so a convert starts with what
they have watched. Question: with a few robots and an ally bloc that dissolves, does the crowd stay on
the robots' side after the last ally has gone, and how slow must the fading be?

Stdlib only. Stylised: no geometry, one binary decision per meeting.
"""
import random

L, R = 1, 0


def simulate(n=200, rho=0.05, sl=0.2, sr=0.0, c_l=0.0, c_r=0.0, m=9, eps=0.02, rounds=1500, seed=0):
    """One well-mixed crowd. Returns the final share of humans whose memory majority is L, the round
    at which a majority of humans first had an L majority (None if never), and how many stubborn
    people were left at the end.

    Each round holds n/2 meetings; then every stubborn person converts with their rate.
    """
    rng = random.Random(seed)
    nr = round(rho * n)
    humans = n - nr
    nl, nrr = round(sl * humans), round(sr * humans)
    fixed = [None] * n
    for i in range(nr):
        fixed[i] = L
    for i in range(nr, nr + nl):
        fixed[i] = L
    for i in range(nr + nl, nr + nl + nrr):
        fixed[i] = R
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

    stubborn = [i for i in range(nr, n) if fixed[i] is not None]
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
        for i in stubborn:
            if rng.random() < (c_l if fixed[i] == L else c_r):
                fixed[i] = None
            else:
                keep.append(i)
        stubborn = keep
        if first is None and sum(cnt[i] > half for i in range(nr, n)) * 2 > humans:
            first = t
    final = sum(cnt[i] > half for i in range(nr, n)) / humans
    return {"final_share_l": final, "first_majority_round": first, "stubborn_left": len(stubborn)}


def tipped(result):
    """A crowd counts as tipped when most humans end with an L memory majority."""
    return result["final_share_l"] > 0.5
