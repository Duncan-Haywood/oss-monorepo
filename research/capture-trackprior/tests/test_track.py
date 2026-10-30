import numpy as np
from capture_trackprior import theil_sen, predict, track_camera


def test_theil_sen_ignores_an_outlier():
    t = np.arange(8.0)
    d = 0.8 + 2e-5 * t
    d[3] += 0.0121                      # one aliased estimate
    m, c = theil_sen(t, d)
    assert abs(m - 2e-5) < 1e-6 and abs(c - 0.8) < 1e-4


def test_predict_one_point_covers_worst_drift():
    c, h = predict([0.0], [0.8], 300.0)
    assert c == 0.8 and h >= 40e-6 * 300.0


def test_predict_line_extrapolates_and_cap_applies():
    ts = [0, 300, 600, 900]
    ds = [0.8 + 3e-5 * t for t in ts]
    c, h = predict(ts, ds, 1200.0)
    assert abs(c - (0.8 + 3e-5 * 1200)) < 1e-6 and h < 0.005
    assert predict(ts, ds, 1200.0, cap_s=0.0005)[1] == 0.0005


def test_tracking_rejects_a_stronger_alias_outside_the_prior():
    """Window 0 holds only the true 0.1 s copy; later windows add a louder copy 12 ms later. Tracking stays on 0.1,
    the unrestricted search picks the louder copy."""
    rng = np.random.default_rng(0)
    fs = 16000
    wins = []
    for k in range(5):
        x = rng.standard_normal(fs * 2)
        d1, d2 = int(0.1 * fs), int(0.112 * fs)
        b = np.zeros_like(x); b[d1:] += 0.5 * x[:-d1]
        if k:
            b[d2:] += 1.0 * x[:-d2]
        wins.append((x, b))
    times = [0, 300, 600, 900, 1200]
    est, cen, hal = track_camera(wins, times, 0.0, boot=1, cap_s=0.004)
    assert np.all(np.abs(est - 0.1) < 1e-3)
    assert np.isnan(cen[0]) and not np.isnan(cen[1])
    free, _, _ = track_camera(wins, times, 0.0, boot=5)
    assert abs(free[1] - 0.112) < 1e-3


def test_gated_matches_gcc_search_when_ratio_is_infinite_free_prior():
    """gcc_curve + _peak agree with capture_aliaswin.gcc_search; a huge ratio never overrides the prior."""
    import numpy as np
    from capture_aliaswin import pair_at, gcc_search
    from capture_trackprior import track_gated
    clip = np.random.default_rng(0).standard_normal(16000 * 6) * 0.3
    times = np.linspace(0, 3600.0, 4)
    wins = [pair_at(clip, np.random.default_rng(k), 0.8, 2.0, 20)[:2] for k in range(4)]
    est, re = track_gated(wins, times, 0.25, 1, 1e9)
    assert not re.any()
    assert abs(est[0] - gcc_search(*wins[0], 0.25)) < 1e-9
    assert np.all(np.abs(est - 0.8) < 1e-3)


def test_gated_overrides_a_prior_on_a_weak_alias():
    """History says 0.9 s but the true peak at 0.8 s is far stronger: ratio 1.5 re-acquires it."""
    import numpy as np
    from capture_aliaswin import pair_at
    from capture_trackprior import track_gated
    clip = np.random.default_rng(1).standard_normal(16000 * 6) * 0.3
    times = np.array([0.0, 327.0])
    w0 = pair_at(clip, np.random.default_rng(0), 0.9, 2.0, 20)[:2]
    w1 = pair_at(clip, np.random.default_rng(1), 0.8, 2.0, 20)[:2]
    est, re = track_gated([w0, w1], times, 0.25, 1, 1.5)
    assert re[1] and abs(est[1] - 0.8) < 1e-3
