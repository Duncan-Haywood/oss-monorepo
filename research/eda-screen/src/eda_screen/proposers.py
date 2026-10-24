"""Six proposers behind one interface: `propose(seen) -> design` where `seen` is a dict {design: normalised objectives}.

Designs are tuples of indices (p, wb, abc). A proposer is never charged for repeating a design: the runner skips it and asks again,
so a budget of B means B *distinct* designs evaluated. Every stochastic proposer takes a numpy Generator.
All six are small original implementations of the textbook methods (cited in the README), not the reference libraries.
"""
import numpy as np
from .hv import dominated


def neighbours(x, sizes):
    out = []
    for i, s in enumerate(sizes):
        for d in (-1, 1):
            if 0 <= x[i] + d < s:
                out.append(x[:i] + (x[i] + d,) + x[i + 1:])
    return out


def random_design(rng, sizes):
    return tuple(int(rng.integers(s)) for s in sizes)


def cheb(y, w):
    """Chebyshev scalarisation with weight vector w (Knowles' ParEGO form, with a small sum term)."""
    return max(wi * yi for wi, yi in zip(w, y)) + 0.05 * sum(wi * yi for wi, yi in zip(w, y))


def rand_weights(rng, k=3):
    return rng.dirichlet(np.ones(k))


class Random:
    name = "random"

    def __init__(self, sizes, rng, all_designs):
        self.sizes, self.rng = sizes, rng

    def propose(self, seen):
        return random_design(self.rng, self.sizes)


class Grid:
    """Lexicographic order over the full grid, the harness's own GridProposer."""
    name = "grid"

    def __init__(self, sizes, rng, all_designs):
        self.order, self.i = sorted(all_designs), 0

    def propose(self, seen):
        x = self.order[self.i]
        self.i += 1
        return x


class Annealing:
    """Simulated annealing on a Chebyshev scalarisation; the weight vector is redrawn every `epoch` proposals."""
    name = "annealing"

    def __init__(self, sizes, rng, all_designs, epoch=6, t0=0.3, cool=0.85):
        self.sizes, self.rng, self.epoch, self.t, self.cool = sizes, rng, epoch, t0, cool
        self.w, self.cur, self.last, self.n = rand_weights(rng), None, None, 0

    def propose(self, seen):
        self.n += 1
        if self.n % self.epoch == 0:
            self.w = rand_weights(self.rng)
        if self.cur is None or self.cur not in seen:
            self.cur = self.last = random_design(self.rng, self.sizes)
            return self.cur
        if self.last in seen and self.last != self.cur:        # Metropolis acceptance of the previous proposal
            d = cheb(seen[self.last], self.w) - cheb(seen[self.cur], self.w)
            if d <= 0 or self.rng.random() < np.exp(-d / max(self.t, 1e-9)):
                self.cur = self.last
        self.t *= self.cool
        nb = neighbours(self.cur, self.sizes)
        self.last = nb[int(self.rng.integers(len(nb)))]
        return self.last


class Genetic:
    """Steady-state GA on a Chebyshev scalarisation (weights redrawn each generation): tournament parents, uniform crossover, point mutation."""
    name = "genetic"

    def __init__(self, sizes, rng, all_designs, pop=8, pm=0.25):
        self.sizes, self.rng, self.pop, self.pm = sizes, rng, pop, pm
        self.w = rand_weights(rng)

    def propose(self, seen):
        pool = list(seen)
        if len(pool) < self.pop:
            return random_design(self.rng, self.sizes)
        if len(pool) % self.pop == 0:
            self.w = rand_weights(self.rng)
        fit = lambda x: cheb(seen[x], self.w)
        elite = sorted(pool, key=fit)[: self.pop]

        def parent():
            a, b = (elite[int(i)] for i in self.rng.integers(len(elite), size=2))
            return a if fit(a) <= fit(b) else b
        pa, pb = parent(), parent()
        child = tuple(pa[i] if self.rng.random() < 0.5 else pb[i] for i in range(len(self.sizes)))
        child = tuple(int(self.rng.integers(self.sizes[i])) if self.rng.random() < self.pm else c for i, c in enumerate(child))
        return child


