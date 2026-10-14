import warnings
import pytest
from garment_twonodealign import flex, base

warnings.simplefilter("ignore")
CASES = [(18, 30, 1.0, 0.3), (24, 60, 1.5, 0.7), (30, 60, 2.0, 1.0), (36, 80, 1.0, 0.3)]


@pytest.mark.parametrize("ta,rh,met,clo", CASES)
def test_all_ours_reproduces_garment_thermal(ta, rh, met, clo):
    a = flex.run(met, clo, ta, rh, opts=flex.OURS)
    b = base.two_node(met, base.Fabric(clo=clo, im=0.45), base.Env(ta, ta, 0.1, rh), minutes=60)
    for k in ("tsk", "tcr", "evap", "dry"):
        assert abs(a[k] - b[k]) < 1e-6


@pytest.mark.parametrize("ta,rh,met,clo", CASES)
def test_all_ref_reproduces_pythermalcomfort(ta, rh, met, clo):
    ref = pytest.importorskip("pythermalcomfort.models")
    r = ref.two_nodes_gagge(tdb=ta, tr=ta, v=0.1, rh=rh, met=met, clo=clo, round_output=False)
    b = flex.run(met, clo, ta, rh, opts=flex.REF)
    assert abs(b["tsk"] - float(r.t_skin)) < 0.02
    assert abs(b["tcr"] - float(r.t_core)) < 0.02
    assert abs(b["evap"] - float(r.e_skin)) < 0.05
    assert abs(b["dry"] - float(r.q_sensible)) < 0.05


def test_flags_are_independent_switches():
    base_run = flex.run(1.5, 0.7, 36, 80, opts=flex.OURS)
    for f in flex.OURS:
        changed = flex.run(1.5, 0.7, 36, 80, opts=dict(flex.OURS, **{f: "ref"}))
        assert changed != base_run, f
