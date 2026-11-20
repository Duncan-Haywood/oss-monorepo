import importlib.util
import os
import sys

import numpy as np

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)
spec = importlib.util.spec_from_file_location("fast_tables_test", os.path.join(HERE, "fast_tables.py"))
ft = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ft)
import px4_height_run as phr  # noqa: E402


def _sup(m, rng, bins=120, spread=3.0):
    return {(i, j): np.sort(rng.normal(0.0, spread, bins)) + (0.0 if i == j else rng.normal(0, 2))
            for i in range(m) for j in range(i, m)}


def test_kernel_tables_match_the_loop_tables():
    rng = np.random.default_rng(5)
    scales = phr.mix_scales(np.array([0.3, 0.5, 0.8, 1.1, 1.6]), n=16)
    kern = ft.Kernel(scales)
    sup = _sup(4, rng)
    for h, k in ((5.0, 6), (13.333333, 4), (24.0, 3), (41.0, 1)):
        a = phr.tables_mix(sup, 4, h, scales, k)
        b = ft.tables_kernel(kern, sup, 4, h, k)
        assert np.abs(a[0] - b[0]).max() < 1e-6
        assert np.abs(a[1] - b[1]).max() < 1e-6
        assert np.allclose(b[0], np.transpose(b[0], (1, 0, 2)))


def test_kernel_is_even_and_vanishes_far_out():
    kern = ft.Kernel([0.5, 1.0])
    y = np.linspace(0.0, 20.0, 41)
    assert np.allclose(kern(y), kern(-y))
    assert kern(np.array([kern.ymax + 1.0]))[0] == 0.0
    assert 0.99 < kern(np.array([0.0]))[0] <= 1.0


def test_mixed_support_lengths_are_grouped():
    rng = np.random.default_rng(7)
    scales = np.array([0.4, 0.9])
    kern = ft.Kernel(scales)
    sup = _sup(3, rng)
    sup[(0, 1)] = sup[(0, 1)][:40]
    a = phr.tables_mix(sup, 3, 9.0, scales, 5)
    b = ft.tables_kernel(kern, sup, 3, 9.0, 5)
    assert np.abs(a[0] - b[0]).max() < 1e-6 and np.abs(a[1] - b[1]).max() < 1e-6


def test_k_widest_keeps_one_spacing_per_band_count():
    hs = ft.k_widest(ft.HG, 12)
    ks = [ft.dr.bb.k_cap(ft.H, h, 12) for h in hs]
    assert len(set(ks)) == len(ks)
    assert set(ks) == {ft.dr.bb.k_cap(ft.H, h, 12) for h in ft.HG}
    for h in ft.HG:
        k = ft.dr.bb.k_cap(ft.H, h, 12)
        assert h <= hs[ks.index(k)]
