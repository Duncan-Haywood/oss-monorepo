import importlib.util
import itertools
import os

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
spec = importlib.util.spec_from_file_location("sr_test", os.path.join(HERE, "split_rescore.py"))
sr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sr)

PARTS = [(0,) + b for b in itertools.product((0, 1), repeat=2)][1:]
W = {(0, 0, "enr"): 1.0, (1, 1, "enr"): 1.0, (2, 2, "enr"): 1.0,
     (0, 1, "enr"): 5.0, (0, 2, "enr"): 3.0, (1, 2, "enr"): 1.0, (0, 1, "term"): 99.0}


def test_best_separates_heaviest_pair():
    assert sr.best(PARTS, W) == (0, 1, 1)
    assert sr.score(W, (0, 1, 1)) == 4.0


def test_loss_is_one_at_own_optimum_and_above_elsewhere():
    assert sr.loss(W, sr.best(PARTS, W), PARTS) == 1.0
    assert sr.loss(W, (0, 0, 1), PARTS) == 8.0 / 4.0


def test_loss_with_given_reference_split_can_be_below_one():
    assert sr.loss(W, (0, 1, 1), PARTS, ref_split=(0, 0, 1)) == 0.5


def test_gap_and_rank():
    assert sr.gap(W, PARTS) == 6.0 / 4.0
    assert sr.rank(W, (0, 1, 1), PARTS) == 1
    assert sr.rank(W, (0, 0, 1), PARTS) == 3


def test_flips_counts_only_strict_reversals():
    a = {"x": 1.0, "y": 2.0, "z": 3.0}
    b = {"x": 2.5, "y": 2.0, "z": 3.0}
    assert sr.flips(a, b) == [("x", "y")]
    assert sr.flips(a, {"x": 2.0, "y": 2.0, "z": 3.0}) == []
