import importlib.util
import math
import os

import pytest

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")


def _mod(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


pr = _mod("pressure_ref_test", "pressure_ref.py")

LINE = ("0224744860947892014010101517+40639-073762FM-15+0007KJFK V0302905N008252200059N0160935N5-00115-01175102385"
        "ADDAA101000095GA1045+013725991GD12991+0137259GF104991990990013721991991MA1102405102325OC101085R")


def test_parse_isd_line_reads_ma1():
    t, alt, stn, rtype = pr.parse_isd_line(LINE)
    assert rtype == "FM-15"
    assert t == 60 + 51
    assert alt == 1024.0 and stn == 1023.2
    assert pr.latlon(LINE) == (40.639, -73.762)


def test_parse_rejects_non_metar_and_bad_quality():
    assert pr.parse_isd_line(LINE.replace("FM-15", "FM-12")) is None
    bad = LINE.replace("MA1102405102325", "MA1102403102329")
    assert pr.parse_isd_line(bad)[1:3] == (None, None)


def test_mismatch_is_zero_for_constant_pressure_and_scales_by_m_per_hpa():
    rows = [(float(t), 1013.0, 1012.0) for t in range(0, 600, 60)]
    assert all(abs(d) < 1e-12 for _, d in pr.mismatch_samples(rows, rows, step_min=7, t_end=540))
    ramp = [(float(t), 1013.0 + t / 60.0, 1012.0 + t / 60.0) for t in range(0, 600, 60)]
    s = dict(pr.mismatch_samples(ramp, ramp, step_min=30, t_end=540))
    assert abs(s[30.0] - (-0.5 * pr.M_PER_HPA)) < 1e-9       # setting 30 min stale on a 1 hPa/h rise
    assert abs(s[60.0]) < 1e-9


def test_interp_refuses_long_gaps():
    ts, vs = [0.0, 500.0], [1.0, 2.0]
    assert pr.interp_at(ts, vs, 250.0) is None
    assert pr.interp_at([0.0, 100.0], [1.0, 2.0], 25.0) == 1.25


def test_drift_linear_ramp():
    ramp = [(float(t), 1013.0 + t / 60.0, 1012.0 + t / 60.0) for t in range(0, 6000, 60)]
    x = pr.drift_samples(ramp, 30, step_min=60, n_u=3, t_end=3000)
    assert set(round(v, 9) for v in x) == {round(-pr.M_PER_HPA * u / 60, 9) for u in (10, 20, 30)}


def test_mixture_reduces_to_gaussian_cases():
    rmm = _mod("ref_mix_for_pressure_test", "ref_mix.py")
    pw, px = pr.weights_mixture(13.0, 7.62, 1.0, 4, [0.0])
    pw0, px0 = rmm.weights_sd(13.0, 7.62, math.sqrt(2.0), 4)
    assert max(abs(a - b) for a, b in zip(pw + px, list(pw0) + list(px0))) < 1e-12
    # a dense symmetric Gaussian sample of sd 3 approximates s_mix = sqrt(2 + 9)
    from statistics import NormalDist
    nd = NormalDist(0, 3.0)
    n = 4000
    d = [nd.inv_cdf((i + 0.5) / n) for i in range(n)]
    pw, px = pr.weights_mixture(13.0, 7.62, 1.0, 4, d)
    pw1, px1 = rmm.weights_sd(13.0, 7.62, math.sqrt(11.0), 4)
    assert max(abs(a - b) for a, b in zip(pw + px, list(pw1) + list(px1))) < 2e-4


def test_histogram_support_preserves_mean_and_count():
    x = [((i * 37) % 101) / 10.0 - 5 for i in range(1000)]
    c, w = pr.histogram_support(x, nbins=50)
    assert sum(w) == 1000
    assert abs(sum(a * b for a, b in zip(c, w)) / 1000 - sum(x) / 1000) < 1e-9


def test_moments_of_symmetric_two_point():
    mu, sd, ek, p3, a3, a5 = pr.moments([-1.0, 1.0] * 50)
    assert mu == 0 and sd == 1.0 and abs(ek - (-2.0)) < 1e-12 and p3 == 0 and a3 == 0 and a5 == 0
