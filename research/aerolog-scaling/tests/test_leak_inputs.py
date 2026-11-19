import importlib.util
import os

import pytest

np = pytest.importorskip("numpy")

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
spec = importlib.util.spec_from_file_location("leak_inputs_test", os.path.join(HERE, "leak_inputs.py"))
li = importlib.util.module_from_spec(spec)
spec.loader.exec_module(li)


def _layout(m, idx):
    rng = np.random.default_rng(idx)
    w = {(i, j, z): float(rng.random()) / 3.0 for i in range(m) for j in range(m) for z in ("enr", "dep")}
    return {"m": m, "idx": idx, "cfD+": w, "opp": dict(list(w.items())[:5]),
            "T": {"A": rng.random((m, m)), "B": rng.random((m, m))}, "cpu": {"cfD+": 1.5, "opp": np.float64(2.0)}}


def test_round_trip_is_exact(tmp_path):
    done = {(4, 1): _layout(4, 1), (3, 7): _layout(3, 7)}
    p = str(tmp_path / "x.json.gz")
    li.dump(done, p)
    back = li.load(p)
    assert sorted(back) == sorted(done)
    assert li.max_diff(back, done) == 0.0
    assert isinstance(back[(4, 1)]["T"]["A"], np.ndarray)
    assert back[(4, 1)]["T"]["A"].dtype == done[(4, 1)]["T"]["A"].dtype
    assert set(back[(3, 7)]["cfD+"]) == set(done[(3, 7)]["cfD+"])


def test_dump_is_deterministic(tmp_path):
    done = {(4, 1): _layout(4, 1)}
    a, b = str(tmp_path / "a.gz"), str(tmp_path / "b.gz")
    li.dump(done, a)
    li.dump(done, b)
    assert open(a, "rb").read() == open(b, "rb").read()


def test_max_diff_sees_structure_changes():
    a = _layout(3, 2)
    b = _layout(3, 2)
    b["T"]["A"] = b["T"]["A"] + 1e-3
    assert abs(li.max_diff(a, b) - 1e-3) < 1e-12
    del b["opp"]
    with pytest.raises(ValueError):
        li.max_diff(a, b)


def test_missing_file_loads_empty(tmp_path):
    assert li.load(str(tmp_path / "none.gz")) == {}


@pytest.mark.skipif(not os.path.exists(li.PATH), reason="committed inputs absent")
def test_committed_inputs_cover_11ai_layouts():
    done = li.load()
    want = {(m, i) for m, r in ((12, range(1200, 1224)), (16, range(1600, 1624))) for i in r}
    assert set(done) == want
    for (m, i), L in done.items():
        assert (L["m"], L["idx"]) == (m, i)
        assert {"cfD+", "T", "opp"} <= set(L)
        assert all(len(k) == 3 and 0 <= k[0] < m and 0 <= k[1] < m for k in L["cfD+"])
