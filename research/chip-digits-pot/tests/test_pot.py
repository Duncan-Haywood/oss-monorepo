import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np
from chip_digits_pot import pot
from chip_digits import model

xtr, xte, ytr, yte = model.load(0)
P = model.train_float(xtr, ytr, 0, epochs=400)


def test_integer_lane_equals_float_reference():
    for how in ("max", "mse"):
        q = pot.quantise(P, xtr, 3, 4, how)
        xi = q["xq"](xte)
        assert np.array_equal(pot.int_forward(q, xi)[0], pot.float_check(q, xi).astype(np.int64))


def test_single_exponent_is_per_tensor_lane():
    q = pot.quantise(P, xtr, 4, 4, "max", force_single=True)
    assert (q["d1"] == 0).all() and (q["d2"] == 0).all()
    xi = q["xq"](xte)
    ref = np.maximum(xi @ q["w1"] + q["b1"], 0) >> q["p"]
    assert np.array_equal(pot.int_forward(q, xi)[1], np.clip(ref, 0, 15))


def test_exponent_never_clips_in_max_mode_and_mse_never_worse():
    w = P[0]
    for wb in (2, 3, 4):
        m = 2 ** (wb - 1) - 1
        e = pot.exponents(w, wb, "max")
        assert (np.abs(w).max(0) / 2.0 ** e <= m + 1e-9).all()
        em = pot.exponents(w, wb, "mse")
        err = lambda ee: ((pot._q(w, ee, wb) * 2.0 ** ee - w) ** 2).sum(0)
        assert (err(em) <= err(e) + 1e-12).all()


def test_close_to_float_at_high_width():
    q = pot.quantise(P, xtr, 4, 5, "mse")
    assert model.float_acc(P, xte, yte) - pot.int_acc(q, xte, yte) < 0.05
