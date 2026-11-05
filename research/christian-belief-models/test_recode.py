"""Recode checks on hand-built rows (no GSS download needed)."""
import sys
from pathlib import Path
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent / 'src'))
import gss  # noqa: E402


def frame(**over):
    base = {c: np.nan for c in gss.COLS}
    base.update(year=2018, id=1, wtssps=1.0, relig=2, reltrad=4, sex=2, born=1, parborn=0, marital=1)
    base.update(over)
    return gss.recode(pd.DataFrame([base]))


def test_tradition_codes():
    assert frame(relig=2).tradition[0] == 'Catholic'
    assert frame(relig=10, reltrad=6).tradition[0] == 'Orthodox'
    assert frame(relig=1, reltrad=1).tradition[0] == 'Evangelical Protestant'
    assert frame(relig=1, reltrad=3).tradition[0] == 'Black Protestant'
    assert frame(relig=4, reltrad=7).tradition[0] == 'Other'


def test_generation():
    assert frame(born=2, parborn=8).generation[0] == 1
    assert frame(born=1, parborn=8).generation[0] == 2
    assert frame(born=1, parborn=1).generation[0] == 2
    assert frame(born=1, parborn=0).generation[0] == 3
    assert np.isnan(frame(born=np.nan, parborn=np.nan).generation[0])


def test_teaching_codes():
    r = frame(attend=7, pray=3, premarsx=1, homosex=2, marsame=4, abany=2, divlaw=3, god=6)
    assert r.attend_weekly[0] == 1 and r.pray_daily[0] == 0
    assert r.premarsx_wrong[0] == 1 and r.homosex_wrong[0] == 0
    assert r.samesex_marr_no[0] == 1 and r.abortion_no[0] == 1
    assert r.divorce_harder[0] == 0 and r.god_no_doubt[0] == 1


def test_not_asked_stays_missing():
    r = frame()
    for t in gss.TARGETS:
        assert np.isnan(r[t][0]), t


def test_ever_divorced_only_for_ever_married():
    assert frame(divorce=1, marital=1).ever_divorced[0] == 1
    assert np.isnan(frame(divorce=1, marital=5).ever_divorced[0])


def test_target_source_never_a_feature():
    for t, (src, _, _) in {**gss.TARGETS, **gss.CATHOLIC_ONLY}.items():
        assert src not in gss.features_for(t)
    assert 'marital' not in gss.features_for('ever_divorced')
