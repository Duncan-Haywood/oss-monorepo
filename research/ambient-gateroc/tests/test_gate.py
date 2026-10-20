import ctypes
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest

from ambient_gateroc.power import Params, battery_hours
from ambient_gateroc.sim import (FRAME, adaptive_gate, dbfs_to_ms, fixed_gate, frame_ms, hangover_open,
                                 noise_floor, score, synth)

FIRMWARE = Path(__file__).resolve().parents[2] / "ambient-wearable" / "firmware"


def test_synth_is_deterministic_and_labels_some_speech():
    a, la = synth(20, -50, seed=3)
    b, lb = synth(20, -50, seed=3)
    assert (a == b).all() and (la == lb).all()
    assert len(a) == len(la) * FRAME and 0.05 < la.mean() < 0.6


def test_background_rms_matches_request():
    x, act = synth(30, -50, seed=1, transient_rate=0.0)
    quiet = frame_ms(x)[~np.convolve(act, np.ones(41), "same").astype(bool)]
    db = 10 * np.log10(np.mean(quiet) / 32768.0 ** 2)
    assert db == pytest.approx(-50, abs=1.0)


def test_hangover_matches_stepwise_reference():
    rng = np.random.default_rng(0)
    above = rng.random(500) < 0.05
    for h in (0, 3, 10):
        left, ref = 0, []
        for a in above:                      # same state machine as firmware/vad_gate.c
            if a:
                left = h + 1
            ref.append(left > 0)
            left = max(0, left - 1)
        assert (hangover_open(above, h) == np.array(ref)).all()


@pytest.mark.skipif(not (shutil.which("gcc") and FIRMWARE.exists()), reason="needs gcc and ambient-wearable")
def test_fixed_gate_matches_compiled_firmware(tmp_path):
    so = tmp_path / "gate.so"
    subprocess.run(["gcc", "-O2", "-shared", "-fPIC", "-o", str(so), str(FIRMWARE / "vad_gate.c")], check=True)
    lib = ctypes.CDLL(str(so))

    class Gate(ctypes.Structure):
        _fields_ = [("threshold", ctypes.c_uint32), ("hangover", ctypes.c_uint16), ("left", ctypes.c_uint16)]

    lib.vad_gate_push.argtypes = [ctypes.POINTER(Gate), ctypes.POINTER(ctypes.c_int16), ctypes.c_size_t]
    x, _ = synth(20, -45, seed=7)
    thr = int(dbfs_to_ms(-38))
    g = Gate()
    lib.vad_gate_init(ctypes.byref(g), thr, 10)
    out = [lib.vad_gate_push(ctypes.byref(g), f.ctypes.data_as(ctypes.POINTER(ctypes.c_int16)), FRAME)
           for f in x.reshape(-1, FRAME)]
    assert (np.array(out, dtype=bool) == fixed_gate(frame_ms(x), thr, 10)).all()


def test_noise_floor_tracks_stationary_noise():
    x, _ = synth(40, -45, seed=2, transient_rate=0.0)
    ms = frame_ms(x)
    fl = noise_floor(ms, 250)[300:]
    db = 10 * np.log10(np.median(fl) / 32768.0 ** 2)
    assert -48.0 < db < -44.0           # a running minimum sits a little below the mean


def test_higher_threshold_never_opens_more():
    x, act = synth(30, -50, seed=4)
    ms = frame_ms(x)
    opens = [fixed_gate(ms, dbfs_to_ms(d), 10).mean() for d in range(-60, -20, 5)]
    assert all(a >= b for a, b in zip(opens, opens[1:]))
    ks = [adaptive_gate(ms, k, 10).mean() for k in (2, 4, 8)]
    assert ks[0] >= ks[1] >= ks[2]


def test_adaptive_gate_is_room_independent_where_fixed_is_not():
    open_fixed, open_adapt = {}, {}
    for room in (-60, -30):
        x, act = synth(60, room, seed=5)
        ms = frame_ms(x)
        open_fixed[room] = fixed_gate(ms, dbfs_to_ms(-38), 10).mean()
        open_adapt[room] = adaptive_gate(ms, 4, 10).mean()
    assert open_fixed[-30] > 0.95 and open_fixed[-60] < 0.6        # fixed: stuck open in the loud room
    assert abs(open_adapt[-30] - open_adapt[-60]) < 0.2


def test_score_and_battery_model():
    act = np.zeros(100, bool)
    act[40:50] = True
    rec, op, waste = score(act.copy(), act)
    assert (rec, op, waste) == (1.0, 0.1, 0.0)
    assert score(np.ones(100, bool), act)[2] > 0.5
    P = Params()
    assert battery_hours(P, 0.0) > battery_hours(P, 0.2) > battery_hours(P, 1.0)
    assert battery_hours(P, 1.0) == pytest.approx(57.6, abs=0.2)     # = ambient-wearable always_stream
