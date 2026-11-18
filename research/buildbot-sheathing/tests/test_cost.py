import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from buildbot_sheathing import cost as K  # noqa: E402


def test_crf_closed_form():
    # 10 years at 5%: the textbook factor 0.1295
    assert K.crf(0.05, 10) == pytest.approx(0.129505, rel=1e-5)
    # vanishing interest tends to 1/years
    assert K.crf(1e-9, 8) == pytest.approx(1 / 8, rel=1e-6)


def _one(**over):
    p = {k: np.array([v[0]]) for k, v in K.draw(1, 0).items()}
    p.update({k: np.array([v]) for k, v in over.items()})
    return p


def test_hand_cost_at_taskbook_mid():
    p = _one(hand_mult=1.0, burden=1.3)
    # 8.5 person-minutes at $29.12 x 1.3
    assert K.hand_cost(p)[0] == pytest.approx(8.5 / 60 * 29.12 * 1.3)


def test_ownership_falls_with_volume_until_capacity():
    p = _one()
    reads = {"n": 5, "ledger": True}
    c = [K.robot_cost("base", p, v, 0.0, reads, False)["own"][0] for v in (10, 100, 1000, 100000, 1000000)]
    assert c[0] > c[1] > c[2] > c[3]
    assert c[3] == pytest.approx(c[4])          # capped at the machine's hours: a fleet beyond that


def test_ownership_matches_hand_calculation():
    p = _one(interest=0.06, site_life_y=5.0, site_upkeep=0.1, g1_usd=16000.0, base_usd=20000.0)
    reads = {"n": 5, "ledger": True}
    r = K.robot_cost("base", p, 100, 0.0, reads, False)
    annual = 36000.0 * (K.crf(0.06, 5.0) + 0.1)
    assert r["own"][0] == pytest.approx(annual / (100 * K.SHEETS_PER_HOUSE))


def test_stud_charged_only_when_doubled():
    p = _one()
    reads = {"n": 5, "ledger": True}
    a = K.robot_cost("gantry", p, 100, 0.0, reads, False)["total"][0]
    b = K.robot_cost("gantry", p, 100, 0.0, reads, True)["total"][0]
    assert b - a == pytest.approx(K.stud_cost(p)[0])


def test_rework_adds_seconds_and_dollars():
    p = _one(t_fix=30.0)
    reads = {"n": 11, "ledger": True}
    s0 = K.robot_seconds("h1", p, 0.0, reads)[0]
    s1 = K.robot_seconds("h1", p, 2.0, reads)[0]
    assert s1 - s0 == pytest.approx(60.0)
    assert K.robot_cost("h1", p, 100, 2.0, reads, False)["total"][0] > K.robot_cost("h1", p, 100, 0.0, reads, False)["total"][0]


def test_draw_ranges():
    p = K.draw(2000, 3)
    assert p["stud_usd"].min() >= 3.41 and p["stud_usd"].max() <= 5.56
    assert p["h1_usd"].min() >= 90000 and p["g1_usd"].max() <= 21600
    assert 40000 <= p["gantry_usd"].min() and p["gantry_usd"].max() <= 600000
