import numpy as np
import pytest

from ambient_preroll.power import Params, battery_hours
from ambient_preroll.preroll import onset_lag, onset_scores, sent_mask, utterance_starts
from ambient_preroll.sim import synth


def test_zero_preroll_is_identity():
    op = np.array([0, 0, 1, 1, 0, 0, 1, 0], dtype=bool)
    assert (sent_mask(op, 0) == op).all()


def test_preroll_matches_stepwise_reference():
    rng = np.random.default_rng(0)
    op = rng.random(200) < 0.1
    for pr in (1, 3, 10):
        ref = np.array([op[i:i + pr + 1].any() for i in range(len(op))])
        assert (sent_mask(op, pr) == ref).all()


def test_preroll_only_adds_frames_before_openings():
    op = np.zeros(20, dtype=bool)
    op[10:12] = True
    sm = sent_mask(op, 4)
    assert sm[6:12].all() and not sm[:6].any() and not sm[12:].any()


def test_utterance_starts_merge_syllable_gaps():
    a = np.zeros(300, dtype=bool)
    a[10:20] = a[30:40] = True       # one utterance (gap 10 < 25)
    a[200:210] = True                # another
    assert list(utterance_starts(a)) == [10, 200]


def test_onset_scores_and_lag():
    act = np.zeros(100, dtype=bool)
    act[10:40] = True
    op = np.zeros(100, dtype=bool)
    op[16:50] = True                 # gate opens 6 frames late
    assert list(onset_lag(op, act)) == [6]
    rec0, clean0, n = onset_scores(op, act)
    assert n == 1 and clean0 == 0.0 and rec0 == pytest.approx(19 / 25)
    rec6, clean6, _ = onset_scores(sent_mask(op, 6), act)
    assert rec6 == 1.0 and clean6 == 1.0


def test_onset_recall_never_decreases_with_preroll():
    x, act = synth(60, -50, seed=2)
    from ambient_preroll.sim import frame_ms, adaptive_gate
    op = adaptive_gate(frame_ms(x), 6, 5)
    prev = -1
    for pr in (0, 5, 10, 25):
        r = onset_scores(sent_mask(op, pr), act)[0]
        assert r >= prev
        prev = r


def test_sent_fraction_and_battery_monotone():
    x, act = synth(60, -50, seed=2)
    from ambient_preroll.sim import frame_ms, adaptive_gate
    op = adaptive_gate(frame_ms(x), 6, 5)
    fr = [sent_mask(op, pr).mean() for pr in (0, 5, 25)]
    assert fr[0] <= fr[1] <= fr[2]
    p = Params()
    assert battery_hours(p, fr[0]) >= battery_hours(p, fr[2])
    assert battery_hours(p, 1.0) == pytest.approx(57.6, abs=0.1)
