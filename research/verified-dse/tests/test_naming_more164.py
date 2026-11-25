"""Milestone 164: two fresh random namings on the six near-zero designs (the draw rule, the prefix rule, and the committed results)."""
import importlib.util
import json
from pathlib import Path

NM = Path(__file__).resolve().parents[1] / "experiments" / "naming_more"


def _load():
    spec = importlib.util.spec_from_file_location("vdse_t164", NM / "run.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _T():
    def rows(tag, st):
        return [{"design": "x", "seq": [str(j)], "status": s, "tag": tag, "period_ns": 10.0,
                 "global_place_area": 1.0, "global_place_wns": 1.0, "detail_place_area": 1.0, "detail_place_wns": 1.0,
                 "final_area_notap": 1.0, "final_wns": 1.0} for j, s in enumerate(st)]
    return {"Y": rows("Y", ["ok", "ok", "fail"]), "C": rows("C", ["ok", "fail", "fail"]), "R": rows("R", ["ok", "fail", "fail"]),
            "R2": rows("R2", ["ok", "fail", "fail"]), "R3": rows("R3", ["ok", "ok", "fail"])}


def test_one_naming_draws_take_only_ok_namings():
    m = _load()
    T = _T()
    assert [r["tag"] for r in m.draw(T, "one", 1, 7)] == [r["tag"] for r in m.draw(T, "one", 1, 7)]
    tags0, tags1 = set(), set()
    for j in range(80):
        out = m.draw(T, "one", 1, j)
        tags0.add(out[0]["tag"])
        tags1.add(out[1]["tag"])
        assert out[2]["tag"] == "Y" and out[2]["status"] == "fail"
    assert tags0 == set(m.FIVE) and tags1 == {"Y", "R3"}


def test_k_average_uses_at_most_the_ok_namings():
    m = _load()
    T = _T()
    T["R3"][1]["final_area_notap"] = 4.0
    seen = {m.draw(T, "avg", 4, j)[1]["final_area_notap"] for j in range(10)}
    assert seen == {2.0}  # only Y (1.0) and R3 (4.0) are ok: geometric mean 2, whatever k asks for
    assert {round(m.draw(T, "avg", 1, j)[1]["final_area_notap"], 9) for j in range(60)} == {1.0, 4.0}


def test_prefix_rule_and_design_order():
    m = _load()
    assert m.D6 == ["gtc24r", "dot6r", "gtc12r", "clamp2r", "dot4l", "div12l"]
    rs = [{"design": "gtc24r", "variant": v, "i": i} for v in m.NEW for i in range(120)]
    rs += [{"design": "gtc12r", "variant": v, "i": i} for v in m.NEW for i in range(120)]
    assert m.complete(rs) == ["gtc24r"]  # dot6r is missing, so gtc12r does not count


def test_six_designs_are_the_near_zero_ones_of_milestone_162():
    fixed = json.loads((NM.parent / "naming_draws" / "draws.json").read_text())["fixed"]["A3"]
    assert sorted(x for x, v in fixed.items() if abs(v) < 3) == sorted(_load().D6)


def test_committed_results():
    got = json.loads((NM / "draws.json").read_text())
    f = got["fixed"]
    assert sorted(f["A5"]) == sorted(_load().D6)
    A3 = json.loads((NM.parent / "naming_draws" / "draws.json").read_text())["fixed"]["A3"]
    assert all(abs(f["A3"][x] - A3[x]) < 0.01 for x in f["A3"])  # control 2
    assert all(abs(v) < 3 for v in f["A5"].values())  # prediction 3
    inside = sum(abs(f[v][x] - f["A3"][x]) <= 2 * got["s163"][x] for x in f["A3"] for v in ("R2", "R3"))
    assert inside == 7  # the primary, refuted (needed 10 of 12)
    txt = (NM / "results.txt").read_text()
    assert txt.count(": held") == 4 and txt.count(": refuted") == 1
    assert "1235 of 1235" in txt
