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
    assert abs(cw - 1.103e-3) < 0.02e-3   # 1.02e-3 before the lambda fix of milestone 3k


def test_m4_low_form_reproduces_pre_3d_value_and_stays_within_10_percent():
    fn = 0.267
    v = fn * math.sqrt(9.80665 * 4.0)
    a, b = run(v, s=2.38), run(v, s=2.38, low_form="m4")
    cw = b["RW"] / (0.5 * RHO_FRESH * v * v * 2.38)
    assert abs(cw - 0.964e-3) < 0.02e-3   # 0.94e-3 before the lambda fix of milestone 3k
    assert abs(b["RT"] / a["RT"] - 1) < 0.10


def _ex(**kw):
    """Holtrop and Mennen (1982) p. 170 numerical example (values as tabulated in Archibald's validation script)."""
    return hm_resistance(25 * 1852 / 3600, 205.0, 32.0, 10.0, 37500.0, 0.980, 0.750, lcb_pct=-0.75, c_stern=10.0,
                         nu=1.1883e-6, s=7381.45, c2=0.7595, c5=0.9592, **kw)


def test_1982_example_form_factor_and_wave_resistance():
    r = _ex(k_form="1982")
    assert abs(r["1+k1"] / 1.156 - 1) < 0.001
    assert abs(r["RW"] / 1e3 / 557.11 - 1) < 0.001   # failed (-15%) while lambda's L/B branch was inverted
    assert abs(r["RA"] / 1e3 / 221.98 - 1) < 0.01


def test_1982_example_sum():
    r = _ex(k_form="1982")
    total = 869.63 * r["1+k1"] + r["RW"] / 1e3 + r["RA"] / 1e3 + 0.049
    assert abs(total / (869.63 * 1.156 + 557.11 + 0.049 + 221.98) - 1) < 0.002


def test_default_form_factor_is_the_1984_one():
    assert abs(_ex()["1+k1"] - 1.1851) < 0.0005


def test_c15_three_way_rule_is_continuous_and_ends_at_zero():
    from marine_hull.holtrop import c15_coefficient
    assert c15_coefficient(1.0, 1 / 400) == -1.69385                      # L^3/V = 400
    just_above = c15_coefficient(1.0, 1 / 512.001)
    assert abs(just_above - (-1.69385)) < 1e-4                          # continuous at 512
    assert abs(c15_coefficient(1.0, 1 / 1726.9) - 0.0) < 1e-3          # reaches 0 at 1726.91
    assert c15_coefficient(1.0, 1 / 2000) == 0.0


def test_slender_hull_wave_resistance_uses_new_c15():
    # L^3/V = 1000: c15 = -0.846, so the hump term differs from the old fixed value
    L, vol = 60.0, 60.0 ** 3 / 1000
    r = hm_resistance(0.3 * math.sqrt(9.80665 * L), L, 5.0, 2.5, vol, 0.85, 0.75)
    assert r["RW"] > 0
