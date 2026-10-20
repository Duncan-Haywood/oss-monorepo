"""Orders in which a grid proposer can walk a discrete design space. Designs are tuples of indices; an order is a list of all designs.

All stdlib. `lexicographic` is what `eda-harness` ships. The others spread early evaluations over the space.
"""
import random


def lexicographic(designs, sizes, rng=None):
    return sorted(designs)


def radical_inverse(i, base):
    f, r = 1.0, 0.0
    while i > 0:
        f /= base
        r += f * (i % base)
        i //= base
    return r


def halton(designs, sizes, rng=None):
    """Halton points (primes 2, 3, 5) snapped to the index grid; designs already taken are skipped, the rest appended lexicographically."""
    primes, out, seen, ds = (2, 3, 5, 7), [], set(), set(designs)
    i = 1
    while len(out) < len(ds) and i < 20000:
        x = tuple(min(s - 1, int(radical_inverse(i, primes[k]) * s)) for k, s in enumerate(sizes))
        if x in ds and x not in seen:
            seen.add(x)
            out.append(x)
        i += 1
    out += [d for d in sorted(ds) if d not in seen]
    return out


def _dist(a, b, sizes):
    """Range-normalised L1 distance between index tuples (each axis counts equally)."""
    return sum(abs(x - y) / max(1, s - 1) for x, y, s in zip(a, b, sizes))


def farthest_point(designs, sizes, rng=None):
    """Greedy maximin: start at the centre-most design (or a random one if rng given), then repeatedly take the design farthest from all chosen."""
    ds = sorted(designs)
    if rng is None:
        mid = tuple((s - 1) / 2 for s in sizes)
        first = min(ds, key=lambda d: (_dist(d, mid, sizes), d))
    else:
        first = ds[rng.randrange(len(ds))]
    out, rest = [first], [d for d in ds if d != first]
    mind = {d: _dist(d, first, sizes) for d in rest}
    while rest:
        nxt = max(rest, key=lambda d: (mind[d], tuple(-v for v in d)))
        rest.remove(nxt)
        out.append(nxt)
        for d in rest:
            mind[d] = min(mind[d], _dist(d, nxt, sizes))
    return out


def random_order(designs, sizes, rng):
    out = sorted(designs)
    rng.shuffle(out)
    return out


def latin(designs, sizes, rng):
    """Rounds of Latin-style batches: each round of m = max(sizes) designs uses each level of every axis about once (random within that)."""
    rest, out = set(designs), []
    while rest:
        batch = []
        perms = [rng.sample(range(s), s) for s in sizes]
        for j in range(max(sizes)):
            tgt = tuple(perms[k][j % sizes[k]] for k in range(len(sizes)))
            if rest:
                best = min(rest, key=lambda d: (sum(abs(a - b) for a, b in zip(d, tgt)), rng.random()))
                rest.remove(best)
                batch.append(best)
        out += batch
    return out


# name -> (function, stochastic)
ORDERS = {"lexicographic": (lexicographic, False), "halton": (halton, False), "farthest": (farthest_point, False),
          "farthest-rand-start": (farthest_point, True), "latin": (latin, True), "random": (random_order, True)}
