"""NSGA-II with a crossover switch, for the hyperparameter sweep. Reuses accel-nsga's space, domination, ranking and scoring."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "accel-nsga", "src"))
from accel_nsga import search as S  # noqa: E402


def nsga2_x(space, budget, rng, pop_size=20, mut=0.25, crossover=True):
    """Same loop as accel_nsga.search.nsga2; crossover=False makes each child a mutated copy of one tournament winner."""
    space.cache = {}
    pop = []
    while len(pop) < pop_size and len(space.cache) < budget:
        g = tuple(rng.randrange(n) for n in space.dims)
        if g not in pop:
            pop.append(g)
            space.evaluate(g)
    stale = 0
    while len(space.cache) < budget and stale < 200:
        before = len(space.cache)
        kids = []
        for _ in range(pop_size):
            a, b = (min(rng.sample(pop, min(2, len(pop))), key=lambda g: pop.index(g)) for _ in range(2))
            kid = tuple(a[i] if (not crossover or rng.random() < 0.5) else b[i] for i in range(4))
            kid = tuple(rng.randrange(space.dims[i]) if rng.random() < mut else kid[i] for i in range(4))
            if len(space.cache) < budget or kid in space.cache:
                space.evaluate(kid)
                kids.append(kid)
        pop = S._rank_and_crowd(list(dict.fromkeys(pop + kids)), space)[:pop_size]
        stale = stale + 1 if len(space.cache) == before else 0
    return [(g, r) for g, r in space.cache.items()]
