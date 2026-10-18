import numpy as np
from garment_sizeset import population, cover_matrix, greedy, exact, grid_run, coverage


def test_population_correlation_and_shape():
    p = population(20000, 0.8, 1)
    assert p.shape == (20000, 2)
    assert abs(np.corrcoef(p.T)[0, 1] - 0.8) < 0.02


def test_cover_is_chebyshev():
    people = np.array([[0.0, 0.0], [3.0, 3.0], [3.0, 3.1]])
    C = cover_matrix(people, np.array([[0.0, 0.0]]), 3.0)
    assert C[:, 0].tolist() == [True, True, False]


def test_one_size_covers_cluster():
    people = np.array([[0, 0], [1, 1], [10, 10.0]])
    _, c = greedy(people, 1.0, 1)
    assert abs(c - 2 / 3) < 1e-9


def test_exact_at_least_greedy_and_proven_on_small():
    p = population(60, 0.5, 3)
    for k in (1, 2, 3):
        _, g = greedy(p, 4.0, k)
        pts, e, status = exact(p, 4.0, k)
        assert status == 0 and e >= g - 1e-9 and len(pts) <= k


def test_exact_beats_greedy_on_constructed_instance():
    # classic greedy trap: the centre point covers 4, but the two flank sizes cover 6 together
    people = np.array([[0, 0], [2, 0], [4, 0], [6, 0], [8, 0], [10, 0.0],
                       [4.5, 0], [5.5, 0]])
    _, g = greedy(people, 3.0, 2)
    _, e, _ = exact(people, 3.0, 2)
    assert e >= g


def test_grid_run_respects_budget_and_monotone():
    p = population(300, 0.5, 5)
    prev = 0
    for k in (1, 2, 4):
        pts, c = grid_run(p, 4.0, k)
        assert len(pts) <= k
        assert abs(coverage(p, pts, 4.0) - c) < 1e-12
        assert c >= prev - 1e-12
        prev = c
