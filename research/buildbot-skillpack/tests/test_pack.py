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


def test_zero_gains_score_below_hand_set_gains():
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
            # full re-score at the stored seed and episode count, zero tolerance (quality round 103:
            # a 200-episode redraw with 0.08 slack failed on cohold-follow-A and missed a seed+1 mutant)
            assert evalpack.compare(s, evalpack.rescore_follow(s, ("A", "B"))) == [], p.name
        else:
            assert evalpack.compare(s, evalpack.rescore_nail(s)) == []


def test_nail_claim_drift_is_caught():
    s = pack.load(SKILLS / "sheathing-nail.json")
    s["claimed"]["sheet_success"] += 0.01
    assert evalpack.compare(s, evalpack.rescore_nail(s)) != []


def test_mixed_skill_is_the_b_only_seed_3_winner():
    # the README discloses that the worse-of-two search picked buildbot-skills' B_random seed 3;
    # this keeps the disclosure true if experiments/run.py is re-run
    rows = json.loads((SKILLS.parents[1] / "buildbot-skills" / "experiments" / "results.json").read_text())
    rows = rows if isinstance(rows, list) else next(v for v in rows.values() if isinstance(v, list) and v and isinstance(v[0], dict) and "policy" in v[0])
    b3 = next(r for r in rows if r.get("policy") == "B_random" and r.get("seed") == 3)
    mixed = pack.load(SKILLS / "cohold-follow-mixed.json")["params"]
    assert all(mixed[k] == pytest.approx(b3[k], rel=1e-12) for k in ("K", "B", "Ki"))
