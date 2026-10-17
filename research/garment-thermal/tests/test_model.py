import warnings
from dataclasses import replace
import pytest
from garment_thermal.model import Fabric, Env, pmv, ppd, dry_loss, two_node, comfort_equivalent_shift, fcl

B = Fabric()


def test_iso_example_22c():
    p = pmv(1.2, B, Env(22, 22, 0.1, 60))
    assert p == pytest.approx(-0.75, abs=0.02)
    assert ppd(p) == pytest.approx(16.9, abs=0.5)


def test_matches_pythermalcomfort():
    mod = pytest.importorskip("pythermalcomfort.models")
    warnings.simplefilter("ignore")
    for ta, met, clo in [(20, 1.2, 0.7), (26, 1.0, 0.5), (30, 1.6, 0.4)]:
        r = mod.pmv_ppd_iso(tdb=ta, tr=ta, vr=0.1, rh=50, met=met, clo=clo)
        ref = r["pmv"] if isinstance(r, dict) else r.pmv
        assert pmv(met, Fabric(clo=clo), Env(ta, ta, 0.1, 50)) == pytest.approx(ref, abs=0.02)


def test_no_optics_no_sun_means_tau_and_eps_baseline_is_iso():
    assert dry_loss(33.0, B, Env(20, 20))[0] == pytest.approx(dry_loss(33.0, replace(B, alpha_sol=0.0), Env(20, 20))[0])


def test_more_insulation_is_warmer():
    e = Env(18, 18)
    assert pmv(1.2, Fabric(clo=1.0), e) > pmv(1.2, Fabric(clo=0.5), e)


def test_ir_transparent_cools_in_a_room_at_skin_warmer_than_surroundings():
    e = Env(24, 24)
    assert pmv(1.2, replace(B, tau_ir=0.8), e) < pmv(1.2, B, e)


def test_solar_absorptance_matters_only_with_sun():
    dark, white = replace(B, alpha_sol=0.9), replace(B, alpha_sol=0.1)
    assert pmv(1.2, dark, Env(25, 25)) == pytest.approx(pmv(1.2, white, Env(25, 25)))
    sun = Env(25, 25, 0.5, 40, 200.0)
    assert pmv(1.2, dark, sun) > pmv(1.2, white, sun)


def test_low_e_outer_surface_warms_when_surroundings_are_colder_and_cools_when_hotter():
    low = replace(B, eps_out=0.2)
    assert pmv(1.2, low, Env(20, 20)) > pmv(1.2, B, Env(20, 20))
    assert pmv(1.2, low, Env(26, 36)) < pmv(1.2, B, Env(26, 36))


def test_zero_shift_for_same_fabric_and_sign_convention():
    e = Env(26, 26)
    assert comfort_equivalent_shift(1.2, B, B, e) == pytest.approx(0.0, abs=1e-6)
    assert comfort_equivalent_shift(1.2, B, replace(B, tau_ir=0.8), e) < 0


def test_two_node_neutral_room_is_near_set_points():
    r = two_node(1.2, B, Env(25, 25, 0.1, 50), minutes=120)
    assert 33.0 < r["tsk"] < 35.0 and 36.5 < r["tcr"] < 37.2


def test_two_node_hot_humid_sweats_more_than_neutral_and_poor_vapour_cloth_wetter():
    hot = Env(34, 34, 0.1, 60)
    a = two_node(1.2, B, hot, 120)
    assert a["sweat_g"] > two_node(1.2, B, Env(25, 25, 0.1, 50), 120)["sweat_g"]
    assert two_node(1.2, replace(B, im=0.2), hot, 120)["wet"] > a["wet"]


def test_fcl_continuous_enough():
    assert fcl(0.5) > fcl(0.1) > 1.0
