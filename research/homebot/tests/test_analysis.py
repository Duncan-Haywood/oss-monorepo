
from homebot.analysis.stability import com_and_margin
from homebot.analysis.torque import budget, payload_capacity
from homebot.params import DEFAULT


def test_torque_budget_within_peak():
    b = budget(DEFAULT, n_samples=300)
    for r in b["rows"]:
        assert r["payload_vs_peak"] < 0.6, r["joint"]


def test_payload_capacity_increases_when_closer():
    caps = [c["capacity_kg"] for c in payload_capacity(DEFAULT, "continuous")]
    assert caps[0] < caps[1] < caps[2]
    assert 0.05 < caps[0] < 0.5


def test_home_pose_is_statically_stable():
    com, margin, M = com_and_margin(DEFAULT, {"lift": 0.5})
    assert margin > 0.05
