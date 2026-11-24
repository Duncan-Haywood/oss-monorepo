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


def bet_row(**kw):
    base = row(
        app="private-monorepo/apps/payapps", bet=1, billing="subscription", rail="paddle",
        checkout="dark", cost_drivers=["storage"],
        tiers=[{"name": "Solo", "price": "$99 a month", "status": "proposal", "why": "matches a comparable"}],
    )
    del base["venture"]
    base.update(kw)
    return base


def test_bet_row_without_a_ventures_dir_is_valid():
    assert m.check({"products": [bet_row()]}) == []
    assert m.row_name(bet_row()) == "app:payapps"


def test_bet_row_tier_must_be_a_labelled_proposal_with_reasoning():
    errs = m.check({"products": [bet_row(tiers=[{"name": "Solo", "price": "$99"}])]})
    assert any("status: proposal" in e for e in errs)
    errs = m.check({"products": [bet_row(tiers=[{"name": "Solo", "price": "$99", "status": "proposal"}])]})
    assert any("needs `why`" in e for e in errs)


def test_bet_row_needs_paddle_dark_and_cost_drivers():
    r = bet_row(rail="stripe", checkout="live", billing="rent")
    del r["cost_drivers"]
    errs = m.check({"products": [r]})
    assert any("rail must be paddle" in e for e in errs)
    assert any("checkout live needs stage live" in e for e in errs)
    assert any("billing must be" in e for e in errs)
    assert any("missing `cost_drivers`" in e for e in errs)
    errs = m.check({"products": [bet_row(app="apps/payapps")]})
    assert any("`app` must be" in e for e in errs)


def test_queue_puts_bets_first_in_bet_order():
    data = {"products": [
        row(venture="b", stage="built-dark", liability="low"),
        bet_row(app="private-monorepo/apps/two", bet=2),
        bet_row(app="private-monorepo/apps/one", bet=1, stage="planned"),
    ]}
    assert [m.row_name(r) for r in m.queue(data)] == ["app:one", "app:two", "b"]


def test_committed_file_has_a_row_per_flagship_bet():
    import yaml
    flag = yaml.safe_load((Path(__file__).resolve().parents[1] / "flagships.yaml").read_text())
    bets = {e["app"]: e["bet"] for e in flag["flagships"] if "bet" in e}
    rows = {r["app"]: r["bet"] for r in m.load()["products"] if r.get("app")}
    assert bets and rows == bets
