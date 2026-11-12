"""The paper draft quotes only numbers its results files contain (paper/check_numbers.py)."""
import importlib.util
import pathlib

HERE = pathlib.Path(__file__).resolve().parent.parent


def _load():
    spec = importlib.util.spec_from_file_location("check_numbers", HERE / "paper" / "check_numbers.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_every_quoted_number_is_in_its_results_file():
    assert _load().main() == 0


def test_checker_catches_a_changed_number():
    mod = _load()
    mod.CHECKS = [(mod.M7, "hand crew $/sheet: median 5.21", "a two-person crew's $9.99")]
    assert mod.main() == 1
