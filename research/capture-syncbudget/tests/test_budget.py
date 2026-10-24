import pytest
from capture_syncbudget import resync_interval_s, simulate, TOL_S


def test_interval_matches_analytic():
    assert resync_interval_s(40, 0.040) == pytest.approx(1000.0)
    assert resync_interval_s(0) == float("inf")
    assert resync_interval_s(40, 0.040, residual_s=0.010) == pytest.approx(750.0)
    assert resync_interval_s(40, 0.040, residual_s=0.050) == 0.0


def test_clean_audio_stays_in_tolerance_when_resync_beats_interval():
    bad, worst, rej, wrong = simulate(0, ppm=40, span_s=3600, every_s=600, snr_db=20)
    assert bad == 0.0 and worst < 40 and wrong == 0


def test_never_resyncing_drifts_out_at_the_analytic_time():
    # one sync only (every_s > span): out of tolerance after TOL/ppm = 1000 s of 3600 s
    bad, *_ = simulate(0, ppm=40, span_s=3600, every_s=10_000, snr_db=20)
    assert bad == pytest.approx(1 - 1000 / 3600, abs=0.005)


def test_gate_rejects_a_wild_estimate_and_never_does_worse_on_clean_audio():
    a = simulate(1, ppm=40, span_s=3600, every_s=600, snr_db=20, gate=True)
    b = simulate(1, ppm=40, span_s=3600, every_s=600, snr_db=20, gate=False)
    assert a[0] == b[0] and a[2] == 0


def test_gate_helps_when_windows_fail():
    # at -15 dB about two thirds of 2 s windows return a false peak; the 10 s first sync is fine
    seeds = range(6)
    g = sum(simulate(s, ppm=40, span_s=7200, every_s=600, snr_db=-15, gate=True)[0] for s in seeds)
    n = sum(simulate(s, ppm=40, span_s=7200, every_s=600, snr_db=-15, gate=False)[0] for s in seeds)
    assert g < n