def ranks_and_crowding(ys):
    """Non-dominated sorting and crowding distance (Deb et al., 2002) for a list of objective tuples."""
    n, rank, left, r = len(ys), [0] * len(ys), set(range(len(ys))), 0
    while left:
        front = [i for i in left if not any(dominated(ys[i], ys[j]) for j in left if j != i)]
        for i in front:
            rank[i] = r
        left -= set(front)
        r += 1
    crowd = [0.0] * n
    for rr in range(r):
        idx = [i for i in range(n) if rank[i] == rr]
        for m in range(len(ys[0])):
            idx.sort(key=lambda i: ys[i][m])
            crowd[idx[0]] = crowd[idx[-1]] = float("inf")
            span = (ys[idx[-1]][m] - ys[idx[0]][m]) or 1.0
            for a, i in enumerate(idx[1:-1], 1):
                crowd[i] += (ys[idx[a + 1]][m] - ys[idx[a - 1]][m]) / span
    return rank, crowd


class NSGA2:
    """NSGA-II survivor selection over everything evaluated so far (population = best `pop` by rank then crowding), binary tournament, uniform crossover."""
    name = "nsga2"

    def __init__(self, sizes, rng, all_designs, pop=8, pm=0.25):
        self.sizes, self.rng, self.pop, self.pm = sizes, rng, pop, pm

    def propose(self, seen):
        pool = list(seen)
        if len(pool) < self.pop:
            return random_design(self.rng, self.sizes)
        ys = [seen[x] for x in pool]
        rank, crowd = ranks_and_crowding(ys)
        order = sorted(range(len(pool)), key=lambda i: (rank[i], -crowd[i]))[: self.pop]

        def parent():
            a, b = (order[int(i)] for i in self.rng.integers(len(order), size=2))
            return pool[a] if (rank[a], -crowd[a]) <= (rank[b], -crowd[b]) else pool[b]
        pa, pb = parent(), parent()
        child = tuple(pa[i] if self.rng.random() < 0.5 else pb[i] for i in range(len(self.sizes)))
        return tuple(int(self.rng.integers(self.sizes[i])) if self.rng.random() < self.pm else c for i, c in enumerate(child))


class TPE:
    """Tree-structured Parzen estimator for categorical variables (Bergstra et al., 2011), with a Chebyshev scalarisation of the three
    objectives under weights redrawn every proposal (ParEGO style). Good set = best gamma fraction; samples 24 candidates from the
    per-variable good-set distribution and keeps the one maximising l(x)/g(x)."""
    name = "tpe"

    def __init__(self, sizes, rng, all_designs, n_init=8, gamma=0.25, n_cand=24):
        self.sizes, self.rng, self.n_init, self.gamma, self.n_cand = sizes, rng, n_init, gamma, n_cand

    def propose(self, seen):
        pool = list(seen)
        if len(pool) < self.n_init:
            return random_design(self.rng, self.sizes)
        w = rand_weights(self.rng)
        pool.sort(key=lambda x: cheb(seen[x], w))
        k = max(2, int(np.ceil(self.gamma * len(pool))))
        good, bad = pool[:k], pool[k:]

        def dens(group, i):
            c = np.ones(self.sizes[i]) * 1.0          # add-one smoothing
            for x in group:
                c[x[i]] += 1
            return c / c.sum()
        lg, gg = [dens(good, i) for i in range(len(self.sizes))], [dens(bad, i) for i in range(len(self.sizes))]
        best, bs = None, -np.inf
        for _ in range(self.n_cand):
            x = tuple(int(self.rng.choice(self.sizes[i], p=lg[i])) for i in range(len(self.sizes)))
            if x in seen:
                continue
            s = sum(np.log(lg[i][x[i]] / gg[i][x[i]]) for i in range(len(self.sizes)))
            if s > bs:
                best, bs = x, s
        return best if best is not None else random_design(self.rng, self.sizes)


ALL = (Random, Grid, Annealing, Genetic, NSGA2, TPE)
