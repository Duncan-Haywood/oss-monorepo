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


def _cruise_hybrid():
    import sys
    d = os.path.join(os.path.dirname(__file__), "..", "experiments", "vtol_sizing")
    sys.path.insert(0, d)
    import cruise_sized_hybrid as ch
    return ch

def test_cruise_sized_hybrid_hand_check():
    # hand count: hover 129.2 W/kg, 1.2 x cruise 9.80665*30/(12*0.85)*1.2 = 34.6 W/kg
    ch = _cruise_hybrid()
    ph = 9.80665 * (150 / (2 * 1.225)) ** 0.5 / (0.7 * 0.85)
    assert abs(ph - 129.2) < 0.5
    free0 = ch.hyb_cruise(0.0, 0.479, 1, .25, .20)
    eng = 1.2 * 9.80665 * 30 / (12 * .85) / 1000
    batt = max((ph - 1.2 * 9.80665 * 30 / (12 * .85)) * 120 / 3600 * 1.2 / (250 * .7 * .9),
               (ph - 1.2 * 9.80665 * 30 / (12 * .85)) / 1500)
    assert abs(free0 - (1 - .479 - eng - batt)) < 1e-9

def test_cruise_sizing_beats_hover_sizing_at_low_engine_power():
    ch = _cruise_hybrid()
    import hybrid_mass_law as hm
    assert ch.hyb_cruise(150e3, .479, .5, .25, .2) > hm.hyb_free(150e3, .479, .5, .25, .2)


def test_total_effect_indices_on_additive_toy():
    # Jansen estimators on f = x0 + 2*x1 (uniform 0..1): S = ST = 0.2, 0.8 exactly (no interaction)
    import random, sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments", "vtol_sizing"))
    from total_effect import idx
    rng = random.Random(0); N = 20000
    A = [(rng.random(), rng.random()) for _ in range(N)]
    B = [(rng.random(), rng.random()) for _ in range(N)]
    f = lambda x: x[0] + 2 * x[1]
    fa, fb = [f(x) for x in A], [f(x) for x in B]
    fab1 = [f((b[0], a[1])) for a, b in zip(A, B)]
    s1, st = idx(fa, fb, fab1, list(range(N)))
    assert abs(s1 - 0.2) < 0.02 and abs(st - 0.2) < 0.02
