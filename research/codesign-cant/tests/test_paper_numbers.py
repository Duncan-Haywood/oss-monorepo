"""The paper draft quotes only numbers its results files still hold (paper/check_numbers.py)."""
import importlib.util, os

HERE = os.path.dirname(os.path.abspath(__file__))


def test_paper_draft_numbers_match_results_files():
    spec = importlib.util.spec_from_file_location("check_numbers", os.path.join(HERE, "..", "paper", "check_numbers.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    assert m.main() == 0
