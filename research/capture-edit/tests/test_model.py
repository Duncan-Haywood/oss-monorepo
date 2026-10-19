import itertools
import random

from capture_edit.model import (DT, MIN_SHOT, estimate_offset, fixed_cut, greedy, hold, make_quality, observe,
                                score_edit, shots, viterbi)


def total(path, s, cost):
    return sum(s[c][i] for i, c in enumerate(path)) - cost * sum(1 for a, b in zip(path, path[1:]) if a != b)


def test_viterbi_is_optimal_on_small_cases():
    rng = random.Random(1)
    for _ in range(20):
        s = [[rng.random() for _ in range(6)] for _ in range(3)]
        cost = rng.uniform(0, 1.5)
        best = max(total(p, s, cost) for p in itertools.product(range(3), repeat=6))
        assert abs(total(viterbi(s, cost), s, cost) - best) < 1e-9


def test_viterbi_zero_cost_equals_greedy_total():
    rng = random.Random(2)
    s = observe(make_quality(4, 20, rng), 0.2, rng)
    assert abs(total(viterbi(s, 0), s, 0) - total(greedy(s), s, 0)) < 1e-9


def test_huge_cost_never_cuts():
    rng = random.Random(3)
    s = observe(make_quality(3, 20, rng), 0.2, rng)
    assert len(set(viterbi(s, 1e6))) == 1


def test_fixed_cut_rotates_and_shot_length():
    p = fixed_cut(3, 100, 2.0)
    assert p[:20] == [0] * 20 and p[20:40] == [1] * 20 and p[40] == 2
    assert all(abs(x - 2.0) < 1e-9 for x in shots(p)[:-1])


def test_hold_respects_min_shot():
    rng = random.Random(4)
    s = observe(make_quality(4, 60, rng), 0.5, rng)
    sh = shots(hold(s))
    assert all(x >= MIN_SHOT - 1e-9 for x in sh[:-1])


def test_noiseless_oracle_beats_fixed_cut():
    rng = random.Random(5)
    q = make_quality(4, 60, rng)
    a = score_edit(viterbi(q, 0.3), q)["quality"]
    b = score_edit(fixed_cut(4, len(q[0]), 3.0), q)["quality"]
    assert a > b


def test_score_edit_counts_cuts():
    q = [[1.0] * 10, [0.0] * 10]
    r = score_edit([0] * 5 + [1] * 5, q)
    assert abs(r["quality"] - 0.5) < 1e-9 and r["jarring"] == 1.0
    assert abs(r["cuts_per_min"] - 60.0) < 1e-9


def test_sync_recovers_offset_without_noise():
    for off in (-0.37, 0.0, 0.21):
        est = estimate_offset(15, off, 0.0, random.Random(7))
        assert abs(est - off) <= 0.011


def test_deterministic():
    assert estimate_offset(10, 0.2, 1.0, random.Random(9)) == estimate_offset(10, 0.2, 1.0, random.Random(9))
    a = make_quality(3, 10, random.Random(9))
    assert a == make_quality(3, 10, random.Random(9))
