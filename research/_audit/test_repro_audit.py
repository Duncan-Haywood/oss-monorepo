import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import repro_audit as ra  # noqa: E402


def test_compare_exact_ignores_trailing_whitespace():
    assert ra.compare("a 1.0  \nb 2\n", "a 1.0\nb 2") == "exact"


def test_compare_numeric_within_one_percent():
    assert ra.compare("mean 100.0\n", "mean 100.5\n") == "numeric"
    assert ra.compare("mean 100.0\n", "mean 103.0\n") == "differs"


def test_compare_timing_lines_only():
    assert ra.compare("rows 10\nelapsed 3.1 s\n", "rows 10\nelapsed 9.4 s\n") == "timing"


def test_compare_text_change_differs():
    assert ra.compare("best: adder\n", "best: mux\n") == "differs"
    assert ra.compare("a\nb\n", "a\n") == "differs"


def test_readme_commands_skip_tests_and_figures():
    readme = ("```bash\ncd research/x\npython3 -m pytest -q tests\n"
              "PYTHONPATH=src python3 experiments/sweep.py --n 4   # slow\n"
              "python3 experiments/figure.py\npython3 batch.py > out.txt\n```\n")
    assert ra.readme_commands(readme) == ["PYTHONPATH=src python3 experiments/sweep.py --n 4",
                                          "python3 batch.py"]


def test_claim_numbers_skip_method_code_and_dates():
    readme = ("# Q\n\n**Headline.** AUROC 0.935 on 2026-10-17, 1,232 gates (`x = 0.111`).\n\n"
              "## Method\nWe assume 0.777.\n\n## Results\n- ratio 1.43x, 17%\n")
    assert ra.claim_numbers(readme) == ["0.935", "1232", "1.43"]


def test_traced_accepts_rounding_and_percent():
    corpus = "auroc 0.93462\nshare 0.1734\ngates 1232\n"
    assert ra.traced(["0.935", "17.34", "1232", "4.56"], corpus) == 3


def test_specific_drops_round_numbers():
    assert not ra.specific("100") and not ra.specific("2.0") and not ra.specific("12")
    assert ra.specific("0.935") and ra.specific("1232")


def test_run_one_compares_rewritten_results(tmp_path):
    d = tmp_path / "research" / "toy"
    (d / "experiments").mkdir(parents=True)
    (d / "experiments" / "results.txt").write_text("x 1\n")
    (d / "experiments" / "run.py").write_text("print('x 1')\n")
    rec = ra.run_one(tmp_path, "toy", sys.executable, 30)
    assert rec["outcome"] == "exact" and rec["source"] == "stdout"
    (d / "experiments" / "run.py").write_text(
        "from pathlib import Path\nPath('experiments/results.txt').write_text('x 2\\n')\n")
    assert ra.run_one(tmp_path, "toy", sys.executable, 30)["outcome"] == "differs"


def test_run_one_reports_missing_module(tmp_path):
    d = tmp_path / "research" / "toy"
    (d / "experiments").mkdir(parents=True)
    (d / "experiments" / "results.txt").write_text("x\n")
    (d / "experiments" / "run.py").write_text("import not_a_real_module_xyz\n")
    rec = ra.run_one(tmp_path, "toy", sys.executable, 30)
    assert rec["outcome"] == "missing-dep" and rec["dep"] == "not_a_real_module_xyz"


def test_input_basis():
    base = dict(has_data_dir=False, data_kb=0, real_words=0, assumed_words=0)
    assert ra.input_basis(base) == "assumed"
    assert ra.input_basis({**base, "has_data_dir": True}) == "measured"
    assert ra.input_basis({**base, "has_data_dir": True, "assumed_words": 4}) == "mixed"


def test_committed_audit_is_current_list_of_projects():
    data = Path(__file__).parent / "audit.json"
    if not data.exists():
        return
    rows = json.loads(data.read_text())["projects"]
    assert len(rows) >= 700
    assert all({"slug", "outcome", "input_basis"} <= set(r) for r in rows)
