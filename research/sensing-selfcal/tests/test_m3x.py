"""Milestone 3x: leave-one-sequence-out choice of the update rule (experiments/m3x_loso)."""
import importlib.util, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_s = importlib.util.spec_from_file_location("m3x_an", os.path.join(HERE, "..", "experiments", "m3x_loso", "analyse.py"))
an = importlib.util.module_from_spec(_s)
_s.loader.exec_module(an)


def _bl(x, sd, ref=500.0):
    return [{"ref": {"board": ref}, "tf": (xi, si)} for xi, si in zip(x, sd)]


def test_curves_with_one_rule_match_milestone_3w_score():
    bl = _bl([505.0, 490.0, 512.0, 498.0, 501.0], [4.0, 6.0, 3.0, 5.0, 2.0])
    s = an.m3w.score(bl)
    for r in an.RULES:
        c = an.curves(bl, [r] * len(bl))
        assert abs(c["worst_regret"] - s["rules"][r]["worst_regret"]) < 1e-12
        assert np.allclose(c["med"], s["rules"][r]["med"])


def test_mixed_rules_apply_per_block():
    bl = _bl([510.0, 510.0], [5.0, 5.0])
    c = an.curves(bl, ["never", "always"])
    # at delta = 0: never keeps 500 (0%), always takes 510 (2%): median of {0, 2} = 1
    assert abs(c["med"][0] - 1.0) < 1e-12


def test_loso_chooses_on_training_sequences_only():
    perfect = _bl([500.0] * 4, [5.0] * 4)          # always is minimax on these
    bs = {"a": perfect, "b": perfect, "c": _bl([550.0] * 4, [1.0] * 4)}
    out = an.loso(bs)
    assert out["folds"]["c"]["chosen"] == "always"  # chosen without c's 10%-off pools
    assert out["folds"]["c"]["test_worst_regret"]["always"] == 10.0
    assert out["n"] == 12
