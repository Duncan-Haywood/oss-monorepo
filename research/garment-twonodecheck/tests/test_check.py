import warnings
import pytest
from garment_twonodecheck.model import Fabric, Env, two_node

ref = pytest.importorskip("pythermalcomfort.models")
warnings.simplefilter("ignore")


def both(ta, rh, met, clo):
    r = ref.two_nodes_gagge(tdb=ta, tr=ta, v=0.1, rh=rh, met=met, clo=clo, round_output=False)
    o = two_node(met, Fabric(clo=clo, im=0.45), Env(ta, ta, 0.1, rh), minutes=60)
    return o, r


@pytest.mark.parametrize("ta,rh,met,clo", [(18, 30, 1.0, 0.3), (24, 60, 1.5, 0.7), (30, 60, 1.0, 0.7), (36, 80, 2.0, 0.3)])
def test_core_temperature_close(ta, rh, met, clo):
    o, r = both(ta, rh, met, clo)
    assert abs(o["tcr"] - float(r.t_core)) < 0.3


@pytest.mark.parametrize("ta,rh,met,clo", [(18, 30, 1.0, 0.3), (24, 60, 1.5, 0.7), (36, 80, 2.0, 0.3)])
def test_skin_temperature_within_2_5(ta, rh, met, clo):
    o, r = both(ta, rh, met, clo)
    assert abs(o["tsk"] - float(r.t_skin)) < 2.5


def test_hotter_air_warms_skin_in_both():
    lo, rlo = both(24, 50, 1.2, 0.5)
    hi, rhi = both(34, 50, 1.2, 0.5)
    assert hi["tsk"] > lo["tsk"] and float(rhi.t_skin) > float(rlo.t_skin)
