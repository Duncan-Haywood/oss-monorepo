import math

from capture_detectors import stats as s


def test_recall_curve_half_at_mid():
    assert abs(s.recall_curve(20, 20, 4) - 0.5) < 1e-12
    assert s.recall_curve(1000, 20, 4) > 0.999 and s.recall_curve(2, 20, 4) < 0.001


def test_iou_known_cases():
    assert s.iou((0, 0, 10, 10), (0, 0, 10, 10)) == 1.0
    assert s.iou((0, 0, 10, 10), (20, 0, 10, 10)) == 0.0
    assert abs(s.iou((0, 0, 10, 10), (5, 0, 10, 10)) - 1 / 3) < 1e-12


def test_face_hit_rules():
    ref = (100, 100, 40, 40)
    assert s.face_hit((102, 98, 38, 44), ref)
    assert not s.face_hit((100, 100, 100, 100), ref)  # too wide
    assert not s.face_hit((300, 300, 40, 40), ref)  # elsewhere


def test_wilson_contains_p_and_handles_empty():
    lo, hi = s.wilson(50, 100)
    assert lo < 0.5 < hi and 0.40 < lo and hi < 0.60
    assert math.isnan(s.wilson(0, 0)[0])
    lo0, hi0 = s.wilson(0, 10)
    assert lo0 == 0.0 or lo0 < 1e-9
    assert hi0 > 0.2


def test_bin_trials_edges_are_half_open():
    rows = s.bin_trials([(8, 1), (12, 0), (12, 1), (23.9, 1)], [8, 12, 24])
    assert rows[0][2:4] == (1, 1)
    assert rows[1][2:4] == (3, 2)


def test_fit_recovers_known_curve():
    # deterministic trials: hit iff a quantile of the true curve; fit should land near the truth
    trials = []
    for px in [6 * 1.12 ** i for i in range(40)]:
        p = s.recall_curve(px, 25.0, 3.0)
        n = 200
        trials += [(px, 1)] * round(p * n) + [(px, 0)] * (n - round(p * n))
    mid, k = s.fit_recall(trials)
    assert abs(mid - 25) / 25 < 0.08 and abs(k - 3) < 0.4


def test_leak_matches_closed_form_for_step_limit():
    # a detector that is certain above mid and blind below, with mid = ident size: nothing leaks
    assert s.leak_share(1.0, 12.0, 183.0, ident_px=32) < 1e-6
    # assumed model on an 8K 360 reproduces capture-bystander's 0.048
    assert abs(s.leak_share(20, 4, 183.3) - 0.048) < 0.003


def test_leak_grows_with_mid():
    a = s.leak_share(10, 4, 183.3)
    b = s.leak_share(30, 4, 183.3)
    assert a < s.leak_share(20, 4, 183.3) < b


def test_head_coverage():
    body = (0, 0, 100, 400)
    assert s.head_coverage((30, 5, 30, 30), body, 0.15) == 1.0
    assert s.head_coverage((30, 100, 30, 30), body, 0.15) == 0.0
    assert abs(s.head_coverage((30, 50, 30, 30), body, 0.15) - 10 / 30) < 1e-12


def test_face_turn_proxy():
    assert s.face_turn((40, 50), (60, 50), (50, 70)) == 0.0  # nose under the eye midpoint
    assert abs(s.face_turn((40, 50), (60, 50), (60, 70)) - 0.5) < 1e-12  # nose under the far eye
    assert abs(s.face_turn((40, 50), (60, 50), (40, 70)) - 0.5) < 1e-12  # symmetric left/right
