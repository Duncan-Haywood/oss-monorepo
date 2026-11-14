import importlib.util
import math
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "balance"
spec = importlib.util.spec_from_file_location("balance_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)

G = [k / 100 for k in range(101)]


def linear_cell(Qn=1.0, Qp=1.0, n_li=1.0):
    # U_n = 0.1 (1 - x), U_p = 4.4 - y: OCV = 4.3 - y + 0.1 x, linear, so windows have closed forms
    return dict(g=G, Un=[0.1 * (1 - x) for x in G], Up=[4.4 - y for y in G], Qn=Qn, Qp=Qp, n_li=n_li, vlo=3.5, vhi=4.1)


def test_interp_is_linear_and_clamped():
    assert run.interp([0, 1, 2], [0, 10, 0], 0.5) == 5
    assert run.interp([0, 1, 2], [0, 10, 0], -1) == 0
    assert run.interp([0, 1, 2], [0, 10, 0], 3) == 0


def test_window_matches_closed_form_on_a_linear_cell():
    b = linear_cell()
    # y = 1 - x, OCV = 4.3 - (1 - x) + 0.1 x = 3.3 + 1.1 x
    x0, x1 = run.window(1.0, b)
    assert math.isclose(x0, (3.5 - 3.3) / 1.1, abs_tol=1e-9)
    assert math.isclose(x1, (4.1 - 3.3) / 1.1, abs_tol=1e-9)


def test_energy_is_F_Qn_times_the_ocv_integral():
    b = linear_cell()
    e, q = run.ocv_energy(1.0, b)
    x0, x1 = (3.5 - 3.3) / 1.1, (4.1 - 3.3) / 1.1
    assert math.isclose(q, run.F_CONST * (x1 - x0) / 3600, rel_tol=1e-9)
    assert math.isclose(e, q * 3.8, rel_tol=1e-6)   # mean OCV of a linear window = (3.5 + 4.1) / 2


def test_lost_lithium_shrinks_a_window_the_negative_limits():
    # a cell whose window is clipped by the negative stoichiometry range loses capacity one for one with lithium
    b = linear_cell(Qn=1.0, Qp=3.0, n_li=1.6)
    e0, q0 = run.ocv_energy(1.6, b)
    e1, q1 = run.ocv_energy(1.5, b)
    assert q1 < q0 and e1 < e0


def test_excess_lithium_room_makes_loss_free_until_it_is_used():
    # positive-limited cell (large negative): the voltage window, not lithium, sets the capacity at first
    b = linear_cell(Qn=3.0, Qp=1.0, n_li=1.0)
    # both cut-offs are reached inside the stoichiometry range, and on a linear cell the window just slides: no loss
    _, q0 = run.ocv_energy(1.0, b)
    _, q1 = run.ocv_energy(0.9, b)
    assert q0 > 0 and math.isclose(q1, q0, rel_tol=1e-9)


def test_map_fade_uses_cycle_k_minus_2_loss():
    b = linear_cell(Qn=1.0, Qp=3.0, n_li=1.6)
    lost = [0.0] + [0.01 * k for k in range(1, 19)] + [0.5]
    f = run.map_fade(b, lost)
    e2, _ = run.ocv_energy(1.6 - lost[0], b)
    e20, _ = run.ocv_energy(1.6 - lost[18], b)
    assert math.isclose(f, 1 - e20 / e2)
    assert math.isclose(run.lli_share(b, lost), (lost[18] - lost[0]) / 1.6)


def test_spearman_and_ties():
    assert run.spearman([1, 2, 3], [3, 2, 1]) == -1
    assert run.ranks([1, 1, 2]) == [1.5, 1.5, 3]
    assert run.spearman([1, 1], [1, 2]) is None


def test_verdict_bars():
    rows = [dict(cond="c", j=i, dfn=0.1 * i, map=0.1 * i + 0.01, lli=0.05 * i + 0.04, open_ratio=1 - 0.1 * i) for i in range(1, 5)]
    E = run.evaluate(rows, 2.0)
    assert E["n"] == 4 and E["within"] == 1.0 and E["H104"] == "supported"
    assert E["H105"] in ("supported", "mixed", "refuted")
