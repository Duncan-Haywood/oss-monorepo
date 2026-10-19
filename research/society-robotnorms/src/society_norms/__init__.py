"""Robots as a committed minority in a human walking convention.

Agents meet in pairs in a corridor and each picks a passing side, L or R. Two
agents that pick the same side pass; two that pick different sides walk into
each other (a conflict). Humans keep a memory of the sides chosen by their last
M partners and pick the side most of them used (M odd, so no ties), with a
small error rate eps. Robots are either "committed" (always L, a programmed
convention) or "adaptive" (they run the human rule). Everyone starts on the
human convention, R.

Questions: what share of committed robots tips the human convention to L, how
does that depend on memory M and on how robots are placed in space, and what
does a norm-shifting robot fleet cost the people around it in conflicts?

Stdlib only. Stylised: no geometry, no speed, one binary decision per meeting.
"""
import math
import random

L, R = 1, 0


def binom_tail(m, q, k):
    """P(Bin(m, q) >= k)."""
    return sum(math.comb(m, j) * q ** j * (1 - q) ** (m - j) for j in range(k, m + 1))


def partner_l_prob(x, rho, eps):
    """Chance a random partner walks L when a share x of humans' rules say L.

    Robots (share rho) are committed to L; humans follow their rule with
    probability 1 - eps and otherwise pick a side at random.
    """
    return rho + (1 - rho) * (x * (1 - eps) + eps / 2)


def mean_field_map(x, rho, m, eps):
    """Share of humans whose memory majority is L, if memories are i.i.d. draws at state x."""
    return binom_tail(m, partner_l_prob(x, rho, eps), (m + 1) // 2)


def low_fixed_point(rho, m, eps, tol=1e-12):
    """Smallest fixed point of the mean-field map reached from x = 0 (the status quo basin)."""
    x = 0.0
    for _ in range(100000):
        nx = mean_field_map(x, rho, m, eps)
        if abs(nx - x) < tol:
            return nx
        x = nx
    return x


def critical_share(m, eps, lo=0.0, hi=0.5, tol=1e-6):
    """Mean-field tipping point: least committed share whose status-quo basin flips past x = 1/2."""
    if low_fixed_point(hi, m, eps) < 0.5:
        return float("nan")
    while hi - lo > tol:
        mid = (lo + hi) / 2
        if low_fixed_point(mid, m, eps) >= 0.5:
            hi = mid
        else:
            lo = mid
    return hi


def placement(n, n_robots, how, rng):
    """Indices of robots on a ring of n sites: 'spread' (evenly spaced), 'cluster' (one block) or 'random'."""
    if n_robots == 0:
        return set()
    if how == "spread":
        return {int(i * n / n_robots) for i in range(n_robots)}
    if how == "cluster":
        return set(range(n_robots))
    return set(rng.sample(range(n), n_robots))


def simulate(n=100, rho=0.2, m=9, eps=0.02, rounds=400, robots="committed",
             space="mixed", k=2, place="random", seed=0):
    """Run one population. Returns a dict of time series and totals.

    space='mixed': partners are uniform. space='ring': a partner sits within k
    sites on a ring. Each round holds n/2 meetings, so an agent meets about one
    partner per round.
    """
    rng = random.Random(seed)
    nr = round(rho * n)
    robot = placement(n, nr, place, rng)
    committed = robots == "committed"
    mem = [[R] * m for _ in range(n)]
    ptr = [0] * n
    cnt = [0] * n  # L entries in each memory
    half = m // 2

    def choose(i):
        if committed and i in robot:
            return L
        if rng.random() < eps:
            return L if rng.random() < 0.5 else R
        return L if cnt[i] > half else R

    def remember(i, s):
        if committed and i in robot:
            return
        old = mem[i][ptr[i]]
        mem[i][ptr[i]] = s
        cnt[i] += s - old
        ptr[i] = (ptr[i] + 1) % m

    humans = [i for i in range(n) if i not in robot]
    nh = len(humans)
    share_l, conflicts = [], []
    human_conf = human_meet = 0
    for _ in range(rounds):
        c = 0
        for _ in range(n // 2):
            i = rng.randrange(n)
            if space == "ring":
                d = rng.randint(1, k) * (1 if rng.random() < 0.5 else -1)
                j = (i + d) % n
            else:
                j = rng.randrange(n - 1)
                j += j >= i
            si, sj = choose(i), choose(j)
            remember(i, sj)
            remember(j, si)
            hum = (i not in robot) + (j not in robot)
            if si != sj:
                c += 1
                human_conf += hum
            human_meet += hum
        conflicts.append(c / (n // 2))
        share_l.append(sum(cnt[i] > half for i in humans) / nh if nh else 1.0)
    return {
        "share_l": share_l,
        "conflicts": conflicts,
        "final_share_l": share_l[-1],
        "flip_round": next((t for t, x in enumerate(share_l) if x >= 0.9), None),
        "human_conflict_rate": human_conf / human_meet if human_meet else 0.0,
    }
