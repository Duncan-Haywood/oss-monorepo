import random
from capture_syncedit import cut_damage, edit_cuts, FRAME


def test_zero_error_no_damage():
    cuts = edit_cuts(0)
    assert cuts
    r = cut_damage(cuts, [0.0] * 4, [(1.0, 1.0)])
    assert r == {"visible": 0.0, "event": 0.0, "jump_ms": 0.0}


def test_equal_errors_cancel():
    # all cameras equally late: a cut jumps nothing
    r = cut_damage(edit_cuts(1), [0.3] * 4, [(5.0, 1.0)])
    assert r["visible"] == 0.0 and r["jump_ms"] == 0.0


def test_event_inside_jump_counted_once_per_cut():
    cuts = [(10.0, 0, 1)]
    assert cut_damage(cuts, [0.0, 0.5, 0, 0], [(10.2, 1.0)])["event"] == 1.0
    assert cut_damage(cuts, [0.0, 0.5, 0, 0], [(11.0, 1.0)])["event"] == 0.0
    assert cut_damage(cuts, [0.0, 0.5, 0, 0], [(10.2, 1.0)])["visible"] == 1.0


def test_one_frame_threshold():
    cuts = [(10.0, 0, 1)]
    assert cut_damage(cuts, [0, FRAME * 0.9, 0, 0], [])["visible"] == 0.0
    assert cut_damage(cuts, [0, FRAME * 1.1, 0, 0], [])["visible"] == 1.0


def test_analytic_event_share():
    # events at rate r, jump J: P(event in jump) = 1 - exp(-r J); check against a simulated Poisson stream
    from capture_edit.model import make_events
    import math
    J, r, hits, n = 0.5, 0.5, 0, 4000
    for s in range(n):
        ev = make_events(30.0, random.Random(s), r)
        hits += cut_damage([(10.0, 0, 1)], [0, J, 0, 0], ev)["event"]
    assert abs(hits / n - (1 - math.exp(-r * J))) < 0.03
