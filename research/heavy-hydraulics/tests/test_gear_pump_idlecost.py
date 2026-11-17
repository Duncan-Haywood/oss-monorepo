"""Milestone 7i: the three rules' design columns are what LOG.md registers, a pooled fit recovers a planted
idle-cost rule exactly, holding a condition out keeps it out of training, and the committed results reproduce 7h
and carry every verdict."""
import re
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_idlecost_results.txt"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def _toy(beta, rule):
    import gear_pump_idlecost as ic
    keys = ["a", "b", "c", "d"]
    grp = {"a": "A", "b": "A", "c": "C", "d": "D"}
    kwo = {"a": 2.0, "b": 2.5, "c": 3.1, "d": 2.2}
    kw = {"a": 0.01, "b": -0.02, "c": 0.03, "d": 0.0}
    res = []
    for pls, s in ((2.9, 0.38), (1.5, 0.38), (3.0, 0.2), (2.9, 0.5), (1.6, 0.38)):
        c = {"pls": pls, "share": s, "kwo": kwo, "kw": kw, "keys": keys, "grp": grp, "setting": ("x", 0, 1)}
        c["cells"] = {(f, g): float(np.dot(beta, ic.columns(rule, kwo[g], kw[f], pls, s))) for f in keys for g in keys}
        res.append(c)
    return res


def test_columns_match_the_registered_rules():
    import gear_pump_idlecost as ic
    assert ic.columns("ow", 3.0, -0.1, 2.0, 0.4) == [1.0, 3.0, -0.1]
    assert list(ic.columns("owL", 3.0, -0.1, 2.0, 0.4)) == [1.0, 3.0, -0.1, 2.0]
    assert np.allclose(ic.columns("owC", 3.0, -0.1, 2.0, 0.4), [1.0, 1.2, -0.1, 0.8])


def test_pooled_fit_recovers_a_planted_rule_and_held_out_error_is_zero():
    import gear_pump_idlecost as ic
    beta = np.array([0.80, 0.05, -0.42, -0.03])
    res = _toy(beta, "owC")
    assert np.allclose(ic.fit(res, "owC"), beta)
    for rms, bias in ic.held_out(res, "owC", lambda j, i: i == j):
        assert rms < 1e-10 and abs(bias) < 1e-10


def test_held_condition_is_out_of_training():
    import gear_pump_idlecost as ic
    res = _toy(np.array([0.80, 0.02, -0.42, -0.03]), "owL")
    for (f, g) in res[2]["cells"]:
        res[2]["cells"][(f, g)] += 0.05 if f != g else 0.0     # corrupt only off-diagonal cells of condition 2
    out = ic.held_out(res, "owL", lambda j, i: i == j)
    assert out[2][0] < 1e-10                                # condition 2 predicted from the other four only


def test_committed_results_reproduce_7h_and_carry_every_verdict():
    text = RES.read_text()
    for k in range(1, 7):
        assert re.search(rf"IC{k} .*: (held|refuted)", text)
    assert re.search(r"Check against 7h's results file, .*: largest difference 0\.0000", text)
    assert re.search(r"Check, central condition \(i\) ow against 7g's 0\.0056: [+-]0\.0000", text)
