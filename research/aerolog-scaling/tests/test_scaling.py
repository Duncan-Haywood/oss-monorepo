import math
import pytest
from aerolog_scaling.scaling import (G, EXPONENTS, airframe, battery_fraction, cf_laminar, cf_mixed,
                             cf_turbulent, isa, model_of, scale)

KW = dict(aspect_ratio=10.0, cl_cruise=0.8, k_form=1.25, s_wet_ratio=2.1, e_oswald=0.8)


def full():
    return airframe(1000.0, 10 ** 0.5 * 3.0, KW["aspect_ratio"], KW["cl_cruise"], KW["k_form"],
                    KW["s_wet_ratio"], KW["e_oswald"])


def test_isa_sea_level_and_11km():
    t, p, rho, mu, a = isa(0)
    assert (t, p) == (288.15, 101325.0)
    assert rho == pytest.approx(1.225, abs=1e-3) and a == pytest.approx(340.29, abs=0.05)
    assert mu == pytest.approx(1.789e-5, rel=2e-3)
    t, p, rho, _, _ = isa(11000)
    assert t == pytest.approx(216.65) and p == pytest.approx(22632, rel=2e-3)


def test_dimensional_consistency_of_exponents():
    # power = force * velocity, energy = power * time, moment = force * length, inertia = mass * length^2
    e = EXPONENTS
    assert e["power"] == e["force"] + e["velocity"]
    assert e["energy"] == e["power"] + e["time"]
    assert e["moment"] == e["force"] + e["length"]
    assert e["inertia"] == e["mass"] + 2 * e["length"]
    assert e["velocity"] == pytest.approx(e["length"] - e["time"])
    assert e["acceleration"] == 0.0 and e["reynolds"] == e["velocity"] + e["length"]


@pytest.mark.parametrize("n", [0.5, 0.2, 0.1])
def test_model_reproduces_froude_table(n):
    f, m = full(), model_of(full(), n, **KW)
    assert m["mass"] / f["mass"] == pytest.approx(scale("mass", n))
    assert m["v"] / f["v"] == pytest.approx(scale("velocity", n))  # same CL, same rho
    assert m["re"] / f["re"] == pytest.approx(scale("reynolds", n), rel=1e-9)  # same mu, rho
    assert m["mach"] / f["mach"] == pytest.approx(scale("mach", n))


def test_skin_friction_known_values():
    assert cf_turbulent(1e6) == pytest.approx(0.455 / 6 ** 2.58)
    assert cf_laminar(1e6) == pytest.approx(0.001328)
    assert cf_mixed(1e7) < cf_turbulent(1e7)
    assert cf_mixed(2e5) == cf_laminar(2e5)
    assert cf_mixed(5.0001e5) == pytest.approx(cf_laminar(5e5), rel=0.15)  # Schlichting's A/Re form is only roughly continuous at Re_t


def test_tripped_smaller_model_has_more_drag_and_lower_ld():
    f = airframe(1000.0, 3 * 10 ** 0.5, 10.0, 0.8, 1.25, 2.1, 0.8, tripped=True)
    lds = [model_of(f, n, **KW, tripped=True)["ld"] for n in (1.0, 0.5, 0.2, 0.1)]
    assert lds == sorted(lds, reverse=True) and lds[-1] < lds[0]


def test_power_scales_worse_than_n35_because_cd0_rises():
    f = airframe(1000.0, 3 * 10 ** 0.5, 10.0, 0.8, 1.25, 2.1, 0.8, tripped=True)
    m = model_of(f, 0.1, **KW, tripped=True)
    ratio = m["p_aero"] / f["p_aero"]
    assert ratio > scale("power", 0.1)


def test_battery_fraction_breguet():
    # 100 km at L/D 12, 250 Wh/kg cells, 0.7 efficiency
    bf = battery_fraction(12, 100e3, 250 * 3600, 0.7)
    assert bf == pytest.approx(100e3 * G / (12 * 250 * 3600 * 0.7))


def test_exponents_match_nasa_tp1435_table4():
    # Rows read from Table 4(a) and (b) of Wolowicz, Brown and Gilbert, NASA TP-1435 (1979), Froude
    # scaling column, same fluid density: velocity n^1/2, time n^1/2, angular rate n^-1/2,
    # linear acceleration 1, oscillatory frequency n^-1/2, mass n^3, mass moment of inertia n^5.
    paper = {"velocity": 0.5, "time": 0.5, "angular_rate": -0.5, "acceleration": 0.0,
             "frequency": -0.5, "mass": 3.0, "inertia": 5.0, "length": 1.0}
    for q, x in paper.items():
        assert EXPONENTS[q] == x, q
