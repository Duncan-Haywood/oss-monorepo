import importlib.util
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "sand"
spec = importlib.util.spec_from_file_location("sand_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)

GEO = dict(Ln=80e-6, Ls=20e-6, Lp=70e-6, en=0.3, es=0.47, ep=0.33, bn=0.3 ** 1.5, bs=0.47 ** 1.5, bp=0.33 ** 1.5)
D0 = 2e-10


def _geo_d(d=D0):
    g = dict(GEO)
    g.update(Dn=d * g["bn"], Ds=d * g["bs"], Dp=d * g["bp"])
    return g


def _numeric_steady(g, q, c0, n=600):
    """Finite-volume steady state of eps dc/dt = d/dx(D_eff dc/dx) + source, uniform reaction, mass fixed."""
    L = g["Ln"] + g["Ls"] + g["Lp"]
    dx = L / n
    xs = [(i + 0.5) * dx for i in range(n)]
    reg = [0 if x < g["Ln"] else 1 if x < g["Ln"] + g["Ls"] else 2 for x in xs]
    D = [(g["Dn"], g["Ds"], g["Dp"])[k] for k in reg]
    src = [(q / g["Ln"], 0.0, -q / g["Lp"])[k] for k in reg]
    # integrate flux: N(x) = int source, then c' = -N / D, then shift for mass
    N, c, cur, Nx = [], [0.0], 0.0, 0.0
    for i in range(n):
        Nx += src[i] * dx
        N.append(Nx)
    for i in range(1, n):
        Nf = N[i - 1]
        Df = 2 / (1 / D[i - 1] + 1 / D[i])
        c.append(c[-1] - Nf / Df * dx)
    eps = [(g["en"], g["es"], g["ep"])[k] for k in reg]
    mean = sum(e * v for e, v in zip(eps, c)) / sum(eps)
    return [c0 + v - mean for v in c]


def test_closed_form_matches_finite_volume_discharge_minimum():
    g, q, c0 = _geo_d(), 2e-4, 1000.0
    num = _numeric_steady(g, q, c0)
    _, uL, mean = run.profile(q=q, **g)
    assert abs((c0 + uL - mean) - num[-1]) < 0.01 * c0
    assert abs((c0 - mean) - num[0]) < 0.01 * c0


def test_r_ss_is_linear_in_current():
    g, c0 = _geo_d(), 1000.0
    a, b = 1 - run.r_ss(g, 1e-4, c0), 1 - run.r_ss(g, 3e-4, c0)
    assert math.isclose(b, 3 * a, rel_tol=1e-12)
    assert math.isclose(run.crossing(run.r_ss(g, 1e-4, c0)), 0.9 / a, rel_tol=1e-12)


def test_kirchhoff_reduces_to_linear_for_constant_diffusivity():
    g, q, c0 = _geo_d(), 2e-4, 1000.0
    cs = [3 * c0 * k / 400 for k in range(401)]
    ph = [D0 * c for c in cs]
    assert abs(run.r_kt(GEO, q, c0, cs, ph) - run.r_ss(g, q, c0)) < 2e-3


def test_kirchhoff_rising_diffusivity_at_low_salt_depletes_less():
    g, q, c0 = _geo_d(), 4e-4, 1000.0
    cs = [3 * c0 * k / 400 for k in range(401)]
    ph, acc = [0.0], 0.0
    for k in range(1, 401):  # D falls from 3 D0 at c = 0 to D0 at c0 and below after
        dfun = lambda c: D0 * max(0.5, 3 - 2 * c / c0)
        acc += 0.5 * (dfun(cs[k]) + dfun(cs[k - 1])) * (cs[k] - cs[k - 1])
        ph.append(acc)
    assert run.r_kt(GEO, q, c0, cs, ph) > run.r_ss(g, q, c0)


def test_auc_and_spearman():
    assert run.auc([3, 2, 1, 0], [1, 1, 0, 0]) == 1.0
    assert run.auc([1, 1], [1, 0]) == 0.5
    assert math.isclose(run.spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1.0)
    assert math.isclose(run.spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1.0)


def test_r_t_approaches_steady_state_for_long_discharge():
    assert math.isclose(run.r_t(0.2, 1e6, 100.0), 0.2)
    assert math.isclose(run.r_t(0.2, 0.0, 100.0), 1.0)


def test_committed_scores_cover_every_condition():
    rows = [json.loads(l) for l in (HERE / "committed.jsonl").read_text().splitlines()]
    assert len(rows) == 1280
    assert len({r["cond"] for r in rows}) == 19
    assert all("r_kt" in r and "r_ss" in r for r in rows)
