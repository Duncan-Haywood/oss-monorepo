import numpy as np

from ambient_asrnoise.sim import (WINDOWS_PER_HOUR, World, score_policy, simulate, speak_acoustic,
                                  speak_keyword, speak_text, speak_wake, tune)

GRID = np.linspace(-1, 7, 321)


def test_length_and_prevalence():
    d = simulate(World(), 0.2, 200, np.random.default_rng(0))
    assert len(d["need"]) == 200 * WINDOWS_PER_HOUR
    assert abs(d["need"].mean() - 0.03) < 0.004


def test_wake_and_keyword_recall_fall_with_wer():
    rec = []
    for wer in (0.0, 0.3, 0.6):
        d = simulate(World(), wer, 500, np.random.default_rng(1))
        rec.append((score_policy(d, speak_wake(d))["recall"], score_policy(d, speak_keyword(d))["recall"]))
    assert rec[0][0] > rec[1][0] > rec[2][0] and rec[0][1] > rec[1][1] > rec[2][1]


def test_wake_phrase_loses_more_than_keyword():
    d0, d5 = (simulate(World(), w, 800, np.random.default_rng(2)) for w in (0.0, 0.5))
    wake_ratio = score_policy(d5, speak_wake(d5))["recall"] / score_policy(d0, speak_wake(d0))["recall"]
    kw_ratio = score_policy(d5, speak_keyword(d5))["recall"] / score_policy(d0, speak_keyword(d0))["recall"]
    assert wake_ratio < kw_ratio


def test_acoustic_signal_is_independent_of_wer():
    a = simulate(World(), 0.0, 100, np.random.default_rng(3))["acoustic"]
    b = simulate(World(), 0.5, 100, np.random.default_rng(3))["acoustic"]
    assert np.allclose(a, b)


def test_tune_meets_budget():
    d = simulate(World(), 0.2, 100, np.random.default_rng(4))
    tau = tune(d, "text", 2.0, GRID)
    assert score_policy(d, speak_text(d, tau))["fp_per_hour"] <= 2.0


def test_text_beats_acoustic_when_clean_and_loses_when_noisy():
    w = World(k=2.0, d_acoustic=1.2)
    gap = []
    for wer in (0.0, 0.5):
        tr = simulate(w, wer, 100, np.random.default_rng(5)); te = simulate(w, wer, 400, np.random.default_rng(6))
        rt = score_policy(te, speak_text(te, tune(tr, "text", 2.0, GRID)))["recall"]
        ra = score_policy(te, speak_acoustic(te, tune(tr, "acoustic", 2.0, GRID)))["recall"]
        gap.append(rt - ra)
    assert gap[0] > 0.05 and gap[1] < 0
