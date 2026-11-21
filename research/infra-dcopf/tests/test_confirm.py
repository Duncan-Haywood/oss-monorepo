"""The confirmation split (experiments/run_confirm.py) is unused before, complete and scoreable."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "experiments"))


def test_split_is_disjoint_from_earlier_sets():
    import ast
    src = (HERE.parent / "experiments" / "run_confirm.py").read_text()
    nets = next(ast.literal_eval(n.value) for n in ast.parse(src).body
                if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "NETS")
    held = (HERE.parent / "experiments" / "run_heldout.py").read_text()
    assert len(nets) == 11 and all(2000 < int("".join(c for c in n[4:8] if c.isdigit())) < 3000 for n in nets)
    assert not any(f'"{n}"' in held for n in nets)


def test_every_case_has_a_file_and_a_published_objective():
    sys.path.insert(0, str(HERE.parent / "src"))
    from infra_dcopf.pglib import baseline, case_path
    import ast
    src = (HERE.parent / "experiments" / "run_confirm.py").read_text()
    nets = next(ast.literal_eval(n.value) for n in ast.parse(src).body
                if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "NETS")
    b = baseline()
    for n in nets:
        for k in ("typ", "api", "sad"):
            assert case_path(n, k).exists()
            assert (n, k) in b and b[(n, k)][1] > 0


def test_rescue_arm_covers_exactly_the_no_start_cases_and_scores_them():
    import run_confirm_rescue as rr
    cases = rr.no_start_cases()
    assert len(cases) == 10
    txt, res = rr.summary()
    assert "PENDING" not in txt and "ERROR" not in txt
    assert res["pips"] == 0 and res["clarabel"] + res["pips"] <= len(cases)
    assert res["finishers"] <= res["full"] <= res["clarabel"]
