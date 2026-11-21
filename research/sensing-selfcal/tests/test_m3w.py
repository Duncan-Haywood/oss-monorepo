"""Milestone 3w: update rules for a held focal length (experiments/m3w_update)."""
import importlib.util, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_s = importlib.util.spec_from_file_location("m3w_an", os.path.join(HERE, "..", "experiments", "m3w_update", "analyse.py"))
an = importlib.util.module_from_spec(_s)
_s.loader.exec_module(an)


def test_shrink_weight_is_positive_part_and_handles_zero():
    w = an.shrink_weight(np.array([0.0, 1.0, 2.0, 10.0]), np.array([1.0, 1.0, 1.0, 1.0]))
    assert w[0] == 0.0 and w[1] == 0.0           # |d| <= sd: keep the held value
    assert abs(w[2] - 0.75) < 1e-12 and abs(w[3] - 0.99) < 1e-12


def test_rules_on_known_values():
    x, sd, held = np.array([510.0]), np.array([5.0]), np.array([500.0])
    assert an.update("never", x, sd, held)[0] == 500.0
    assert an.update("always", x, sd, held)[0] == 510.0
    assert an.update("gate2.0", x, sd, held)[0] == 500.0     # |d| = 2 sd, strict inequality
    assert an.update("gate1.0", x, sd, held)[0] == 510.0
    assert abs(an.update("shrink", x, sd, held)[0] - 507.5) < 1e-12


def _bl(x, sd, ref=500.0):
    return [{"ref": {"board": ref}, "tf": (xi, si)} for xi, si in zip(x, sd)]


def test_regret_is_zero_for_always_with_perfect_pools():
    s = an.score(_bl([500.0] * 6, [5.0] * 6))
    assert s["rules"]["always"]["worst_regret"] == 0.0
    assert s["rules"]["never"]["worst_regret"] == 10.0      # keeps a 10% stale value
    assert s["minimax"] == "always"
    assert s["rules"]["gate2.0"]["argworst_delta"] == 2.0   # last delta the 2-sd gate does not fire
