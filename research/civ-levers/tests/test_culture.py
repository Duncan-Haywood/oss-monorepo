import random
from civ_levers.culture import neighbours, run, regions, active, _interact


def test_lattice_neighbour_counts():
    nb = neighbours(5)
    assert sorted(len(a) for a in nb)[:4] == [2, 2, 2, 2]      # corners
    assert sum(len(a) for a in nb) == 2 * 2 * 5 * 4            # 2 L (L-1) edges, both directions


def test_interaction_needs_partial_overlap():
    rng = random.Random(0)
    a, b = [0, 0, 0], [1, 1, 1]
    assert not _interact(a, b, 3, rng) and a == [0, 0, 0]       # nothing shared
    a = [0, 1, 2]
    assert not _interact(a, [0, 1, 2], 3, rng)                  # identical
    a = [0, 1, 2]
    while not _interact(a, [0, 1, 9], 3, rng):                  # one differing trait: copies it
        pass
    assert a == [0, 1, 9]


def test_single_trait_is_one_region():
    c, _ = run(6, 3, 1, 0, random.Random(0))
    assert regions(c, neighbours(6)) == [36]


def test_run_ends_absorbing_and_regions_sum():
    nb = neighbours(8)
    c, sweeps = run(8, 4, 6, 0, random.Random(3))
    assert not active(c, nb, 4) and sum(regions(c, nb)) == 64


def test_full_broadcast_leaves_each_site_matching_or_opposite():
    media = [0, 0, 0]
    c, _ = run(6, 3, 3, 1.0, random.Random(2), media=media)
    assert all(sum(u == v for u, v in zip(x, media)) in (0, 3) for x in c)
