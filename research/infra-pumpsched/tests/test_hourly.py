import numpy as np
import pytest

from infra_pumpsched.hourly import Evaluator, feasible, genetic, local_search, runs_masks, violation
from infra_pumpsched.sched import cost, simulate, tariff, total_kwh


def window_mask(start, hours):
    return tuple(((h - start) % 24) < hours for h in range(24))


def test_mask_matches_window_simulation():
    # the shipped 01:00-15:00 window as a mask reproduces the window run's energy
    ev = Evaluator()
    assert total_kwh(ev(window_mask(1, 14))) == pytest.approx(total_kwh(simulate(1, 14)), rel=1e-6)


def test_mask_across_midnight_matches_window():
    ev = Evaluator()
    assert total_kwh(ev(window_mask(22, 6))) == pytest.approx(total_kwh(simulate(22, 6)), rel=1e-3)


def test_mask_enumeration_counts():
    # on a 24-hour circle a mask with r runs has 2r boundaries: C(24,2r) boundary sets, 2 masks each; plus all off and all on
    ms = runs_masks()
    assert len(ms) == 2 + 2 * 276 + 2 * 10626
    assert len(set(ms)) == len(ms)


def test_feasibility_and_violation_agree():
    ev = Evaluator()
    ok, bad = ev(window_mask(1, 14)), ev(tuple(h == 12 for h in range(24)))  # one pumped hour: tanks drift 3 % of demand
    assert feasible(ok) and violation(ok) == 0
    assert not feasible(bad) and violation(bad) > 0


def test_searches_do_not_return_worse_than_their_seed():
    ev = Evaluator()
    pr = tariff("evening", 3)
    seed = window_mask(1, 14)
    f0 = ev.objective(seed, pr)
    _, f = local_search(ev, pr, seed, 30, np.random.default_rng(0))
    assert f <= f0 + 1e-9
    _, g = genetic(Evaluator(), pr, 30, np.random.default_rng(0), pop=8, seeds=[seed])
    assert g <= f0 + 1e-9


def test_flat_cost_is_energy():
    ev = Evaluator()
    r = ev(window_mask(1, 14))
    assert cost(r, tariff("flat", 1)) == pytest.approx(total_kwh(r))
