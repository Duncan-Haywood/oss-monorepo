"""Tests for portfolio/work/workctl.py. Run: python3 -m pytest portfolio/work"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import workctl  # noqa: E402

DIRS = [
    {"id": "a", "title": "A", "kind": "area", "set": "2026-11-03", "source": "README.md",
     "status": "active", "weight": 3, "paths": ["ventures/a/**"]},
    {"id": "b", "title": "B", "kind": "area", "set": "2026-11-03", "source": "README.md",
     "status": "active", "weight": 1, "paths": ["ventures/b-*/**"]},
    {"id": "p", "title": "P", "kind": "principle", "set": "2026-11-03", "source": "README.md",
     "status": "active"},
]


def task(tid, direction, **kw):
    t = {"id": tid, "direction": direction, "title": "T", "done_when": "x",
         "status": "open", "added": "2026-11-03"}
    t.update(kw)
    return t


def test_the_real_files_validate():
    d = workctl.load(workctl.DIRECTIONS, "directions")
    t = workctl.load(workctl.TASKS, "tasks")
    errors, _ = workctl.validate(d, t)
    assert errors == []


def test_validate_catches_bad_references_and_fields():
    tasks = [task("x", "p"), task("y", "nope"), task("y", "a", status="weird"),
             task("z", "a", status="done")]
    errors, _ = workctl.validate(DIRS, tasks)
    text = "\n".join(errors)
    assert "task x: direction p is not an area" in text
    assert "task y: direction nope" in text
    assert "task y: duplicate id" in text
    assert "status must be one of" in text
    assert "task z: a done task needs pr" in text


def test_validate_warns_on_globs_that_match_nothing():
    _, warnings = workctl.validate(DIRS, [], files=["ventures/a/x.mjs"])
    assert warnings == ["direction b: ventures/b-*/** matches nothing yet"]


def test_coverage_counts_commits_per_area():
    commits = [["ventures/a/x.mjs"], ["ventures/b-one/y.mjs", "ventures/a/z"], ["docs/x.md"]]
    assert workctl.coverage(DIRS, commits) == {"a": 2, "b": 1}


def test_rank_prefers_weight_and_starved_directions_and_skips_taken():
    tasks = [task("a1", "a"), task("b1", "b"), task("b2", "b", blocked_on="owner"),
             task("a2", "a", status="done", pr=1), task("a3", "a")]
    # a has all the recent work: its weight-3 pull drops below starved b's.
    ranked = workctl.rank(DIRS, tasks, {"a": 10, "b": 0}, taken={"a3"})
    assert [t["id"] for _, t in ranked] == ["b1", "a1"]
    # with no recent work anywhere, weight decides.
    ranked = workctl.rank(DIRS, tasks, {"a": 0, "b": 0}, taken=set())
    assert [t["id"] for _, t in ranked] == ["a1", "a3", "b1"]


def test_taken_ids_offline_checks_nothing():
    found, note = workctl.taken_ids(offline=True)
    assert found == set() and "offline" in note
