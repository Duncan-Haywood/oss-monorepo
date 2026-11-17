"""Milestone 21: energy-based strength degradation in wall_cyclic.Saws."""
import json
import os

import numpy as np
import pytest

pytest.importorskip("scipy")

from buildbot_sheathing import wall_cyclic as C  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
S = C.anderson(115)
AMPS, _ = C.curee(2 * S.Du, 3.0)
H = C.cycle_path(AMPS, S.Du / 25)


def test_infinite_gamma_is_milestone_20_exactly():
    assert np.array_equal(S.degrading(np.inf).run(H), S.run(H))
    ref = json.load(open(os.path.join(HERE, "data", "saws_opensees.json")))
    assert np.array_equal(S.degrading(np.inf).run(np.array(ref["d"])), S.run(np.array(ref["d"])))


def test_monotonic_push_is_never_degraded():
    d = np.linspace(0, 1.2 * S.DF, 300)[1:]
    assert np.array_equal(S.degrading(2.0).run(d), S.run(d))


def test_lower_gamma_degrades_more():
    peaks = [np.abs(S.degrading(g).run(H)).max() for g in (np.inf, 50.0, 10.0, 5.0)]
    assert all(a > b for a, b in zip(peaks, peaks[1:]))


def test_force_on_envelope_is_strength_left_times_envelope():
    sg = S.degrading(10.0)
    st = sg.init_state(1)
    seen = 0
    for d in H:
        s_used = st["s"][0]
        F, _, st = sg.trial(np.array([d]), st)
        if st["env"][0] != 0 and not st["dead"][0]:
            assert F[0] == pytest.approx(s_used * sg.env_odd(d)[0], abs=1e-9 * S.FU)
            seen += 1
        assert 0.0 <= st["s"][0] <= 1.0
    assert seen > 50 and st["s"][0] < 1.0


def test_scaled_and_stacked_springs_keep_gamma():
    sg = S.degrading(20.0)
    assert sg.scaled(2.0, 0.5).gamma == 20.0
    st = C.Saws.stack([(sg, 2), (S, 1)])
    assert list(st.gamma) == [20.0, 20.0, np.inf]
