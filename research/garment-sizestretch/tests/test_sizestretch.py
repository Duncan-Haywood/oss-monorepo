import numpy as np
from garment_sizestretch import population, cover_matrix, candidates, greedy, exact, coverage


def test_window_edges():
    s = np.array([[100.0, 100.0]])
    people = np.array([[96.0, 96.0], [95.9, 96.0], [110.0, 110.0], [110.1, 110.0]])
    C = cover_matrix(people, s, 4.0, 0.10)
    assert C[:, 0].tolist() == [True, False, True, False]


def test_zero_stretch_is_symmetric_window():
    s = np.array([[100.0, 100.0]])
    people = np.array([[100.0, 104.0], [100.0, 104.1]])
    # window [s-loose, s]: with loose 8 and no stretch, 104 is outside
    C = cover_matrix(people, s, 8.0, 0.0)
    assert C[:, 0].tolist() == [False, False]
    C = cover_matrix(np.array([[93.0, 92.0], [93.0, 91.9]]), s, 8.0, 0.0)
    assert C[:, 0].tolist() == [True, False]


def test_more_stretch_never_covers_less():
    p = population(80, 0.5, 2)
    prev = -1
    for st in (0.0, 0.1, 0.2, 0.3):
        _, e, status = exact(p, 8.0, st, 3)
        assert status == 0 and e >= prev - 1e-9
        prev = e


def test_exact_at_least_greedy():
    p = population(60, 0.7, 3)
    for k in (1, 2, 3):
        _, g = greedy(p, 8.0, 0.1, k)
        pts, e, status = exact(p, 8.0, 0.1, k)
        assert status == 0 and e >= g - 1e-9 and len(pts) <= k


def test_candidates_include_both_ends():
    p = np.array([[100.0, 100.0]])
    c = candidates(p, 8.0, 0.1)
    assert len(c) == 2
