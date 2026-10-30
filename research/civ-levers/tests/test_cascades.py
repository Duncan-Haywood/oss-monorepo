import numpy as np
from civ_levers.cascades import watts_strogatz, spread, seeds_patch, seeds_spread


def test_lattice_degree_and_simple_contagion_covers():
    adj = watts_strogatz(200, 8, 0.0, np.random.default_rng(0))
    assert all(len(a) == 8 for a in adj)
    frac, _ = spread(adj, [0], 1)
    assert frac == 1.0


def test_complex_needs_a_patch_on_the_lattice():
    adj = watts_strogatz(200, 8, 0.0, np.random.default_rng(0))
    assert spread(adj, [0], 2)[0] == 1 / 200      # one seed: nobody has two adopting neighbours
    assert spread(adj, [0, 1], 2)[0] == 1.0       # two adjacent seeds cover the ring


def test_threshold_above_degree_never_spreads():
    adj = watts_strogatz(100, 4, 0.0, np.random.default_rng(0))
    assert spread(adj, list(range(5)), 5)[0] == 0.05


def test_rewiring_keeps_edge_count():
    rng = np.random.default_rng(1)
    adj = watts_strogatz(300, 6, 0.5, rng)
    assert sum(len(a) for a in adj) == 300 * 6
    assert all(i not in a for i, a in enumerate(adj))


def test_seed_rules_sizes():
    rng = np.random.default_rng(2)
    adj = watts_strogatz(300, 6, 0.1, rng)
    assert len(seeds_patch(adj, 5, rng)) == 5
    s = seeds_spread(adj, 5, rng)
    assert len(set(s)) == 5
