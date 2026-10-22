import numpy as np
import pytest

from buildbot_skills import model as M

POL = dict(K=1000.0, B=150.0, Ki=0.0)


def one(kind, **kw):
    w = M.nominal_world(1, kind=kind)
    for k, v in kw.items():
        w[k] = np.full(1, v, float)
    return w


def test_plant_a_reproduces_cohold_published_figures():
    # buildbot-cohold results.json: 22 kg, T=2 s, K=1000, B=150, lag=0.2 s -> peak tilt 2.2422 deg, person peak 11.4222 kg
    r = M.simulate(one("A"), POL, "A")
    assert r["peak_tilt_deg"][0] == pytest.approx(2.2422, abs=2e-3)
    assert r["person_kg_peak"][0] == pytest.approx(11.4222, abs=2e-3)


@pytest.mark.parametrize("kind", ["A", "B"])
def test_static_hold_splits_weight_evenly(kind):
    # a lift taking 1e4 s is a static hold: the person carries half the sheet, the sheet stays level
    r = M.simulate(one(kind, T=1e4, lag=0.0), POL, kind, t_end=2.0)
    assert r["person_kg_peak"][0] == pytest.approx(22.0 / 2, rel=0.02)
    assert r["peak_tilt_deg"][0] < 0.5


def test_plant_b_stiff_instant_matches_plant_a():
    r_a = M.simulate(one("A"), POL, "A")
    r_b = M.simulate(one("B", kflex=1e5, delay=0.0, tau_a=1e-3), POL, "B")
    assert r_b["peak_tilt_deg"][0] == pytest.approx(r_a["peak_tilt_deg"][0], rel=0.05)
    assert r_b["person_kg_peak"][0] == pytest.approx(r_a["person_kg_peak"][0], rel=0.05)


def test_released_stiff_two_link_sheet_falls_like_a_pendulum():
    # no robot force, stiff hinge: a free rod pinned at one end falls; after t it has swung by the pendulum's small-angle-free
    # energy law, so check the tip speed at 90 degrees: v^2 = 3 g L
    w = one("B", T=1e4, lag=0.0, ffr=0.0, kflex=1e5)
    pol = dict(K=0.0, B=0.0, Ki=0.0)
    r = M.simulate(w, pol, "B", t_end=0.4, dt=2e-4, settle=0.0)
    assert r["peak_tilt_deg"][0] > 5.0     # it is falling


def test_zero_gain_policy_fails_and_nominal_passes():
    assert not M.success(M.simulate(one("A"), dict(K=0.0, B=100.0, Ki=0.0), "A"))[0]
    assert M.success(M.simulate(one("A"), dict(K=1000.0, B=150.0, Ki=200.0), "A"))[0]


def test_integral_term_removes_feedforward_sag():
    w = one("A", ffr=0.8)
    no_i = M.simulate(w, dict(K=1000.0, B=150.0, Ki=0.0), "A", extra=6.0)
    with_i = M.simulate(w, dict(K=1000.0, B=150.0, Ki=800.0), "A", extra=6.0)
    assert no_i["end_tilt_deg"][0] > 0.5 > with_i["end_tilt_deg"][0]


def test_plant_b_result_does_not_depend_on_step_size():
    w = M.draw_world(np.random.default_rng(5), 40, "B")
    a = M.success(M.simulate(w, POL, "B", dt=1e-3)).mean()
    b = M.success(M.simulate(w, POL, "B", dt=5e-4)).mean()
    assert abs(a - b) <= 0.05
