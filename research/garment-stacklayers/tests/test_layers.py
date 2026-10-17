import numpy as np

from garment_stackopt.opt import baseline_stack, colour
from garment_stacklayers.layers import feasible, metrics, penalised, rho, solve


def test_rho_length_and_order():
    assert rho(6) == [4230.0, 2200.0] * 3
    assert rho(5)[-1] == 4230.0 and len(rho(5)) == 5


def test_matches_8_layer_stackpareto():
    from garment_stackpareto.front import metrics as m8
    d = baseline_stack(620, 4)
    h = colour(d)[4]
    assert np.allclose(metrics(d, h), m8(d, h))


def test_loose_constraints_no_penalty():
    d = baseline_stack(620, 3)
    h = colour(d)[4]
    assert penalised(d, h, 0.0, 99.0) == metrics(d, h)[0] and feasible(d, h, 0.0, 99.0)


def test_solve_shape_and_determinism():
    h = colour(baseline_stack(620, 4))[4]
    a, b = solve(6, h, 40.0, 10.0, 150, 1), solve(6, h, 40.0, 10.0, 150, 1)
    assert a.shape == (6,) and np.allclose(a, b)
