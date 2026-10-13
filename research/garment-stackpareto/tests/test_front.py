import numpy as np

from garment_stackopt.opt import baseline_stack
from garment_stackpareto.front import feasible, mass, metrics, pareto_mask, penalised, solve_cell


def test_pareto_mask():
    p = [[1, 2], [2, 1], [2, 2], [1, 2]]
    assert pareto_mask(p).tolist() == [True, True, False, True]


def test_quarter_wave_has_no_penalty_at_loose_constraints():
    d = baseline_stack(620, 4)
    from garment_stackopt.opt import colour
    h = colour(d)[4]
    assert penalised(d, h, 40.0, 10.0) == metrics(d, h)[0]
    assert feasible(d, h, 40.0, 10.0)


def test_mass_cap_penalises():
    d = baseline_stack(620, 4)
    from garment_stackopt.opt import colour
    h = colour(d)[4]
    assert penalised(d, h, 0.0, mass(d) - 1.0) > penalised(d, h, 0.0, mass(d) + 1.0)
    assert not feasible(d, h, 0.0, mass(d) - 1.0)


def test_solver_respects_budget_and_is_deterministic():
    from garment_stackopt.opt import colour
    h = colour(baseline_stack(620, 4))[4]
    a = solve_cell(h, 40.0, 10.0, 200, 1)
    b = solve_cell(h, 40.0, 10.0, 200, 1)
    assert np.allclose(a, b) and a.shape == (8,)
