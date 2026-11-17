"""The paper draft's numbers match the committed results files (paper/check_numbers.py)."""
import importlib.util
import pathlib

HERE = pathlib.Path(__file__).resolve().parent


def test_paper_numbers_match_results():
    spec = importlib.util.spec_from_file_location("check_numbers", HERE / "paper" / "check_numbers.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.main() == 0
