"""The paper's pre-registration table matches LOG.md (paper/prereg_count.py)."""
import importlib.util
import pathlib

HERE = pathlib.Path(__file__).resolve().parent


def _mod():
    spec = importlib.util.spec_from_file_location("prereg_count", HERE / "paper" / "prereg_count.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_table_matches_log():
    assert _mod().main(["--check"]) == 0


def test_every_entry_has_one_verdict_per_prediction():
    mod = _mod()
    rows = mod.recount(mod.LOG.read_text(encoding="utf-8"))
    assert len(rows) == 22
    for r in rows:
        assert r["held"] + r["partly"] + r["refuted"] == r["n"] == len(r["verdicts"])


def test_check_catches_a_wrong_total():
    mod = _mod()
    rows = mod.recount(mod.LOG.read_text(encoding="utf-8"))
    draft = mod.DRAFT.read_text(encoding="utf-8")
    bad = draft.replace("| **milestones 5 and 6** | | **62** | **35** |", "| **milestones 5 and 6** | | **62** | **36** |")
    assert bad != draft
    assert any("milestones 5 and 6" in e for e in mod.check(rows, bad))


def test_unknown_verdict_phrase_fails():
    mod = _mod()
    log = ("## 2026-01-02 · Milestone 6 (part): x\n\n- Predictions: (1) a; (2) b.\n"
           "- **Outcome**: (1) **Held**: yes. (2) **Sort of**: hm.\n")
    try:
        mod.recount(log)
    except SystemExit as e:
        assert "unclassified" in str(e)
    else:
        raise AssertionError("an unknown phrase must fail")
