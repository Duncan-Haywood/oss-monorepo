"""Re-stance time of a G1 riding a drive-and-lift base, and the sheet time it gives.

`buildbot-stance` found which stances (a position along the wall `y` and a standing height `h`) cover the
62 nails of a 4x8 sheet for a G1 with its feet planted. There the move between stances was a swept
number (5 to 40 s). On a base the move is a drive along the wall and a lift, so its time follows from two
speeds. This module orders the stances to shorten the moves (exact, Held-Karp over at most ~16 stances)
and prices them.

Pure stdlib plus `buildbot_stance`/`buildbot_custom`.
"""
from itertools import combinations

from buildbot_custom import model as C


def move_time(a, b, v_drive, v_lift, settle=0.0, parallel=True):
    """Seconds to go from stance a=(y, h) to b: drive |dy|/v_drive, lift |dh|/v_lift, plus `settle`.
    `parallel` runs them together (the longer one counts); otherwise one after the other."""
    td = abs(b[0] - a[0]) / v_drive
    tl = abs(b[1] - a[1]) / v_lift
    return (max(td, tl) if parallel else td + tl) + settle


def best_order(stances, cost):
    """Visiting order of `stances` ((y, h, idx) triples) that minimises the sum of `cost(a, b)` over the
    moves (an open path, any start), by Held-Karp. Returns (order, total)."""
    n = len(stances)
    if n <= 1:
        return list(range(n)), 0.0
    pos = [(s[0], s[1]) for s in stances]
    c = [[cost(pos[i], pos[j]) for j in range(n)] for i in range(n)]
    INF = float("inf")
    dp = {(1 << i, i): (0.0, None) for i in range(n)}
    for size in range(2, n + 1):
        for sub in combinations(range(n), size):
            mask = sum(1 << k for k in sub)
            for j in sub:
                prev = mask ^ (1 << j)
                best = (INF, None)
                for i in sub:
                    if i != j and (prev, i) in dp:
                        v = dp[(prev, i)][0] + c[i][j]
                        if v < best[0]:
                            best = (v, i)
                dp[(mask, j)] = best
    full = (1 << n) - 1
    end = min(range(n), key=lambda j: dp[(full, j)][0])
    total = dp[(full, end)][0]
    order, mask, j = [], full, end
    while j is not None:
        order.append(j)
        prev = dp[(mask, j)][1]
        mask ^= 1 << j
        j = prev
    return order[::-1], total


def nailing_time(pts, stances, v, a, t_fire):
    """Seconds the tip spends nailing and moving between nails, summed over stances (no re-stancing)."""
    total = 0.0
    for y, h, idx in stances:
        sub = [(pts[i][0], pts[i][1], 0.0, "y", "joint") for i in sorted(idx)]
        if sub:
            total += C.sheet_cycle(sub, v, a, t_fire, home=(sub[0][0], sub[0][1]))[0]
    return total


def sheet_time(pts, stances, v, a, t_fire, v_drive, v_lift, settle=0.0, parallel=True):
    """(total seconds, restance seconds, order) for the whole sheet on a base: nailing plus the
    cheapest ordering of the stance changes."""
    order, move = best_order(stances, lambda p, q: move_time(p, q, v_drive, v_lift, settle, parallel))
    return nailing_time(pts, stances, v, a, t_fire) + move, move, order
