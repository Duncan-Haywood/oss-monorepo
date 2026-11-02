import sys
from pathlib import Path

# Lives in portfolio/ledger/ so the merge checklist's existing pytest line
# covers it; the module is portfolio/monetization/monetization.py.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "monetization"))

import monetization as m  # noqa: E402


def row(**kw):
    base = dict(
        venture="wall-framing-takeoff", buyer="b", liability="medium", model="m",
        first_offer="o", price_hypothesis="p", comparables=[], stage="planned",
        next="do it", next_owner=False,
    )
    base.update(kw)
    return base


def test_committed_file_is_valid():
    assert m.check(m.load()) == []


def test_missing_key_and_bad_stage_are_reported():
    r = row(stage="selling")
    del r["buyer"]
    errs = m.check({"products": [r]})
    assert any("missing `buyer`" in e for e in errs)
    assert any("stage must be" in e for e in errs)


def test_comparable_needs_source_and_date():
    errs = m.check({"products": [row(comparables=[{"what": "X", "price": "$1", "source": "x", "read": "soon"}])]})
    assert any("https source" in e for e in errs)
    assert any("`read` date" in e for e in errs)


def test_live_row_needs_evidence():
    errs = m.check({"products": [row(stage="live")]})
    assert any("needs `evidence`" in e for e in errs)


def test_unknown_venture_is_reported():
    errs = m.check({"products": [row(venture="no-such-venture-xyz")]})
    assert any("no ventures/no-such-venture-xyz" in e for e in errs)


def test_queue_prefers_further_stage_then_lower_liability():
    data = {"products": [
        row(venture="a", stage="planned", liability="low"),
        row(venture="b", stage="built-dark", liability="high"),
        row(venture="c", stage="planned", liability="medium"),
        row(venture="d", stage="none", liability="low", next_owner=True),
        row(venture="e", stage="built-dark", liability="low", parked=True),
        row(venture="f", stage="live", liability="low", evidence="README.md"),
    ]}
    assert [r["venture"] for r in m.queue(data)] == ["b", "a", "c"]
    assert [r["venture"] for r in m.owner_rows(data)] == ["d"]


def test_next_task_names_the_file_to_update():
    task = m.next_task(m.load())
    assert task.startswith("Monetize (")
    assert "portfolio/monetization/models.yaml" in task


def test_empty_queue_says_what_to_do():
    assert "no agent-doable row" in m.next_task({"products": []})
