import importlib.util
import pathlib

_d = pathlib.Path(__file__).resolve().parents[1] / "experiments" / "hub_airspace"
_s = importlib.util.spec_from_file_location("hub_airspace_sized_guard", _d / "sized_guard.py")
sg = importlib.util.module_from_spec(_s)
_s.loader.exec_module(sg)

A = (0, 0, 1, 0, 0, 0, 0, 0)
B = (0, 1, 0, 0, 0, 0, 0, 0)


def _w(x01, x02):
    return {(0, 1, "enr"): x01, (0, 2, "enr"): x02}


def test_interleave_skips_repeats():
    assert sg.interleave([3, 1, 2, 0], [1, 0, 3, 2]) == [3, 1, 0, 2]


def test_pooled_sums_batches():
    assert sg.pooled([_w(5, 1), _w(2, 3)], A) == 7  # A keeps (0,1) together
    assert sg.pooled([_w(5, 1), _w(2, 3)], B) == 4


def test_single_candidate_needs_no_batch():
    assert sg.choose_seq([A], [_w(1, 2)] * 5) == (A, 0)
    assert sg.choose_fixed([A], [_w(1, 2)] * 5) == (A, 0)


def test_seq_stops_early_on_clear_gap():
    # B scores x02, A scores x01; B always far lower with no spread
    assert sg.choose_seq([A, B], [_w(10, 1)] * 5) == (B, 2)


def test_seq_runs_to_cap_on_noise():
    bs = [_w(10, 1), _w(1, 10), _w(10, 1), _w(1, 10), _w(10, 2)]
    choice, used = sg.choose_seq([A, B], bs)
    assert used == 5 and choice == B
