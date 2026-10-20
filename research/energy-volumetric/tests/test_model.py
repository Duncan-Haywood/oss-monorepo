import pytest
from energy_volumetric import volumetric_row, reactant_volume_l, store_wh_per_l, DENSITY, H2_LIQUID


def test_lithium_sulfur_volume():
    # 2 Li (13.88 g / 0.534) + S (32.06 g / 2.07) = 25.99 + 15.49 mL
    v = reactant_volume_l([(2, "Li"), (1, "S")])
    assert v == pytest.approx((13.88 / 0.534 + 32.06 / 2.07) / 1000, rel=1e-3)


def test_air_breathing_is_never_lower():
    for k in ["lead_acid", "zn_air", "al_air", "li_o2", "h2_o2"]:
        r = volumetric_row(k)
        assert r["wh_l_air"] >= r["wh_l_all"] - 1e-9


def test_no_oxygen_means_no_difference():
    r = volumetric_row("li_s")
    assert r["wh_l_air"] == pytest.approx(r["wh_l_all"])


def test_hydrogen_700_bar_matches_density_report():
    # 32,678 Wh/kg x 0.0402 kg/L = 1,314 Wh/L (energy-density section F)
    assert volumetric_row("h2_o2")["wh_l_air"] == pytest.approx(1314, rel=2e-3)


def test_liquid_h2_denser_and_density_restored():
    liq = volumetric_row("h2_o2", h2_density=H2_LIQUID)["wh_l_air"]
    assert liq > 1.7 * volumetric_row("h2_o2")["wh_l_air"]
    assert DENSITY["H2"] == 0.0402


def test_unknown_couple():
    with pytest.raises(KeyError):
        volumetric_row("nope")


def test_store_scaling():
    assert store_wh_per_l(100.0, 1.6) == pytest.approx(160.0)
