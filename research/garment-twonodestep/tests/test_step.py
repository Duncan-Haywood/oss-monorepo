import os, sys, pytest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodestep import step as st
from garment_twonodeswitch import switch as sw

@pytest.mark.parametrize("opts", [st.OURS, st.REF])
def test_constant_env_callback_matches_constant_room(opts):
    a, _ = sw.run("hot 31 C", opts, tau=st.OPEN)
    b, _ = st.simulate(31.0, 31.0, opts, st.fixed(st.OPEN))
    assert all(abs(a[k] - b[k]) < 1e-9 for k in a)

def test_step_to_cooler_room_cools_skin():
    _, hot = st.simulate(31.0, 31.0, st.OURS, st.fixed(st.CLOSED))
    _, step = st.simulate(31.0, 16.0, st.OURS, st.fixed(st.CLOSED))
    assert step[-1][2] < hot[-1][2] - 1.0 and step[10][2] == hot[10][2]   # identical before the step

def test_oracle_no_worse_than_fixed_states():
    for a, b in st.SCENARIOS.values():
        d, _, _ = st.oracle(a, b, st.OURS)
        for tau in (st.CLOSED, st.OPEN):
            assert d <= st.discomfort(st.simulate(a, b, st.OURS, st.fixed(tau))[1]) + 1e-12

def test_discomfort_zero_at_neutral():
    assert st.discomfort([(0, 0.15, 33.7, 36.8)] * 3) == 0.0
