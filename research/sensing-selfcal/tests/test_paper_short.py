"""The letter version (paper/ral.md) quotes only numbers that are in the checked draft."""
import importlib.util, pathlib

HERE = pathlib.Path(__file__).resolve().parent.parent / "paper"


def _load():
    spec = importlib.util.spec_from_file_location("check_short", HERE / "check_short.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_letter_numbers_come_from_draft():
    assert _load().main() == 0


def test_number_match_is_exact():
    m = _load()
    m.DRAFT = "rates 0.591 and 33.1% and 12"
    assert m.in_draft("33.1") and m.in_draft("12")
    assert not m.in_draft("0.59") and not m.in_draft("3.1") and not m.in_draft("1")
