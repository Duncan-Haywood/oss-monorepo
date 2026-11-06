import importlib.util, os
spec = importlib.util.spec_from_file_location("vs", os.path.join(os.path.dirname(__file__), "..", "experiments", "vtol_sizing", "run.py"))
vs = importlib.util.module_from_spec(spec); spec.loader.exec_module(vs)

def test_zero_range_closes():
    assert vs.mtow(100, 0.0, 250) > 100

def test_range_linear_in_cell_energy():
    r = [vs.max_range(100, e) for e in (200, 300, 400)]
    assert abs((r[1] - r[0]) - (r[2] - r[1])) < 0.5

def test_more_structure_less_range():
    assert vs.max_range(100, 250, fs=0.45) < vs.max_range(100, 250, fs=0.30)

def test_closure_fails_when_fractions_exceed_one():
    assert vs.mtow(100, 1e6, 100) is None

def test_jet_fuel_value():
    assert abs(vs.E_FUEL - 11944) < 1
