"""Milestone 7h: the 22 conditions are the 18 idle settings at S = 0.38 plus four other shares, the frozen-slope
score refits only the intercept, and the committed results reproduce 7g at the central condition and carry every
verdict."""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_settings_results.txt"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def test_conditions_cover_every_setting_and_share_once():
    import gear_pump_settings as st
    from excavator_idle_standby import CENTRAL, SETTINGS, SHARES, S_C
    assert len(st.CONDITIONS) == 22 == len(set(st.CONDITIONS))
    assert sum(c == (CENTRAL, S_C) for c in st.CONDITIONS) == 1
    assert {s for s, x in st.CONDITIONS if x == S_C} == set(SETTINGS)
    assert {x for s, x in st.CONDITIONS if s == CENTRAL} == set(SHARES)


def test_frozen_slope_refits_only_the_intercept():
    import gear_pump_settings as st
    keys = ["a", "b", "c"]
    grp = {k: k for k in keys}
    feat = {"kwo": {"a": 1.0, "b": 2.0, "c": 3.0}, "w": {"a": 0.0, "b": 0.0, "c": 0.0}}
    cells = {(f, g): 0.5 + 0.1 * feat["kwo"][g] for f in keys for g in keys}
    err = st.frozen_slope_lofo(cells, keys, grp, feat, 0.1, -0.4)
    assert all(abs(v) < 1e-12 for v in err.values())
    cells = {c: v + 0.02 for c, v in cells.items()}
    err = st.frozen_slope_lofo(cells, keys, grp, feat, 0.1, -0.4)
    assert all(abs(v) < 1e-12 for v in err.values())


def test_committed_results_reproduce_7g_and_carry_every_verdict():
    text = RES.read_text()
    for k in range(1, 7):
        assert re.search(rf"ST{k} .*: (held|refuted)", text)
    assert re.search(r"Check, central condition against 7g: two [+-]0\.0000, w [+-]0\.0000, o [+-]0\.0000, "
                     r"ow [+-]0\.0000", text)
