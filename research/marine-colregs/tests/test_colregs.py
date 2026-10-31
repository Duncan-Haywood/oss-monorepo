import math
from marine_colregs.core import *

def test_straight_cpa_matches_analytic():
    # Head-on, 50 m lateral offset, equal speeds: straight-course CPA is the offset.
    e = make_encounter("headon", 180.0, 1.0, 50.0)
    assert abs(run(e, "none")["cpa"] - 50.0) < 2.0

def test_collision_course_without_avoidance():
    for rc in (90.0, 270.0):
        assert run(make_encounter("x", rc, 1.0, 0.0), "none")["cpa"] < 10.0

def test_roles():
    def role(e): return classify(e["op"], e["oh"], e["os"], e["tp"], e["th"], e["ts"])
    assert role(make_encounter("", 180.0, 1.0, 0.0)) == "headon"
    assert role(make_encounter("", 270.0, 1.0, 0.0)) == "giveway"
    assert role(make_encounter("", 90.0, 1.0, 0.0)) == "standon"
    assert role(make_encounter("", 0.0, 0.5, 0.0)) == "overtaking"
    assert role(make_encounter("", 0.0, 1.5, 0.0)) == "overtaken"

def test_planners_avoid_giveway():
    e = make_encounter("x", 270.0, 1.0, 0.0)
    for p in ("rule", "vo", "mpc"):
        r = run(e, p)
        assert r["safe"] and r["compliant"], (p, r)

def test_library_size():
    assert len(encounter_library()) == 5 * (3 + 9 + 9 + 2)
