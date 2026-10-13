import numpy as np
from garment_smart.model import (ACTIVITIES, FS, SENSORS, WIN, Softmax, accuracy, channel_index,
                                 features, make_dataset, simulate_window)


def test_window_shape_and_channels():
    w = simulate_window("walk", np.random.default_rng(0))
    assert w.shape == (sum(SENSORS.values()), WIN)


def test_channel_index_subset():
    assert channel_index(["chest_imu"]) == [0, 1, 2]
    assert channel_index(["knee_strain"]) == [9]


def test_deterministic_given_seed():
    a = simulate_window("run", np.random.default_rng(3))
    b = simulate_window("run", np.random.default_rng(3))
    assert np.array_equal(a, b)


def test_dominant_frequency_of_walk_near_gait_frequency():
    w = simulate_window("walk", np.random.default_rng(1), noise=0.01)
    f = features(w, [2])[2]            # chest z channel, feature 2 = dominant freq
    assert abs(f - 1.8) < 0.5


def test_run_has_larger_chest_std_than_stand():
    rng = np.random.default_rng(2)
    run = features(simulate_window("run", rng), [2])[1]
    stand = features(simulate_window("stand", rng), [2])[1]
    assert run > 3 * stand


def test_slip_changes_signal():
    a = simulate_window("walk", np.random.default_rng(4), slip=0.0)
    b = simulate_window("walk", np.random.default_rng(4), slip=1.0)
    assert not np.allclose(a, b)


def test_classifier_beats_chance_clearly():
    rng = np.random.default_rng(5)
    X, y, _ = make_dataset(40, rng, list(SENSORS))
    Xt, yt, _ = make_dataset(40, rng, list(SENSORS))
    assert accuracy(Softmax().fit(X, y), Xt, yt) > 0.6


def test_dataset_balanced():
    _, y, _ = make_dataset(10, np.random.default_rng(6), ["chest_imu"])
    assert np.bincount(y).tolist() == [10] * len(ACTIVITIES)
