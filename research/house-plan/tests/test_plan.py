import math
import random

import pytest

from house_plan.cli import main
from house_plan.plan import BATH_W, Params, make_plan
from house_plan.rules import check_layout
from house_plan.search import GRID, KEYS, evaluate, local_search, random_search
from house_plan.takeoff import STUD_LEN, bom_lines, takeoff


def test_rooms_tile_the_footprint():
    for w, d, nb in ((28, 28, 2), (24, 30, 3), (20, 20, 1)):
        p = Params(width=w, depth=d, n_bed=nb)
        plan = make_plan(p)
        assert sum(r.area for r in plan.rooms) == pytest.approx(w * d)
        assert plan.living_area == w * d


def test_walls_close_and_openings_fit_their_walls():
    plan = make_plan(Params())
    ext = [w for w in plan.walls if w.exterior]
    for a, b in zip(ext, ext[1:] + ext[:1]):
        assert (a.x1, a.y1) == (b.x0, b.y0)  # exterior walls form a closed loop
    for o in plan.openings:
        w = plan.wall(o.wall)
        assert o.offset >= 0 and o.offset + o.width <= w.length + 1e-9, o


def test_plate_and_stud_counts_for_a_plain_wall():
    # a 16 ft wall at 16 in oc, no openings, in a plan whose other walls we ignore: studs = 12 + 1
    plan = make_plan(Params(width=16, depth=20))
    t = takeoff(plan)
    assert t["members"][("2x4", round(STUD_LEN, 3))] > 0
    # the sum of board feet of the bom lines equals total_bf
    assert t["total_bf"] == pytest.approx(sum(t["bf"].values()))


def test_takeoff_matches_hand_count_of_floor_joists():
    # 28 x 28, 16 in oc, joist span 14 ft after a girder: 2 bays x (336/16 + 1 = 22) joists
    t = takeoff(make_plan(Params()))
    assert t["sizes"]["joist"] == "2x10" and t["sizes"]["girder"] == "2x12"
    assert t["members"][("2x10", 168.0)] == 44
    assert t["members"][("2x12", 336.0)] >= 3  # girder plies (plus ridge)
    assert t["posts"] == math.ceil(28 / 8) + 1


def test_rafter_length_follows_pitch():
    t = takeoff(make_plan(Params(width=20, depth=20, pitch=12)))  # 12:12 -> slope factor sqrt(2)
    run_plus_overhang = 10 + 1
    lengths = [l for (s, l) in t["members"] if abs(l - run_plus_overhang * math.sqrt(2) * 12) < 1e-2]
    assert lengths


def test_layout_rules_catch_small_bedrooms():
    ok = make_plan(Params(width=28, depth=28, n_bed=2))
    assert check_layout(ok) == []
    tight = make_plan(Params(width=16, depth=20, n_bed=3, bed_depth=10))  # (16-6)/3 = 3.3 ft wide
    fails = check_layout(tight)
    assert any("R304.3" in f for f in fails) and any("R304.1" in f for f in fails)


def test_egress_rule_needs_a_big_enough_window():
    plan = make_plan(Params())
    assert not any("R310" in f for f in check_layout(plan))
    plan.openings[:] = [o for o in plan.openings if not (o.room == "bed1" and o.kind == "window")]
    assert any("R310.2: bed1" in f for f in check_layout(plan))


def test_overlong_ceiling_span_forces_a_central_wall():
    assert takeoff(make_plan(Params(width=28)))["central_wall"]
    assert not takeoff(make_plan(Params(width=16)))["central_wall"]


def test_cli_exit_codes_and_output(capsys):
    assert main(["--width", "28", "--depth", "28"]) == 0
    out = capsys.readouterr().out
    assert "bf/sq ft" in out and "4x8 sheet" in out
    assert main(["--width", "16", "--depth", "20", "--beds", "3", "--bed-depth", "10"]) == 1


def test_bom_lines_cover_every_member():
    t = takeoff(make_plan(Params()))
    assert len(bom_lines(t)) >= len(t["members"]) + 3


def test_evaluate_scores_feasible_below_penalty_and_prefers_area_shortfall_less():
    good = tuple(dict(width=28.0, depth=28.0, n_bed=2, bed_depth=12.0, win_w=4.0, pitch=6, stud_oc=16,
                      joist_oc=16, rafter_oc=24)[k] for k in KEYS)
    s, d = evaluate(good, 700)
    assert d["feasible"] and s < 10
    s2, d2 = evaluate(good, 2000)  # 784 sq ft against 2000 needed
    assert not d2["feasible"] and s2 > 100


def test_local_search_is_deterministic_per_seed_and_respects_budget():
    a = local_search(200, 1000, random.Random(3))
    b = local_search(200, 1000, random.Random(3))
    assert a == b
    s, v = random_search(50, 1000, random.Random(1))
    assert all(x in GRID[k] for x, k in zip(v, KEYS))


def test_ifc_export_roundtrip(tmp_path):
    ifcopenshell = pytest.importorskip("ifcopenshell")
    from house_plan.ifc import export
    plan = make_plan(Params())
    path = tmp_path / "h.ifc"
    export(plan, takeoff(plan), str(path))
    g = ifcopenshell.open(str(path))
    assert len(g.by_type("IfcWall")) == len(plan.walls)
    assert len(g.by_type("IfcDoor")) == sum(o.kind == "door" for o in plan.openings)
    assert len(g.by_type("IfcWindow")) == sum(o.kind == "window" for o in plan.openings)
    assert len(g.by_type("IfcRelVoidsElement")) == len(plan.openings)
    assert len(g.by_type("IfcSlab")) == 1


def test_openings_never_overlap_on_the_default_grid_corners():
    from house_plan.rules import check_geometry
    assert check_geometry(make_plan(Params())) == []
    assert check_geometry(make_plan(Params(width=40, depth=40, win_w=5.0, n_bed=3))) == []
    # a 16 ft wide house with 5 ft windows cannot fit two on the front wall beside the door
    assert any("geometry" in f for f in check_geometry(make_plan(Params(width=16, win_w=5.0))))
