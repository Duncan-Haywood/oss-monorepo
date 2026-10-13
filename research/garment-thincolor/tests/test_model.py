import numpy as np
import pytest
from garment_thincolor.model import *


def test_bare_interface_fresnel():
    r = reflectance(WL, [], 1.5)
    assert r == pytest.approx(0.04, abs=1e-12)


def test_energy_bounded_and_matches_closed_form_single_layer():
    n1, d, ns = 2.4, 80.0, 1.5
    wl = WL
    r01, r12 = (1 - n1) / (1 + n1), (n1 - ns) / (n1 + ns)
    delta = 2 * np.pi * n1 * d / wl
    r = (r01 + r12 * np.exp(-2j * delta)) / (1 + r01 * r12 * np.exp(-2j * delta))
    assert reflectance(wl, [(n1, d)], ns) == pytest.approx(np.abs(r) ** 2, abs=1e-12)
    assert reflectance(wl, [(n1, d)], ns).max() <= 1.0


def test_quarter_wave_film_extremes():
    # n_film^2 = n_sub  -> zero reflectance at design wavelength (antireflection)
    ns = 1.5
    nf = np.sqrt(ns)
    r = reflectance(np.array([550.0]), [(nf, 550 / (4 * nf))], ns)[0]
    assert r < 1e-12
    # high-index quarter-wave film -> maximum
    r2 = reflectance(np.array([550.0]), [(2.4, 550 / 9.6)], ns)[0]
    assert r2 > reflectance(np.array([550.0]), [], ns)[0]


def test_stack_reflectance_grows_with_pairs():
    peaks = [reflectance(np.array([550.0]), quarter_wave_stack(2.4, 1.46, k, 550), 1.53)[0] for k in (1, 2, 4)]
    assert peaks[0] < peaks[1] < peaks[2] and peaks[2] > 0.9


def test_blue_shift_with_angle():
    layers = quarter_wave_stack(2.4, 1.46, 4, 600)
    p0 = peak_wavelength(reflectance(WL, layers, 1.53, 0))
    p45 = peak_wavelength(reflectance(WL, layers, 1.53, 45))
    assert p45 < p0


def test_cmf_sanity_and_white():
    x, y, z = cmf(np.array([560.0]))
    assert 0.9 < y[0] < 1.05
    L, a, b, C, h = lab(np.ones_like(WL))
    assert L == pytest.approx(100.0) and abs(a) < 1e-9 and abs(b) < 1e-9


def test_colour_hue_ordering_for_stacks():
    h = {lam: lab(reflectance(WL, quarter_wave_stack(2.4, 1.46, 5, lam), 1.53))[4] for lam in (450, 530, 620)}
    assert len({round(v) for v in h.values()}) == 3


def test_mass_formula():
    assert areal_mass_g_m2([(2.4, 100.0)], [4230.0]) == pytest.approx(4230 * 100e-9 * 1e3)
