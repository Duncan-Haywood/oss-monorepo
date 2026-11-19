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


def test_tripod_crowd_rates_match_the_analytic_flux():
    """Independent of the controller: pedestrians at density rho walking at v past a fixed point.
    Time with anyone within 1 m is 1 - exp(-rho*pi*1^2) of the hour (Poisson); contacts within 0.5 m
    arrive at about rho*v*2r = 432/h at 0.1/m^2, fewer once overlapping episodes merge (quality audit 2026-11-19)."""
    rho, n = 0.1, 4
    runs = [simulate(P["tripod"], rho, s, duration=240) for s in range(n)]
    close = sum(r["close_s_per_h"] for r in runs) / n
    contacts = sum(r["contacts_per_h"] for r in runs) / n
    expect_close = 3600 * (1 - math.exp(-rho * math.pi))
    assert abs(close - expect_close) / expect_close < 0.1, close
    assert 0.8 * 432 < contacts < 432, contacts


def test_framed_share_is_pinned():
    """The simulation is deterministic; pin one framed share so a change to the band or metric shows up."""
    r = simulate(P["wheeled, no avoidance"], 0.1, 0, duration=120)
    assert abs(r["framed"] - 0.13958333333333334) < 1e-9
