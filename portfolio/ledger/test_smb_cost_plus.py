"""Tests for portfolio/smb/cost_plus.py and the committed YAML it reads.

Kept here, not in portfolio/smb/, so the merge checklist's existing
portfolio/ledger line runs them (the same arrangement as test_monetization.py);
adding a checklist line means editing an owner-gated file.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "smb"))
import cost_plus as cp  # noqa: E402


def basis(**over):
    b = {
        "merchant": {"pct": 0.05, "fixed_usd": 0.50, "source": "x", "read": "2026-11-24"},
        "markup": {"default": 1.5},
        "amortize_build_months": 24,
        "platform_monthly": [{"item": "host", "usd": 5, "kind": "published",
                              "source": "x", "read": "2026-11-24"}],
        "custom_work": {"hour_usd": 100, "kind": "assumption", "why": "t"},
        "suites": [{
            "slug": "s", "plan_shops": 10,
            "shared_monthly": [{"item": "upkeep", "usd": 95, "kind": "assumption", "why": "t"}],
            "per_shop_monthly": [{"item": "llm", "usd": 10, "kind": "published",
                                  "source": "x", "read": "2026-11-24"}],
            "build_once": [{"item": "build", "usd": 2400, "kind": "assumption", "why": "t"}],
        }],
    }
    b.update(over)
    return b


def test_merchant_gross_up_round_trips():
    m = cp.Merchant(0.05, 0.50)
    price = m.gross_up(100)
    assert price - m.fee(price) == pytest.approx(100)


def test_quote_is_cost_times_markup_after_fee():
    q = cp.quote(basis(), "s", shops=10)
    # shared: (5 + 95 + 2400/24) / 10 = 20; variable 10 -> cost 30
    assert q.cost == pytest.approx(30)
    assert q.price - q.fee == pytest.approx(45)  # 30 * 1.5 reaches us after Paddle
    assert q.margin == pytest.approx(15)


def test_price_falls_as_shops_share_the_suite():
    prices = [cp.quote(basis(), "s", n).price for n in (1, 10, 100)]
    assert prices[0] > prices[1] > prices[2]
    # never below variable cost x markup, grossed up
    floor = cp.Merchant(0.05, 0.5).gross_up(10 * 1.5)
    assert prices[2] > floor


def test_assumed_share_counts_only_assumption_lines():
    q = cp.quote(basis(), "s", shops=10)
    # assumption: (95 + 100)/10 = 19.5 of 30
    assert q.assumed_share == pytest.approx(19.5 / 30)


def test_markup_below_one_is_refused():
    with pytest.raises(ValueError):
        cp.quote(basis(), "s", 10, markup=0.9)


def test_shops_for_mrp():
    # contribution at $50: 50 - (2.5 + 0.5) - 10 = 37; fixed 200
    assert cp.shops_for_mrp(basis(), "s", 50, goal=10_000) == 276
    assert cp.shops_for_mrp(basis(), "s", 10) is None


def test_custom_work_quote():
    c = cp.custom_work(basis(), 10)
    assert c["cost"] == 1000
    assert c["price"] - c["fee"] == pytest.approx(1500)


def test_check_flags_unsourced_and_unexplained_lines():
    b = basis()
    b["suites"][0]["per_shop_monthly"].append({"item": "x", "usd": 1, "kind": "published"})
    b["suites"][0]["shared_monthly"].append({"item": "y", "usd": 1, "kind": "assumption"})
    b["suites"][0]["build_once"].append({"item": "z", "usd": 1, "kind": "guess"})
    errs = cp.check_cost_basis(b)
    assert any("needs a source" in e for e in errs)
    assert any("needs a why" in e for e in errs)
    assert any("kind must be" in e for e in errs)


def test_check_verticals_requires_evidence_urls():
    rows = [{"slug": "v", "name": "n", "group": "g", "suite_modules": ["a"],
             "first_module": {"module": "a", "why": "b"},
             "pain_points": [{"pain": "p", "evidence": [{"source": "no url", "says": "s"}]}],
             "compliance": [{"rule": "r", "source": "https://x"}]}]
    errs = cp.check_verticals(rows)
    assert len(errs) == 1 and "evidence with a URL" in errs[0]


def test_committed_files_validate():
    errs = cp.check_cost_basis(cp.load())
    if cp.VERTICALS.exists():
        errs += cp.check_verticals(yaml.safe_load(cp.VERTICALS.read_text(encoding="utf-8")))
    assert errs == []


def test_report_runs_for_every_committed_suite():
    b = cp.load()
    for s in b["suites"]:
        assert s["slug"] in cp.report(b, s["slug"], None)
