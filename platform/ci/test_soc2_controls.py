"""Tests for soc2_controls.py: the register stays in step with the checker and the tree."""
from pathlib import Path

import soc2_controls as sc

IDS = ["gov-roles", "ac-mfa", "op-network"]


def reg(**controls):
    return {"scope": ["security"], "controls": controls}


def test_the_committed_register_is_in_step():
    register = sc.load()
    assert sc.validate(register, sc.checker_ids()) == []


def test_the_committed_register_scores_through_the_public_checker():
    result = sc.score(sc.load())
    assert 0 <= result["readiness"] <= 100
    assert result["unanswered"] == []


def test_missing_and_unknown_controls_are_reported(tmp_path: Path):
    problems = sc.validate(reg(**{"gov-roles": {"tsc": ["CC1.3"], "answer": "na", "note": "x"}, "made-up": {}}), IDS, tmp_path)
    assert "ac-mfa: in the checker but missing from the register" in problems
    assert "made-up: not a checker control id" in problems


def test_a_yes_needs_evidence_that_exists(tmp_path: Path):
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs/policy.md").write_text("x")
    ok = {"tsc": ["CC1.3"], "answer": "yes", "evidence": ["docs/policy.md", "docs/"]}
    assert sc.validate(reg(**{"gov-roles": ok}), ["gov-roles"], tmp_path) == []
    bare = {"tsc": ["CC1.3"], "answer": "yes", "evidence": []}
    assert sc.validate(reg(**{"gov-roles": bare}), ["gov-roles"], tmp_path) == ["gov-roles: answered yes with no evidence path"]
    gone = {"tsc": ["CC1.3"], "answer": "yes", "evidence": ["docs/gone.md"]}
    assert sc.validate(reg(**{"gov-roles": gone}), ["gov-roles"], tmp_path) == ["gov-roles: evidence docs/gone.md does not exist"]


def test_anything_short_of_yes_says_why(tmp_path: Path):
    c = {"tsc": ["CC6.1"], "answer": "no", "evidence": []}
    assert sc.validate(reg(**{"ac-mfa": c}), ["ac-mfa"], tmp_path) == ["ac-mfa: answered no with no gap or note saying why"]


def test_answers_and_criteria_are_checked(tmp_path: Path):
    c = {"tsc": ["CC99.1", "A1.2"], "answer": "maybe", "gap": "x"}
    problems = sc.validate(reg(**{"ac-mfa": c}), ["ac-mfa"], tmp_path)
    assert any("answer 'maybe'" in p for p in problems)
    assert any("'CC99.1' is not a Trust Services Criteria reference" in p for p in problems)
    assert not any("A1.2" in p for p in problems)


def test_csv_is_what_the_checker_reads():
    assert sc.answers_csv(reg(**{"ac-mfa": {"answer": "no"}})) == "control-id,answer\nac-mfa,no\n"


def test_bare_yes_and_no_read_as_answers(tmp_path: Path):
    f = tmp_path / "c.yaml"
    f.write_text("controls:\n  ac-mfa: {answer: no}\n  gov-roles: {answer: yes}\n")
    assert {k: v["answer"] for k, v in sc.load(f)["controls"].items()} == {"ac-mfa": "no", "gov-roles": "yes"}
