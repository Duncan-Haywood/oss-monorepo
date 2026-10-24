"""Rank statistics for the rung-bias benchmark (stdlib only)."""
import math
import random


def kendall_tau_b(x, y):
    """Kendall's tau-b (ties in either variable handled); None if one variable is constant."""
    n = len(x)
    c = d = tx = ty = 0
    for i in range(n):
        for j in range(i + 1, n):
            dx, dy = x[i] - x[j], y[i] - y[j]
            if dx == 0 and dy == 0:
                continue
            if dx == 0:
                tx += 1
            elif dy == 0:
                ty += 1
            elif dx * dy > 0:
                c += 1
            else:
                d += 1
    den = math.sqrt((c + d + tx) * (c + d + ty))
    return None if den == 0 else (c - d) / den


def bootstrap_tau(x, y, reps=2000, seed=0):
    rng = random.Random(seed)
    n = len(x)
    vals = []
    for _ in range(reps):
        idx = [rng.randrange(n) for _ in range(n)]
        t = kendall_tau_b([x[i] for i in idx], [y[i] for i in idx])
        if t is not None:
            vals.append(t)
    vals.sort()
    return vals[int(0.025 * len(vals))], vals[int(0.975 * len(vals)) - 1]


def pick_regret(cheap, ref):
    """Mean over ties of ref[pick]/min(ref) - 1 when picking argmin(cheap)."""
    m = min(cheap)
    picks = [ref[i] for i, v in enumerate(cheap) if v == m]
    return sum(picks) / len(picks) / min(ref) - 1


def topk_hit(cheap, ref, k=5):
    """Whether some optimum of `ref` is among the k best by `cheap` (ties at the cut count as inside)."""
    cut = sorted(cheap)[min(k, len(cheap)) - 1]
    best = min(ref)
    return any(cheap[i] <= cut for i, v in enumerate(ref) if v == best)
