import importlib.util
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "plating"
spec = importlib.util.spec_from_file_location("plating_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def test_cycle_two_loss_share():
    assert math.isclose(run.p2_of([0.002, 0.005], 0.3), 0.01)


def test_interp_down_is_linear_and_clamped():
    grid, vals = [0.8, 0.7, 0.6], [0.10, 0.12, 0.16]
    assert run.interp_down(grid, vals, 0.9) == 0.10
    assert math.isclose(run.interp_down(grid, vals, 0.65), 0.14)
    assert run.interp_down(grid, vals, 0.1) == 0.16


def test_flat_ocp_gives_the_linear_loss():
    # with no OCP rise the plating rate never falls, so 98 cycles lose 98 r2
    L = run.self_limited_loss(1e-3, 0.8, 1.0, [0.8, 0.0], [0.1, 0.1], 0.65, 298.15)
    assert math.isclose(L, 98e-3, rel_tol=1e-9)


def test_rising_ocp_limits_the_loss_and_matches_the_closed_form():
    # U rises linearly by s per unit of lost stoichiometry: dL/dn = r exp(-k s L / q), so L(n) = (q / (k s)) ln(1 + k s r n / q)
    r, q, s, alpha, T = 1e-3, 0.1, 0.5, 0.65, 298.15
    grid = [0.8 - 0.005 * i for i in range(161)]
    u = [0.1 + s * (0.8 - g) for g in grid]
    L = run.self_limited_loss(r, 0.8, q, grid, u, alpha, T, sub=200)
    k = alpha * run.F_CONST / (run.R_GAS * T)
    assert L < 98 * r
    assert math.isclose(L, q / (k * s) * math.log(1 + k * s * r * 98 / q), rel_tol=2e-3)


def test_rank_counts_ties_against_the_design():
    assert run.rank_of([3, 1, 2], 0) == 1
    assert run.rank_of([0, 0, 0], 1) == 3


def test_predict_score_clips_at_zero_and_keeps_w2():
    q = dict(cycle_wh=[10.0, 9.0], mass_kg=0.05, lost_mol=[0.001, 0.003], cycle_ah=[3.0, 2.8], theta_end=0.8, q_neg_mol=0.15,
             ocp_grid=[0.8, 0.0], ocp_u=[0.1, 0.1], alpha_plating=0.65, T=298.15)
    p = run.predict_score(q)
    assert math.isclose(p["w2"], 180.0)
    assert p["linear"] == 0.0 and p["limited"] == 0.0     # 98 x 0.002 mol x 26.8 Ah/mol > 2.8 Ah
    assert math.isclose(p["fade_linear"], 98 * 0.002 * run.F_CONST / 3600 / 2.8)


def test_topk_and_keep_union_on_a_toy_pool():
    rows = [dict(score=s, t100=10.0, wh=[s] * 100, m=1.0) for s in (5, 9, 7, 8, 6, 4, 3, 2)]
    g, t = run.topk_dfn(rows, [r["score"] for r in rows], 1, 0.5)
    assert g == 0 and math.isclose(t, 10.0 + 0.5 * 8)
    g, t, n = run.keep_union(rows, [-r["score"] for r in rows], 0.5, 0.0)
    assert n == 4 and math.isclose(g, 1 - 5 / 9)


def test_committed_verdicts_match_the_committed_dev_file():
    d = json.loads((HERE / "dev.json").read_text())
    assert set(d["verdicts"]) == {"H100", "H101", "H102", "H103"}
    assert set(d["seen"]) == set(run.SEEN) and len(run.SEEN) == 12
