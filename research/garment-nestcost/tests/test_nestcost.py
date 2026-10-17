import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np
from garment_nestcost import shell_pieces, lining_pieces, offset_polygon, net_area_m2, cost_with_markers
from garment_nestcost import _paths  # noqa: F401
from garment_nesting.raster import polygon_area, nest_raster
from garment_teardown.model import TRENCH, SCENARIOS, cost_breakdown


def test_offset_square_grows_by_allowance():
    sq = ((0, 0), (10, 0), (10, 10), (0, 10))
    assert abs(polygon_area(offset_polygon(sq, 1.0)) - 144.0) < 1e-6
    assert abs(polygon_area(offset_polygon(sq[::-1], 1.0)) - 144.0) < 1e-6  # orientation-independent


def test_allowance_increases_area_and_keeps_pieces():
    net, cut = shell_pieces(0.0), shell_pieces(1.5)
    assert len(net) == len(cut) == 10
    assert all(polygon_area(c.poly) > polygon_area(n.poly) for n, c in zip(net, cut))


def test_net_areas_plausible():
    assert 1.5 < net_area_m2(shell_pieces()) < 2.5
    assert 0.8 < net_area_m2(lining_pieces()) < 1.5


def test_marker_has_no_overlap_and_efficiency_below_one():
    pcs = shell_pieces(1.5)
    order = sorted(range(len(pcs)), key=lambda i: -polygon_area(pcs[i].poly))
    _, L, occ = nest_raster(pcs, 140.0, order, [False] * len(pcs))
    assert occ.max() <= 1.0 + 1e-6
    assert 0 < net_area_m2(shell_pieces()) * 1e4 / (140.0 * L) < 1.0


def test_cost_matches_teardown_when_efficiencies_equal():
    s = SCENARIOS["mid-wage"]
    a = cost_with_markers(TRENCH, s, TRENCH.marker_efficiency, TRENCH.marker_efficiency)
    b = cost_breakdown(TRENCH, s)
    assert abs(a["fob"] - b["fob"]) < 1e-9 and abs(a["retail"] - b["retail"]) < 1e-9


def test_lower_efficiency_costs_more():
    s = SCENARIOS["mid-wage"]
    assert cost_with_markers(TRENCH, s, 0.6, 0.6)["fob"] > cost_with_markers(TRENCH, s, 0.8, 0.8)["fob"]
