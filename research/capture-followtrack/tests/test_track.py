import math
from capture_follow.model import PLATFORMS, Walker, PED_V
from capture_followplan.plan import simulate
from capture_followtrack.track import Tracker
import random

P = {p.name: p for p in PLATFORMS}


def test_tracker_velocity_converges_on_a_walker():
    rng = random.Random(1)
    w = Walker(rng, PED_V)
    t = Tracker(1, sigma=0.1, latency=0.0)
    for _ in range(80):
        w.step(0.25)
        seen, vels = t.update([w])
    assert abs(math.hypot(*vels[0]) - PED_V) < 0.5


def test_zero_noise_zero_latency_close_to_truth():
    a = simulate(P["drone"], 0.1, 2, mode="plan", duration=60)
    b = simulate(P["drone"], 0.1, 2, mode="plan", duration=60, estimator=Tracker(2, sigma=0.0, latency=0.0))
    assert abs(a["contacts_per_h"] - b["contacts_per_h"]) <= 60 and abs(a["framed"] - b["framed"]) < 0.1


def test_default_unchanged_by_estimator_hook():
    assert simulate(P["drone"], 0.1, 3, mode="plan", duration=20) == simulate(P["drone"], 0.1, 3, mode="plan", duration=20, estimator=None)


def test_heavy_noise_costs_contacts():
    n = sum(simulate(P["drone"], 0.1, s, mode="plan", duration=60)["contacts_per_h"] for s in range(3))
    m = sum(simulate(P["drone"], 0.1, s, mode="plan", duration=60, estimator=Tracker(s, sigma=1.0, latency=1.0))["contacts_per_h"] for s in range(3))
    assert m > n
