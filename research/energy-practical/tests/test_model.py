import pytest
from energy_practical import gaps, h2_wt_percent, PRACTICAL, RTE, H2_SYSTEM, ceilings


def test_ceilings_match_energy_density_results():
    c = ceilings()
    assert c["lead_acid"] == pytest.approx(170, abs=1)
    assert c["li_ion_lco"] == pytest.approx(380, abs=1)
    assert c["vrfb_1p6"] == pytest.approx(27.0, abs=0.1)


def test_every_practical_figure_is_below_its_ceiling():
    for e, ce, lo, hi in gaps():
        assert 0 < lo <= hi < 1, e["key"]


def test_ncr18650b_ratio():
    e, ce, lo, hi = next(g for g in gaps() if g[0]["key"] == "ncr18650b")
    assert lo == pytest.approx(243 / 380, abs=0.01)


def test_h2_system_share_and_ceiling():
    p, (c1, c2) = h2_wt_percent()
    assert p == pytest.approx(5.13, abs=0.01)
    assert c1 == pytest.approx(41.3, abs=0.1) and c2 == pytest.approx(23.8, abs=0.1)
    assert 5.6 / (p / 100) == pytest.approx(109, abs=1)


def test_every_entry_has_source_and_provenance():
    for e in PRACTICAL:
        assert e["source"] and e["how"] in ("primary", "secondary")
    assert H2_SYSTEM["how"] == "primary"
    assert all(0 < v <= 100 and src for _, v, src in RTE)


def test_flow_battery_range_does_not_exceed_ceiling():
    e, ce, lo, hi = next(g for g in gaps() if g[0]["key"] == "vrfb")
    assert hi < 1
