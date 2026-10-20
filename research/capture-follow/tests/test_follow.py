import math
from capture_follow.model import (PLATFORMS, W, delta, dist, crosses_step, seg_dist, simulate)

P = {p.name: p for p in PLATFORMS}


def test_minimum_image_wraps():
    assert abs(delta(0.5, W - 0.5) - 1.0) < 1e-9
    assert abs(dist((0.5, 0.5), (W - 0.5, W - 0.5)) - math.sqrt(2)) < 1e-9


def test_step_line_blocks_outside_ramp_only():
    assert crosses_step((9.9, 5.0), (10.1, 5.0))
    assert not crosses_step((9.9, 15.0), (10.1, 15.0))
    assert not crosses_step((10.5, 5.0), (11.0, 5.0))


def test_seg_dist():
    assert abs(seg_dist((1, 1), (0, 0), (2, 0)) - 1) < 1e-9
    assert abs(seg_dist((5, 0), (0, 0), (2, 0)) - 3) < 1e-9


def test_deterministic():
    a = simulate(P["drone"], 0.1, 3, duration=20)
    assert a == simulate(P["drone"], 0.1, 3, duration=20)


def test_tripod_never_moves_and_costs_base_power():
    r = simulate(P["tripod"], 0.0, 1, duration=20)
    assert abs(r["wh_per_h"] - P["tripod"].base_w) < 1e-6
    assert r["blocked"] == 0


def test_empty_plaza_has_no_pedestrian_events():
    r = simulate(P["wheeled"], 0.0, 1, duration=30, steps_on=False)
    assert r["contacts_per_h"] == 0 and r["close_s_per_h"] == 0 and r["clear"] == 1.0


def test_flat_empty_plaza_holds_framing():
    for n in ("wheeled", "drone"):
        assert simulate(P[n], 0.0, 2, duration=60, steps_on=False)["framed"] > 0.9


def test_steps_block_wheels_not_wheel_legs():
    w = simulate(P["wheeled"], 0.0, 4, duration=120)
    l = simulate(P["wheel-legs"], 0.0, 4, duration=120)
    assert w["blocked"] > 0 and l["blocked"] == 0


def test_drone_ignores_steps():
    assert simulate(P["drone"], 0.0, 4, duration=120)["blocked"] == 0


def test_avoidance_reduces_contacts_in_crowd():
    base = sum(simulate(P["drone, no avoidance"], 0.3, s, duration=60)["contacts_per_h"] for s in range(4))
    av = sum(simulate(P["drone"], 0.3, s, duration=60)["contacts_per_h"] for s in range(4))
    assert av < base
