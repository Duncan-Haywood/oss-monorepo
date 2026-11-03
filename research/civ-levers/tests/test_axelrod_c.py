"""The compiled Axelrod core (src/civ_levers/axelrod.c) agrees with culture.py."""
import os
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src", "civ_levers", "axelrod.c")
EXE = os.path.join(tempfile.gettempdir(), "civ_axelrod_test")


def _run(L, F, q, runs, seed=1):
    subprocess.run(["gcc", "-O2", "-o", EXE, SRC], check=True)
    out = subprocess.run([EXE, str(L), str(F), str(q), str(seed), str(runs)],
                         capture_output=True, text=True, check=True).stdout
    return [tuple(map(float, ln.split())) for ln in out.strip().splitlines()]


def test_single_trait_is_one_region():
    assert all(s == 1.0 and r == 1 for s, r, _ in _run(8, 3, 1, 3))


def test_base_case_matches_python_model():
    # culture.py: 4.55 +- 0.36 regions over 300 runs (F 5, q 10, 10 x 10)
    rows = _run(10, 5, 10, 300)
    mean = sum(r for _, r, _ in rows) / len(rows)
    assert 4.0 <= mean <= 5.1


def test_transition_is_sharp_for_three_features():
    ordered = _run(24, 3, 6, 4)
    disordered = _run(24, 3, 30, 4)
    assert min(s for s, _, _ in ordered) > 0.9
    assert max(s for s, _, _ in disordered) < 0.1
