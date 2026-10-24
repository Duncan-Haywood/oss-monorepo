import math
from capture_follow.model import PLATFORMS, simulate as base_sim
from capture_followplan.plan import simulate

P = {p.name: p for p in PLATFORMS}


def test_repulsion_reproduces_capture_follow_exactly():
    for name in ("drone", "wheeled", "wheel-legs", "drone, no avoidance"):
        mode = "repulsion" if P[name].avoid else "ignore"
        a = simulate(P[name], 0.1, 2, mode=mode, duration=40)
        b = base_sim(P[name], 0.1, 2, duration=40)
        for k in ("framed", "clear", "blocked", "contacts_per_h", "close_s_per_h"):
            assert abs(a[k] - b[k]) < 1e-9, (name, k)


def test_planner_holds_frame_on_empty_flat_plaza():
    r = simulate(P["drone"], 0.0, 1, mode="plan", duration=60, steps_on=False)
    assert r["framed"] > 0.85 and r["contacts_per_h"] == 0


def test_planner_deterministic():
    a = simulate(P["drone"], 0.1, 3, mode="plan", duration=20)
    assert a == simulate(P["drone"], 0.1, 3, mode="plan", duration=20)


def test_moderate_radius_has_fewer_contacts_than_a_small_one():
    # not monotone in general: a 3 m radius makes the planner swerve (see README)
    lo = sum(simulate(P["drone"], 0.1, s, mode="plan", radius=0.75, duration=60)["contacts_per_h"] for s in range(3))
    hi = sum(simulate(P["drone"], 0.1, s, mode="plan", radius=1.5, duration=60)["contacts_per_h"] for s in range(3))
    assert hi < lo


def test_planner_beats_ignoring_on_contacts_in_crowd():
    ig = sum(simulate(P["drone"], 0.3, s, mode="ignore", duration=40)["contacts_per_h"] for s in range(3))
    pl = sum(simulate(P["drone"], 0.3, s, mode="plan", duration=40)["contacts_per_h"] for s in range(3))
    assert pl < ig
