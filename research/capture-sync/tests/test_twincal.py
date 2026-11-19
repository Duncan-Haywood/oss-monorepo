"""Step 3k: the calibrated twin replays step 3c/3h's windows when uncalibrated, and its noise floor does what
it says. Synthetic 'speech' (bursty modulated noise) stands in for MS-SNSD so the tests need no download."""
import os
import sys

import numpy as np

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "gate"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "real-devices"))
import noisetype as NT  # noqa: E402
import twincal as TC  # noqa: E402
from capture_sync.sync import FS  # noqa: E402


def _fake(monkeypatch):
    rng = np.random.default_rng(11)

    def speechy(sec):
        n = int(sec * FS)
        env = np.repeat(rng.random(n // 1600 + 1) ** 3, 1600)[:n]  # 100 ms syllable-like bursts and pauses
        return rng.standard_normal(n) * env

    blocks = [speechy(14.0) for _ in range(NT.N_SESS)]
    nz = {t: (speechy(6.0), speechy(6.0)) for t in NT.TYPES[1:]}
    monkeypatch.setattr(NT, "speech_blocks", lambda root: blocks)
    monkeypatch.setattr(NT, "noises", lambda root: nz)


def test_uncalibrated_twin_replays_noisetype_bit_for_bit(monkeypatch):
    _fake(monkeypatch)
    ref = NT.run_chunk(("x", 0.2, 2.0, [0, 8], 31101))
    got = TC.sim_chunk(("x", 0.2, [0, 8], 31101, 0.0, None, None, 0))
    assert len(ref) == len(got) == 2 * len(NT.CONDS)
    for r, g in zip(ref, got):
        assert r[2:7] == [g[3], g[4], g[5], g[6], g[7]]  # trial, session, type, snr, snr_hat
        assert r[9:11] == g[8:10]  # gamma 0.25: error and PSR


def test_floor_lowers_blind_snr_and_leaves_main_stream(monkeypatch):
    _fake(monkeypatch)
    conds = TC.FIT_CONDS
    a = np.array(TC.sim_chunk(("x", 0.2, list(range(0, 40, 8)), 7, 0.0, None, conds, 0)))
    b = np.array(TC.sim_chunk(("x", 0.2, list(range(0, 40, 8)), 7, 0.0, 10.0, conds, 1)))
    none_a, none_b = a[a[:, 5] == -1], b[b[:, 5] == -1]
    assert np.all(none_b[:, 7] < none_a[:, 7] - 3.0)  # a 10 dB floor fills the pauses
    assert np.array_equal(a[:, 3:7], b[:, 3:7])  # same trials, sessions and conditions
    assert np.median(np.abs(none_b[:, 8] - none_a[:, 8])) < 1e-3  # same true lag: the floor did not shift it


def test_lower_drr_puts_more_energy_in_the_tail():
    for drr in (6.0, 0.0, -12.0):
        h = NT.rir(0.4, np.random.default_rng(0), drr_db=drr)
        assert abs(10 * np.log10(1.0 / np.sum(h[1:] ** 2)) - drr) < 1e-6
