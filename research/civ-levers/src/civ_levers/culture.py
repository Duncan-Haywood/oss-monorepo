"""Axelrod's culture model on an L x L lattice, with an optional broadcast.

Each site holds F features with q possible traits. A random site i picks a random
neighbour j; with probability (shared features)/F, and only if they differ somewhere,
i copies one of j's differing traits (Axelrod 1997). Broadcast (Shibanai, Yasuno and
Ishiguro 2001, global field): with probability B per step, i instead meets a fixed
media culture and interacts with it by the same rule.
"""
import random


def init(L, F, q, rng):
    return [[rng.randrange(q) for _ in range(F)] for _ in range(L * L)]


def neighbours(L):
    nb = []
    for x in range(L):
        for y in range(L):
            nb.append([(x + dx) * L + (y + dy)
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                       if 0 <= x + dx < L and 0 <= y + dy < L])
    return nb


def _interact(a, b, F, rng):
    same = sum(u == v for u, v in zip(a, b))
    if 0 < same < F and rng.random() < same / F:
        k = rng.choice([f for f in range(F) if a[f] != b[f]])
        a[k] = b[k]
        return True
    return False


def active(cult, nb, F, media=None):
    for i, c in enumerate(cult):
        if media is not None and 0 < sum(u == v for u, v in zip(c, media)) < F:
            return True
        for j in nb[i]:
            if j > i and 0 < sum(u == v for u, v in zip(c, cult[j])) < F:
                return True
    return False


def run(L, F, q, B, rng, media=None, max_sweeps=20000, check_every=50):
    """Run to an absorbing state. Returns the final culture list and sweeps used.
    With B = 0 the state is absorbing when no bond has 0 < overlap < F."""
    cult = init(L, F, q, rng)
    nb = neighbours(L)
    n = L * L
    if B > 0 and media is None:
        media = [rng.randrange(q) for _ in range(F)]
    m = media if B > 0 else None
    for sweep in range(max_sweeps):
        for _ in range(n):
            i = rng.randrange(n)
            if m is not None and rng.random() < B:
                _interact(cult[i], m, F, rng)
            else:
                _interact(cult[i], cult[rng.choice(nb[i])], F, rng)
        if sweep % check_every == check_every - 1 and not active(cult, nb, F, m):
            return cult, sweep + 1
    return cult, max_sweeps


def regions(cult, nb):
    """Connected sets of sites with identical culture: sizes, largest first."""
    n = len(cult)
    seen = [False] * n
    sizes = []
    for s in range(n):
        if seen[s]:
            continue
        seen[s] = True
        stack, size = [s], 0
        while stack:
            u = stack.pop()
            size += 1
            for v in nb[u]:
                if not seen[v] and cult[v] == cult[u]:
                    seen[v] = True
                    stack.append(v)
        sizes.append(size)
    return sorted(sizes, reverse=True)
