"""Milestone 25: reproduce.py re-runs an experiment in a copy and compares it with the committed file."""
import importlib.util
import os

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("reproduce", os.path.join(HERE, "..", "reproduce.py"))
RP = importlib.util.module_from_spec(spec)
spec.loader.exec_module(RP)


def test_every_experiment_directory_is_listed():
    found = {d for d in os.listdir(os.path.join(HERE, "..", "experiments"))
             if os.path.exists(os.path.join(HERE, "..", "experiments", d, "run.py"))}
    assert found == set(RP.EXPERIMENTS)


def test_only_timings_are_left_out():
    keep = RP.stable(["(run time 2099 s; 4 CPUs; python 3.13.18, numpy 2.5.3, scipy 1.18.1)", "545.2 s", "wall time 1354 s on 4 CPUs",
                      "all 108 cells: min 17.9 s, median 35.8 s, max 65.5 s",
                      "cyclic runs 72 (2099 s); largest residual 1.0e-07 FU",
                      "single 2x three 131 s (24 s rework)"])
    assert keep == ["all 108 cells: min 17.9 s, median 35.8 s, max 65.5 s",
                    "cyclic runs 72 (<time> s); largest residual 1.0e-07 FU",
                    "single 2x three 131 s (24 s rework)"]


def test_compare_flags_a_changed_number(tmp_path):
    a, b = tmp_path / "a.txt", tmp_path / "b.txt"
    a.write_text("x = 0.5833\n(run time 20 s)\n")
    b.write_text("x = 0.5814\n(run time 23 s)\n")
    d = RP.compare(a, b)
    assert "-x = 0.5833" in d and "+x = 0.5814" in d and not any("run time" in ln for ln in d)


def test_m7_cost_reproduces_from_its_committed_inputs():
    pytest.importorskip("numpy")
    assert RP.check(["m7_cost"], RP.sys.executable) == 0


def test_m6_seat_time_column_is_masked_and_the_rest_compared():
    keep = RP.stable(["drake     +0.00002   0.00142      0.00325      0.00466  0.453",
                      "2x       1  low   single | 0.4170      0.4258     0.4256       0.02"])
    assert keep == ["drake     +0.00002   0.00142      0.00325      0.00466  <time>",
                    "2x       1  low   single | 0.4170      0.4258     0.4256       0.02"]
    assert RP.stable(["drake     +0.00003   0.00142      0.00325      0.00466  0.114"]) != keep[:1]
