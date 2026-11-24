"""Tests for verticals.py: each venture's customer vertical and the bet it feeds."""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import verticals as v  # noqa: E402


def vert(slug, category=None, desc=""):
    return v.vertical_for(slug, category, desc)[0]


def test_slug_rules_pick_specific_verticals():
    assert vert("pay-application-generator") == "construction"
    assert vert("retainage-cashflow-calculator") == "construction"
    assert vert("cnc-machining-quote-calculator") == "manufacturing-engineering"
    assert vert("csv-to-sepa-pain001") == "eu-einvoicing-accounting"
    assert vert("grant-deadline-tracker") == "nonprofits"
    assert vert("rent-roll-delinquency-analyzer") == "landlords"
    assert vert("etsy-profit-calculator") == "online-sellers"
    assert vert("youtube-sponsorship-rate-calculator") == "creators"
    assert vert("self-employment-tax-calculator") == "freelancers"
    assert vert("open-robot-mower") == "hardware-open-designs"


def test_word_boundaries_hold():
    # each of these once matched a broader word inside the slug
    assert vert("vending-machine-route-margin") != "manufacturing-engineering"   # machin
    assert vert("menu-engineering-calculator") != "manufacturing-engineering"   # engineering
    assert vert("late-invoice-collections-kit") != "eu-einvoicing-accounting"   # e-invoic
    assert vert("uk-vat-registration-checker") != "eu-einvoicing-accounting"    # uk vat is not EU
    assert vert("section-83b-election-calculator") != "landlords"               # section-8
    assert vert("aba-authorization-tracker") != "creators"                      # author
    assert vert("merchant-cash-advance-true-cost-calculator") != "creators"     # merch
    assert vert("actions-schedule-check", "ci") == "other"                      # schedule-c
    assert vert("k8s-pod-security-check", "ci") == "other"                      # pod-
    assert vert("claude-skill-scaffold-generator", "ci") == "other"             # scaffold
    assert vert("car-lease-deal-checker") == "consumer"                         # lease


def test_specific_beats_broad():
    assert vert("eu-vat-oss-calculator") == "eu-einvoicing-accounting"
    assert vert("charitable-deduction-calculator") == "consumer"  # the donor's tax, not the charity's
    assert vert("pressure-washing-bid-calculator", "trades") == "local-services"
    assert vert("owner-operator-cpm-calculator", "logistics") == "other"


def test_category_then_description_then_fallback():
    assert v.vertical_for("zzz-tool", "trades", "") == ("construction", "category:trades")
    assert v.vertical_for("zzz-tool", "food-service", "") == ("local-services", "category:food-service")
    # a generic category leaves it to the description
    assert v.vertical_for("zzz-tool", "backoffice", "For Etsy and eBay sellers.")[0] == "online-sellers"
    assert v.vertical_for("zzz-tool", "backoffice", "Checks a Peppol UBL file.")[0] == "eu-einvoicing-accounting"
    assert v.vertical_for("zzz-tool", "backoffice", "Paste a file.") == ("other", "fallback")
    # "independent contractors" is a payroll word, not a construction one
    assert v.vertical_for("zzz-tool", "backoffice", "for 1099 independent contractors")[0] != "construction"


def test_research_list_wins_over_slug():
    assert v.vertical_for("spc-thing", None, "", frozenset({"spc-thing"})) == ("research-tool", "research-list")


def test_overrides_carry_reasons_and_valid_values():
    for slug, o in v.OVERRIDES.items():
        assert o["vertical"] in v.VERTICALS, slug
        assert o.get("front_door_for") in (None, *v.BETS), slug
        assert len(o["why"]) > 20, slug


def test_bets_and_front_doors():
    assert v.bet_for("pay-application-generator", "construction") == "payapps"
    assert v.bet_for("roofing-bid-calculator", "construction") == "residential-takeoff"
    assert v.bet_for("basement-waterproofing-bid-calculator", "construction") == "payapps"
    assert v.bet_for("trade-bid-studio", "construction") == "payapps"            # stud in studio
    assert v.bet_for("plumber-flat-rate-price-calculator", "construction") == "payapps"  # lumber in plumber
    assert v.bet_for("cnc-machining-quote-calculator", "manufacturing-engineering") == "jobshop-quote"
    assert v.bet_for("cmmc-sprs-score", "manufacturing-engineering") == "cmmc"
    assert v.bet_for("etsy-profit-calculator", "online-sellers") == "seller-books"
    assert v.bet_for("grant-deadline-tracker", "nonprofits") == "grants"
    assert v.bet_for("dog-grooming-price-calculator", "local-services") is None
    assert v.bet_for("gage-rr", "research-tool") == "cmmc"                         # override


def test_every_bet_names_a_vertical_and_status_follows_bet():
    for key, bet in v.BETS.items():
        assert bet["vertical"] in v.VERTICALS, key
        if bet["match"]:
            re.compile(bet["match"])
    row = v.classify("etsy-profit-calculator", "marketplace", "")
    assert (row["front_door_for"], row["status"]) == ("seller-books", "front-door")
    row = v.classify("dog-grooming-price-calculator", "services", "")
    assert (row["front_door_for"], row["status"]) == (None, "frozen")


def test_description_reads_folded_yaml(tmp_path):
    d = tmp_path / "x"
    d.mkdir()
    (d / "VENTURE.yaml").write_text("name: x\ndescription: >-\n  For Etsy\n  sellers.\nstage: prototype\n")
    assert v.description(d) == "For Etsy sellers."


def test_committed_json_is_consistent():
    """verticals.json covers every venture once, with valid values, and its
    counts add up. (`--check` also proves it matches the rules; that needs node.)"""
    data = json.loads(v.OUT.read_text())
    rows = data["ventures"]
    slugs = [r["venture"] for r in rows]
    assert len(slugs) == len(set(slugs)) == data["counts"]["ventures"]
    assert set(slugs) == set(v.ventures())
    for r in rows:
        assert r["vertical"] in v.VERTICALS
        assert r["front_door_for"] in (None, *v.BETS)
        assert r["status"] == ("front-door" if r["front_door_for"] else "frozen")
    assert sum(data["counts"]["by_vertical"].values()) == len(rows)
