import pytest
from garment_nesting import *
from garment_nesting.rect import length

P = [(60, 50), (40, 30), (50, 20), (30, 30), (20, 45), (70, 15)]
W = 100


@pytest.mark.parametrize("fn", [nfdh, ffdh, bottom_left])
def test_greedy_layouts_valid_and_above_area_bound(fn):
    pos = fn(P, W)
    assert valid_layout(P, pos, W)
    assert length(P, pos) >= area_bound(P, W) - 1e-9


def test_validity_checker_catches_overlap_and_overflow():
    assert not valid_layout([(10, 10), (10, 10)], [(0, 0), (5, 5)], 100)
    assert not valid_layout([(10, 10)], [(95, 0)], 100)
    assert valid_layout([(10, 10), (10, 10)], [(0, 0), (10, 0)], 100)


def test_annealing_never_worse_than_start_and_valid():
    pos, L = anneal_rect(P, W, evals=100, seed=1)
    assert valid_layout(P, pos, W)
    start = length(P, bottom_left(P, W, sorted(range(len(P)), key=lambda i: -P[i][0] * P[i][1])))
    assert L <= start + 1e-9


def test_exact_matches_known_optimum():
    pcs = [(50, 40), (50, 40), (100, 10)]  # two boxes side by side, then a full-width strip: 50
    pos, L, opt = exact_rect(pcs, 100, time_limit=20)
    assert opt and abs(L - 50) < 1e-6 and valid_layout(pcs, pos, 100)


def test_exact_not_worse_than_heuristics():
    pos, L, opt = exact_rect(P, W, time_limit=30)
    assert valid_layout(P, pos, W)
    assert L <= length(P, bottom_left(P, W)) + 1e-6
    assert L >= area_bound(P, W) - 1e-6


def test_polygon_area_and_rasterise():
    sq = Piece("sq", ((0, 0), (10, 0), (10, 10), (0, 10)))
    tri = Piece("tri", ((0, 0), (10, 0), (0, 10)))
    assert polygon_area(sq.poly) == 100 and polygon_area(tri.poly) == 50
    assert rasterise(sq, cell=2.0).all() and rasterise(sq, 2.0).shape == (5, 5)
    t = rasterise(tri, cell=1.0)
    assert 0.5 * t.size <= t.sum() <= 0.65 * t.size  # conservative cover of a triangle


def test_two_triangles_interlock():
    # a right triangle and its 180-degree turn tile a square: ideal length 20
    tri = Piece("tri", ((0, 0), (20, 0), (0, 20)))
    placed, L, occ = nest_raster([tri, tri], 20, [0, 1], [False, True], cell=1.0)
    assert L <= 24
    assert occ.max() <= 1.0  # no cell used twice


def test_raster_no_overlap_and_inside_fabric():
    a = Piece("a", ((0, 0), (30, 0), (30, 20), (0, 20)))
    b = Piece("b", ((0, 0), (25, 0), (10, 25)))
    placed, L, occ = nest_raster([a, b, a], 60, [0, 1, 2], [False, False, False], cell=2.0)
    assert occ.max() <= 1.0 and occ.shape[1] == 30
