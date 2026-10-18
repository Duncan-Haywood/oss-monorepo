import csv
import xml.etree.ElementTree as ET

import pytest

from house_open_design.analysis import PACKAGES, annual_energy, cost_index, envelope, lateral
from house_open_design.drawings import floor_plan_svg, south_elevation_svg
from house_open_design.plan_set import ADU, CLIMATE_SET, bom_rows, facts, write


@pytest.fixture(scope="module")
def f():
    return facts()


def test_adu_passes_layout_and_member_checks(f):
    assert f["problems"] == []
    assert f["takeoff"]["floor_area"] == 480


def test_every_lateral_line_has_a_nailing(f):
    assert all(r["edge_in"] is not None for r in f["lateral"].values())


def test_higher_wind_never_loosens_nailing(f):
    lo = lateral(f["plan"], v_mph=100)
    hi = lateral(f["plan"], v_mph=180)
    for key in lo:
        a, b = lo[key]["edge_in"], hi[key]["edge_in"]
        assert b is None or (a is not None and b <= a)


def test_max_wind_speed_is_the_speed_where_capacity_is_met(f):
    r = f["lateral"][("across ridge", "wind")]
    again = lateral(f["plan"], v_mph=r["max_v_mph"] * 0.999)[("across ridge", "wind")]
    assert again["edge_in"] == r["edge_in"]
    over = lateral(f["plan"], v_mph=r["max_v_mph"] * 1.02)[("across ridge", "wind")]
    assert over["edge_in"] is None or over["edge_in"] < r["edge_in"]


def test_tight_envelope_cuts_ua_and_annual_cost(f):
    assert f["env"]["tight"]["ua_total"] < f["env"]["baseline"]["ua_total"]
    for c in CLIMATE_SET:
        assert f["energy"][(c, "heat pump", "tight")]["annual_cost"] < f["energy"][(c, "heat pump", "baseline")]["annual_cost"]


def test_colder_climate_costs_more_to_heat(f):
    heat = [f["energy"][(c, "gas furnace + AC", "baseline")]["heat_mmbtu"] for c in CLIMATE_SET]
    assert heat == sorted(heat)


def test_envelope_areas_exclude_openings(f):
    e = f["env"]["baseline"]
    assert abs(e["wall_ft2"] + e["window_ft2"] + e["door_ft2"] - 2 * (24 + 20) * 8) < 1e-9


def test_own_lot_is_cheaper_with_same_construction(f):
    c = f["cost"]
    assert c["own lot"]["price_index"] < c["with lot"]["price_index"]
    assert abs(c["own lot"]["construction_index"] - c["with lot"]["construction_index"]) < 1e-9


def test_svgs_are_well_formed_and_show_every_opening(f):
    root = ET.fromstring(floor_plan_svg(f["plan"]))
    assert root.tag.endswith("svg")
    south = [o for o in f["plan"].openings if o.wall == "S"]
    elev = ET.fromstring(south_elevation_svg(f["plan"]))
    rects = [e for e in elev.iter() if e.tag.endswith("rect")]
    assert len(rects) == 2 + len(south)  # background, wall, then one per south opening


def test_bom_board_feet_match_takeoff(f):
    rows = bom_rows(f["takeoff"])
    bf = sum(float(r[4]) for r in rows[1:] if r[0] == "lumber")
    assert abs(bf - f["takeoff"]["total_bf"]) < 0.06 * len(rows)


def test_write_makes_the_plan_set(tmp_path):
    _, s = write(tmp_path, ifc=False)
    for name in ("floor-plan.svg", "south-elevation.svg", "bom.csv", "report.md", "summary.json"):
        assert (tmp_path / name).stat().st_size > 0
    assert s["problems"] == []
    with open(tmp_path / "bom.csv") as fh:
        assert next(csv.reader(fh))[0] == "item"
    assert "Not for construction" in (tmp_path / "floor-plan.svg").read_text()
    assert "not a design for construction" in (tmp_path / "report.md").read_text().lower()


def test_ifc_has_the_plan_walls(tmp_path):
    ifcopenshell = pytest.importorskip("ifcopenshell")
    write(tmp_path)
    m = ifcopenshell.open(str(tmp_path / "adu.ifc"))
    assert len(m.by_type("IfcWall")) == len(facts()["plan"].walls)
