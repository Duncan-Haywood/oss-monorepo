import copy
import json
from pathlib import Path

import pytest

from buildbot_skillpack import evalpack, pack

SKILLS = Path(__file__).resolve().parents[1] / "skills"


def good():
    return {"schema": pack.SCHEMA, "name": "t", "kind": "cohold-follow", "version": "1.0.0", "licence": "MIT",
            "interface": {}, "params": {"K": 1000.0, "B": 150.0, "Ki": 0.0}, "scene": {"test_seed": 1, "n_episodes": 20},
            "criteria": {"tilt_peak_deg": 3.0, "tilt_end_deg": 0.5}, "claimed": {}, "caveats": ["Simulated; not a rated capability."]}


def test_good_skill_validates():
    assert pack.validate(good())["name"] == "t"


@pytest.mark.parametrize("edit", [
    lambda d: d.pop("caveats"), lambda d: d.update(schema="other/9"), lambda d: d.update(kind="weld"),
    lambda d: d["params"].pop("Ki"), lambda d: d["params"].update(K=-5.0), lambda d: d["params"].update(B=True),
    lambda d: d.update(caveats=[]), lambda d: d.update(caveats=["Works well."])])
def test_bad_skills_are_rejected(edit):
    d = good()
    edit(d)
    with pytest.raises(pack.SkillError):
        pack.validate(d)


def test_round_trip(tmp_path):
    pack.save(good(), tmp_path / "t.json")
    assert pack.load(tmp_path / "t.json") == good()


def test_rescore_is_deterministic_and_compare_flags_a_changed_claim():
    d = good()
    a = evalpack.rescore_follow(d, ("A", "B"))
    assert a == evalpack.rescore_follow(d, ("A", "B"))
    d["claimed"] = {k: dict(v) for k, v in a.items()}
    assert evalpack.compare(d, a) == []
    d2 = copy.deepcopy(d)
    d2["claimed"]["A"]["success"] += 0.05
    assert [b[0] for b in evalpack.compare(d2, a)] == ["A"]


def test_stiffer_gain_than_the_hand_set_one_changes_the_answer():
    # the harness must be able to tell two skills apart: no gains at all cannot hold a sheet
    zero = good()
    zero["params"] = {"K": 1.0, "B": 0.0, "Ki": 0.0}
    r0 = evalpack.rescore_follow(zero, ("A",))["A"]["success"]
    r1 = evalpack.rescore_follow(good(), ("A",))["A"]["success"]
    assert r0 < r1


def test_nail_skill_budget_matches_studfind_headline():
    d = {"params": {"s_read_mm": 0.89, "s_tool_mm": 0.9}}
    assert evalpack.rescore_nail(d)["sheet_success"] == pytest.approx(0.95, abs=0.03)


def test_published_files_load_and_claims_reproduce():
    files = sorted(SKILLS.glob("*.json"))
    if not files:
        pytest.skip("run experiments/run.py first")
    for p in files:
        s = pack.load(p)
        if s["kind"] == "cohold-follow":
            s2 = copy.deepcopy(s)
            s2["scene"]["n_episodes"] = 200      # a quick consistency check; the full claim is re-scored by run.py
            got = evalpack.rescore_follow(s2, ("A", "B"))
            for k in got:
                assert abs(got[k]["success"] - s["claimed"][k]["success"]) < 0.08
        else:
            assert evalpack.compare(s, evalpack.rescore_nail(s)) == []
