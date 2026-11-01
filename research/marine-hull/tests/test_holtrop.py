import math
from marine_hull.holtrop import hm_resistance
from marine_hull.hull import RHO_FRESH, cf_ittc57
from marine_hull.michell import wigley_volume

VOL = wigley_volume(4.0, 0.4, 0.25)


def run(v, **kw):
    return hm_resistance(v, 4.0, 0.4, 0.25, VOL, 2 / 3, 2 / 3, rho=RHO_FRESH, nu=1.1386e-6, **kw)


def test_wigley_volume_is_four_ninths_box():
    assert abs(VOL - 4 / 9 * 4 * 0.4 * 0.25) < 1e-6


def test_friction_is_ittc_on_given_area():
    r = run(1.0, s=2.38)
    assert abs(r["RF"] - 0.5 * RHO_FRESH * 2.38 * cf_ittc57(1.0 * 4.0 / 1.1386e-6)) < 1e-9


def test_total_is_sum_of_parts():
    r = run(1.67, s=2.38)
    assert abs(r["RT"] - (r["RF"] * r["1+k1"] + r["RW"] + r["RA"])) < 1e-9


def test_wave_scale_zero_removes_wave_term():
    assert run(1.67, wave_scale=0.0)["RW"] == 0.0


def test_wave_resistance_rises_with_speed_below_fn_04():
    ws = [run(fn * math.sqrt(9.80665 * 4.0))["RW"] for fn in (0.15, 0.2, 0.25, 0.3)]
    assert all(b > a for a, b in zip(ws, ws[1:]))


def test_continuous_across_fn_04_blend():
    g = math.sqrt(9.80665 * 4.0)
    lo, hi = run(0.3999 * g)["RW"], run(0.4001 * g)["RW"]
    assert abs(hi / lo - 1) < 0.02


def test_low_speed_wave_term_uses_m2_not_m4():
    # m2 = c15 Cp^2 exp(-0.1/Fn^2); the Fn>0.55 exponent m4 was used by mistake before milestone 3d.
    fn = 0.267
    r = run(fn * math.sqrt(9.80665 * 4.0), s=2.38)
    cw = r["RW"] / (0.5 * RHO_FRESH * (fn * math.sqrt(9.80665 * 4.0)) ** 2 * 2.38)
    assert abs(cw - 1.02e-3) < 0.02e-3
