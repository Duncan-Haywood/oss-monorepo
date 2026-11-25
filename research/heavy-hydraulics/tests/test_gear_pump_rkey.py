"""Milestone 7zc: the r key, its central identity, test-row features and the committed verdicts."""
import re
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_rkey_results.txt"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def test_key_is_the_identity_at_the_central_setting():
    import gear_pump_rkey as rk
    from gear_pump_floor import floor
    from excavator_idle_standby import CENTRAL
    b0 = floor(CENTRAL[0], CENTRAL[2])
    assert rk.B0_C == pytest.approx(b0)
    assert rk.B0_C == pytest.approx(1.318, abs=5e-4)          # 7zb's central drag-free bend
    for b in (1.263, 1.373, 1.781):
        assert rk.key_beta(b, b0) == pytest.approx(b)


def test_salami_drag_free_bend_maps_to_the_central_one():
    import gear_pump_rkey as rk
    from gear_pump_floor import floor
    for n in (1.0, 0.5):
        b0 = floor("Salami-curve", n)
        assert b0 == pytest.approx((79 / 64) ** 3)
        assert rk.key_beta(b0, b0) == pytest.approx(rk.B0_C)  # a drag-free pump keys to the same row everywhere


def test_test_rows_read_their_own_feature_training_rows_keep_kws():
    import gear_pump_rkey as rk
    r = {"kwo": 3.0, "kww": 2.5, "kws": 2.2, "kwm": 2.4, "kwb": 2.6, "kwr": 2.7, "kwrx": 2.65, "kwc": 2.9,
         "kw": -0.1, "pls": 2.0, "h": 0.5}
    assert rk.row("owdr", r) == pytest.approx([1.0, 0.1, -0.1])
    assert rk.row("owdr", r, test=True) == pytest.approx([1.0, 0.35, -0.1])
    assert rk.row("owdrx", r, test=True) == pytest.approx([1.0, 0.325, -0.1])
    assert rk.row("owdc", r, test=True) == pytest.approx([1.0, 0.45, -0.1])
    assert rk.row("owdb", r, test=True) == pytest.approx([1.0, 0.3, -0.1])


@pytest.mark.skipif(not RES.exists(), reason="results not generated")
def test_committed_verdicts_match_the_scores():
    text = RES.read_text()
    a = {m.group(1): float(m.group(2)) for m in re.finditer(r"^  (ow\w+)\s+(0\.\d{4})  \(max", text, re.M)}
    assert set(a) == {"owh", "owdm", "owdb", "owdr", "owdrx", "owdc"}
    verdict = dict(re.findall(r"^  (PC\d) .*?: (held|refuted)", text, re.M))
    assert len(verdict) == 4
    assert verdict["PC1"] == ("held" if round(abs(a["owdr"] - a["owdb"]), 4) <= 0.0003 else "refuted")
    assert verdict["PC4"] == ("held" if a["owdc"] > a["owdb"] else "refuted")
