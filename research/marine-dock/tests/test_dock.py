import math
from marine_dock.dock import run


def test_still_water_ilos_and_los_capture():
    for st in ("pursuit", "los", "ilos"):
        r = run(st, cy=0.0, sigma=0.0, hs=0.0, seed=1)
        assert r["outcome"] == "capture", (st, r)


def test_deterministic_seed():
    assert run("ilos", cy=0.15, sigma=0.25, seed=3) == run("ilos", cy=0.15, sigma=0.25, seed=3)


def test_crab_angle_limit():
    # cross current 0.3 m/s: crab angle asin(0.3/u). u = 0.5 gives 36.9 deg > 30 deg capture limit; u = 1.0 gives 17.5 deg.
    slow = run("ilos", cy=0.3, hs=0.0, seed=2, u_near=0.5)
    fast = run("ilos", cy=0.3, hs=0.0, seed=2, u_near=1.0)
    assert slow["outcome"] != "capture" and fast["outcome"] == "capture", (slow, fast)
    assert abs(slow["psi"]) > math.radians(30)


def test_plain_los_offset_exceeds_capture_width():
    # steady LOS offset delta*tan(crab) = 6*tan(asin(0.1)) = 0.60 m > g = 0.5 m
    r = run("los", cy=0.1, hs=0.0, seed=2, u_near=1.0)
    assert r["outcome"] == "miss" and abs(r["y"]) > 0.5
