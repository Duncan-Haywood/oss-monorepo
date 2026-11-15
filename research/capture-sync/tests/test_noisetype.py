"""Step 3c: the noise-file split never gives the two devices the same recording, and the committed outputs
say what the README reports."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "gate"))
import noisetype as N  # noqa: E402


def test_split_keeps_duplicate_groups_on_one_side_and_balances():
    dur = {"a": 60, "b": 49, "c": 58, "d": 23, "e": 36, "f": 38, "g": 60, "h": 25}
    side = N.split_files(dur, [["a", "g"]])
    assert side["a"] == side["g"]
    tot = [sum(v for k, v in dur.items() if side[k] == s) for s in (0, 1)]
    assert min(tot) > 0 and abs(tot[0] - tot[1]) <= max(dur.values())


def test_split_uses_every_file_once():
    dur = {f"x{i}": 10 + i for i in range(9)}
    side = N.split_files(dur, [["x1", "x2", "x3"]])
    assert set(side) == set(dur) and set(side.values()) == {0, 1}


def test_committed_step3c_in_distribution_check_holds():
    path = os.path.join(HERE, "..", "experiments", "gate", "noisetype_summary.json")
    s = json.load(open(path))
    for rt in ("0.2", "0.8"):
        for g in ("1.0", "0.25"):
            e = s["T0"][f"{rt}|2.0|{g}"]["mondrian"]
            assert e[2] > 0 and e[1] <= 0.01
