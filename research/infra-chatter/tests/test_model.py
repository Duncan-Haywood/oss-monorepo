import math

import numpy as np

from infra_chatter.model import (Tool, cut_window, h_mean, zoa_lobes, zoa_limit, floquet_radius,
                                 sd_limit, time_domain_growth)

T = Tool()


def test_slotting_coefficient_is_closed_form():
    # integral over 0..pi of sin(phi)(Kt cos + Kn sin) = Kn pi/2; times N/(2 pi)
    assert math.isclose(h_mean(T, 1.0, True), T.teeth * T.kn / 4, rel_tol=1e-12)
    assert math.isclose(h_mean(T, 1.0, False), h_mean(T, 1.0, True), rel_tol=1e-12)


def test_down_milling_low_immersion_has_negative_mean_coefficient():
    assert h_mean(T, 0.1, False) < 0 < h_mean(T, 0.1, True)


def test_cut_window_angles():
    a, b = cut_window(0.5, True)
    assert a == 0 and math.isclose(b, math.pi / 2)
    a, b = cut_window(0.5, False)
    assert math.isclose(a, math.pi / 2) and b == math.pi


def test_minimum_limit_matches_single_mode_analytic():
    w_an = 2 * T.k * T.zeta * (1 + T.zeta) / h_mean(T, 1.0, True)
    w_num = min(l[2].min() for l in zoa_lobes(T, 1.0, True, nf=40000))
    assert math.isclose(w_num, w_an, rel_tol=1e-3)


def test_lobes_satisfy_characteristic_equation():
    h0 = h_mean(T, 1.0, True)
    from infra_chatter.model import frf
    for k, rpm, w in zoa_lobes(T, 0.5, True)[:3]:
        i = len(rpm) // 2
        tau = 60 / (T.teeth * rpm[i])
        f = None
        # recover the chatter frequency from w = -1/(2 h0 Re G) by search on a grid
        fs = np.linspace(T.fn * 0.5, T.fn * 2, 200000)
        g = frf(T, fs)
        h0 = h_mean(T, 0.5, True)
        j = np.argmin(abs(-1 / (2 * h0 * g.real) - w[i]) + 1e9 * (g.real >= 0) + 1e9 * (fs < T.fn))
        om = 2 * math.pi * fs[j]
        lhs = w[i] * h0 * g[j] * (1 - np.exp(-1j * om * tau))
        assert abs(lhs + 1) < 5e-2


def test_free_oscillator_multiplier_without_cutting():
    # w = 0: the delay is inert; the multiplier is the free decay over one delay period
    rpm = 9000.0
    tau = 60 / (T.teeth * rpm)
    wd = T.wn * math.sqrt(1 - T.zeta ** 2)
    assert math.isclose(floquet_radius(T, rpm, 0.0, 0.5, True), math.exp(-T.zeta * T.wn * tau), rel_tol=1e-6)
    assert wd > 0


def test_stable_below_and_unstable_above_zoa_slotting_minimum():
    wmin = min(l[2].min() for l in zoa_lobes(T, 1.0, True))
    rpm = 12000.0
    assert floquet_radius(T, rpm, 0.3 * wmin, 1.0, True) < 1
    assert floquet_radius(T, rpm, 20 * wmin, 1.0, True) > 1


def test_time_domain_agrees_with_floquet_sign():
    rpm, ae = 11000.0, 1.0
    wl = sd_limit(T, rpm, ae, True, 0.02)
    lo = time_domain_growth(T, rpm, 0.8 * wl, ae, True, periods=120, per=200)
    hi = time_domain_growth(T, rpm, 1.25 * wl, ae, True, periods=120, per=200)
    assert lo < 1 < hi


def test_down_milling_low_immersion_zero_order_empty_but_semi_discretisation_unstable_somewhere():
    import pytest
    with pytest.raises(ValueError):
        zoa_lobes(T, 0.1, False)
    assert any(sd_limit(T, r, 0.1, False, 0.02, nw=30) < 0.02 for r in np.arange(5000, 20001, 1000.0))
