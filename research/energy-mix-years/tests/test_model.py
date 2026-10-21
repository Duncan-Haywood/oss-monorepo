import pandas as pd
import pytest

pytest.importorskip("pypsa")
from energy_mix_years import model  # noqa: E402

H = 24 * 14


def test_every_year_has_8760_hours_and_valid_factors():
    for y in model.YEARS:
        d = model.load_year(y)
        assert len(d) == 8760 and d.index.is_monotonic_increasing and d.index[0].year == y
        assert d[["solar_cf", "wind_cf"]].min().min() >= 0 and d[["solar_cf", "wind_cf"]].max().max() <= 1
        assert d.isna().sum().sum() == 0


def test_annual_demand_and_capacity_factors_are_plausible():
    # ENTSO-E reports 479 to 499 TWh for Germany in 2015-2019; onshore wind CF 0.23 to 0.28; solar 0.10 to 0.11
    for y in model.YEARS:
        d = model.load_year(y)
        assert 470e6 < d.load_mw.sum() < 505e6
        assert 0.20 < d.wind_cf.mean() < 0.30 and 0.09 < d.solar_cf.mean() < 0.12


def test_2019_matches_the_sibling_projects_file():
    sib = pd.read_csv(model.HERE.parent / "energy-mix" / "data" / "de2019.csv")
    mine = pd.read_csv(model.HERE / "data" / "de2019.csv")
    assert len(sib) == len(mine) == 8760
    assert (sib.load_mw - mine.load_mw).abs().max() < 1 and (sib.wind_cf - mine.wind_cf).abs().max() < 1e-3


def test_two_week_slice_balances_and_respects_the_cap():
    n, d, s = model.run(2017, hours=H, co2_frac=0.0)
    gen = n.generators_t.p.sum(axis=1)
    assert s["gas_share"] == pytest.approx(0, abs=1e-6)
    assert gen.sum() >= d.load_mw.sum() - 1  # served, with storage losses on top
