import warnings
import pytest
from garment_twonodeoptics import flex, base

warnings.simplefilter("ignore")
CASES = [(18, 30, 1.0, 0.3), (24, 60, 1.5, 0.7), (30, 60, 2.0, 1.0), (36, 80, 1.0, 0.3)]
OPT = [dict(), dict(tau=0.8), dict(eps=0.2), dict(tau=0.5, eps=0.5, alpha=0.2, solar=250.0, tr=40.0)]


@pytest.mark.parametrize("ta,rh,met,clo", CASES)
@pytest.mark.parametrize("o", OPT)
def test_all_ours_reproduces_garment_thermal_with_optics(ta, rh, met, clo, o):
    tr = o.get("tr", ta)
    fab = base.Fabric(clo=clo, eps_out=o.get("eps", 0.95), tau_ir=o.get("tau", 0.0),
                      alpha_sol=o.get("alpha", 0.5), im=0.45)
    env = base.Env(ta, tr, 0.1, rh, o.get("solar", 0.0))
    b = base.two_node(met, fab, env, minutes=60)
    a = flex.run(met, clo, ta, rh, opts=flex.OURS, **o)
    for k in ("tsk", "tcr", "evap", "dry"):
        assert abs(a[k] - b[k]) < 1e-6, k


@pytest.mark.parametrize("ta,rh,met,clo", CASES)
@pytest.mark.parametrize("dtr", [0.0, 8.0, -6.0])
def test_all_ref_matches_pythermalcomfort_with_neutral_optics(ta, rh, met, clo, dtr):
    ref = pytest.importorskip("pythermalcomfort.models")
    r = ref.two_nodes_gagge(tdb=ta, tr=ta + dtr, v=0.1, rh=rh, met=met, clo=clo, round_output=False)
    b = flex.run(met, clo, ta, rh, opts=flex.REF, tr=ta + dtr)
    assert abs(b["tsk"] - float(r.t_skin)) < 0.05
    assert abs(b["tcr"] - float(r.t_core)) < 0.05
    assert abs(b["dry"] - float(r.q_sensible)) < 0.3


@pytest.mark.parametrize("opts", [flex.OURS, flex.REF])
def test_optics_have_the_expected_signs(opts):
    run = lambda **k: flex.run(1.2, 0.5, 16, 50, opts=opts, **k)
    assert run(tau=0.8)["dry"] > run()["dry"]            # transparent cloth loses more in cool air
    assert run(eps=0.2)["dry"] < run()["dry"]            # low-e outer surface loses less
    sun = lambda **k: flex.run(1.6, 0.5, 32, 40, v=1.0, opts=opts, solar=200.0, **k)
    assert sun(alpha=0.9)["dry"] < sun(alpha=0.15)["dry"]  # dark cloth absorbs more sun
    assert sun(alpha=0.9)["tsk"] > sun(alpha=0.15)["tsk"]


def test_flags_still_independent_with_optics():
    kw = dict(tau=0.5, eps=0.5, alpha=0.2, solar=250.0, tr=40.0)
    ref_run = flex.run(1.5, 0.7, 30, 60, opts=flex.OURS, **kw)
    for f in flex.OURS:
        assert flex.run(1.5, 0.7, 30, 60, opts=dict(flex.OURS, **{f: "ref"}), **kw) != ref_run, f
