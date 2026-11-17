"""Milestone 7i: the idle-hour rule's design rows, its held-out scoring and the committed verdicts."""
import re
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_onerule_results.txt"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def test_idle_hours_and_design_rows():
    import gear_pump_onerule as one
    assert abs(one.hours(0.38) - 0.38 / 0.62) < 1e-12
    assert abs(one.hours(0.50) - 1.0) < 1e-12
    assert one.row("owh", 3.0, -0.1, 2.0, 0.5) == [1.0, 1.5, -0.1, 1.0]
    assert one.row("owd", 3.0, -0.1, 2.0, 0.5) == [1.0, 0.5, -0.1]
    assert one.row("owl", 3.0, -0.1, 2.0, 0.5) == [1.0, 3.0, -0.1, 2.0]


def test_held_out_recovers_an_exact_idle_hour_rule():
    import gear_pump_onerule as one
    rng = np.random.default_rng(1)
    keys = list("abcdef")
    grp = {k: k for k in keys}
    kwo = {k: float(rng.uniform(2, 4)) for k in keys}
    kw = {k: float(rng.uniform(-0.1, 0.1)) for k in keys}
    recs = []
    for c, (pls, s) in enumerate([(3.0, 0.38), (1.5, 0.38), (3.0, 0.2), (1.5, 0.5)]):
        h = one.hours(s)
        for f in keys:
            for g in keys:
                e = 0.75 + 0.03 * h * kwo[g] - 0.4 * kw[f] - 0.035 * h * pls
                recs.append({"c": c, "f": f, "g": g, "kwo": kwo[g], "kw": kw[f], "pls": pls, "h": h, "e50": e})
    err = one.held_out(recs, grp, {1}, "owh")
    assert len(err) == len(keys) and max(abs(v) for v in err.values()) < 1e-10
    assert max(abs(v) for v in one.held_out(recs, grp, {3}, "ow").values()) > 1e-3


def test_committed_results_check_7h_and_carry_every_verdict():
    text = RES.read_text()
    for k in range(1, 8):
        assert re.search(rf"SI{k} .*: (held|refuted)", text)
    assert re.search(r"max difference 0\.0000 over 22 of 22", text)
