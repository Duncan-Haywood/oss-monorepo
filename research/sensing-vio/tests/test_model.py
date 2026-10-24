import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sensing_vio import Setup, make_world, simulate_sensors, run_vio, drift_percent

QUIET = Setup(px_sigma=1e-9, gyro_nd=1e-9, gyro_rw=1e-12, acc_nd=1e-9, acc_rw=1e-12)


def run(s, seed=0, T=6.0):
    w = make_world(seed, T=T)
    se = simulate_sensors(w, s, seed)
    return w, se, run_vio(w, s, se)


def test_world_is_deterministic_and_sized():
    a, b = make_world(3, T=5), make_world(3, T=5)
    assert np.array_equal(a["p"], b["p"]) and np.array_equal(a["lm"], b["lm"])
    assert a["p"].shape == (500, 2) and a["lm"].shape == (120, 2)


def test_focal_length_and_bearing_noise_scale_with_resolution():
    s = Setup(width_px=640, fov_deg=90)
    assert abs(s.focal_px - 320) < 1e-9
    assert abs(Setup(width_px=160).bearing_sigma / s.bearing_sigma - 4) < 1e-9


def test_window_spans_fixed_time():
    assert Setup(fps=10).window == 7 and Setup(fps=5).window == 4 and Setup(fps=20).window == 13


def test_imu_scale_multiplies_noise():
    s = Setup().with_imu_scale(2.0, 0.5)
    assert abs(s.gyro_nd / Setup().gyro_nd - 2) < 1e-12 and abs(s.acc_rw / Setup().acc_rw - 0.5) < 1e-12


def test_noiseless_sensors_recover_the_path():
    w, se, est = run(QUIET)
    assert drift_percent(w, se, est)[0] < 0.01


def test_observations_are_inside_the_field_of_view():
    w = make_world(1, T=4)
    s = Setup(fov_deg=60)
    se = simulate_sensors(w, s, 1)
    assert len(se["obs"]) > 0
    assert max(abs(z) for _, _, z in se["obs"]) < np.radians(30) + 6 * s.bearing_sigma


def test_noisy_run_drifts_more_than_noiseless():
    w, se, est = run(Setup())
    assert drift_percent(w, se, est)[1] > 0.01


def test_much_worse_camera_drifts_more():
    good = np.mean([drift_percent(*(lambda r: (r[0], r[1], r[2]))(run(Setup(width_px=1280), seed=k, T=8)))[1] for k in range(2)])
    bad = np.mean([drift_percent(*(lambda r: (r[0], r[1], r[2]))(run(Setup(width_px=40), seed=k, T=8)))[1] for k in range(2)])
    assert bad > good
