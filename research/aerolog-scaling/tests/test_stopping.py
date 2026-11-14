import importlib.util
import pathlib

_d = pathlib.Path(__file__).resolve().parents[1] / "experiments" / "hub_airspace"
_s = importlib.util.spec_from_file_location("hub_airspace_stopping", _d / "stopping.py")
st = importlib.util.module_from_spec(_s)
_s.loader.exec_module(st)


def test_stop_stable_first_repeat():
    assert st.stop_stable(["a", "b", "b", "c", "c", "c", "d", "d", "d"], 1) == 2
    assert st.stop_stable(["a", "b", "b", "c", "c", "c", "d", "d", "d"], 2) == 5


def test_stop_stable_never_returns_last_index():
    assert st.stop_stable(list("abcdefghi"), 1) == 8


def test_distinct_keeps_first_occurrence_order():
    assert st.distinct(["a", "b", "a", "c", "b"]) == ["a", "b", "c"]


def test_path_picks_reads_prefixes():
    pick = {D: len(D) * 10 + (1 if 3 in D else 0) for D in st.SUBSETS}
    path = st.path_picks(pick, [3, 0, 1, 2, 4, 5, 6, 7])
    assert path[0] == 0 and path[1] == 11 and path[8] == 81


def test_guard_choice_picks_lowest_short_score():
    short = {(0, 1, "enr"): 5.0, (0, 2, "enr"): 1.0, (1, 2, "enr"): 1.0}
    a = (0, 0, 1, 0, 0, 0, 0, 0)
    b = (0, 1, 0, 0, 0, 0, 0, 0)
    assert st.guard_choice([a, b], short) == b
