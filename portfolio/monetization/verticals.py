#!/usr/bin/env python3
"""Assign every venture to a customer vertical and say which paid bet it feeds.

Owner, 2026-11-24: "we move into more vertically integrated paid products
targeting specific types of customers ... keeping 1400 free and only
monetizing 20 seems off". Effort goes by promise, not sunk cost, and free tools
are demoted: a free tool gets work only when it is the front door to a chosen
paid product (`prompts/goals.md`, "Where effort goes"; the ranked bets are in
`bets.md` in this directory).

This file answers three questions per venture, as data the site's front-door
mapping and later runs read (`verticals.json`):

  vertical        which kind of customer the venture serves (VERTICALS below)
  front_door_for  the bet (BETS below) whose buyers it reaches, or null
  status          "front-door" when it feeds a bet, else "frozen" (stays up,
                  gets no new effort beyond fixing what breaks)

How a vertical is decided, first match wins:
  1. OVERRIDES: hand calls with a reason, for what the rules get wrong;
  2. SLUG_RULES: keywords in the slug, most specific vertical first;
  3. CATEGORY_VERTICAL: the category the site build files the tool under
     (`categoryFor` in platform/pages/build.mjs), when that category names a
     kind of customer;
  4. DESC_RULES: keywords in VENTURE.yaml's description, for ventures in the
     site's generic categories (back office, sales, "more");
  5. "other".
Each row records which step decided it (`rule`), so a wrong row points at the
rule to fix.

Usage:
  python3 portfolio/monetization/verticals.py            # summary table
  python3 portfolio/monetization/verticals.py --write    # refresh verticals.json
  python3 portfolio/monetization/verticals.py --check    # verticals.json is current
  python3 portfolio/monetization/verticals.py --show construction   # list one vertical
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VENTURES = ROOT / "ventures"
OUT = Path(__file__).with_name("verticals.json")

VERTICALS = (
    "construction",
    "manufacturing-engineering",
    "online-sellers",
    "eu-einvoicing-accounting",
    "nonprofits",
    "freelancers",
    "landlords",
    "local-services",
    "creators",
    "consumer",
    "hardware-open-designs",
    "research-tool",
    "other",
)

# The ranked bets of bets.md (2026-11-24), each with the vertical whose
# buyers it sells to. `match` narrows a bet to part of a vertical when two
# bets share one (takeoff vs the contractor suite, CMMC vs quoting); the bet
# with `match: None` takes the rest of its vertical.
BETS = {
    "payapps": {"rank": 1, "vertical": "construction", "match": None,
                "name": "Pay-app billing -> contractor suite"},
    "jobshop-quote": {"rank": 2, "vertical": "manufacturing-engineering", "match": None,
                      "name": "AI RFQ-to-quote for job shops"},
    "einvoice": {"rank": 3, "vertical": "eu-einvoicing-accounting", "match": None,
                 "name": "E-invoice fix-and-explain"},
    "cmmc": {"rank": 4, "vertical": "manufacturing-engineering",
             "match": r"cmmc|nist|800-171|dfars|itar|(^|-)iso-?9001|as9100|sprs|(^|-)cui(-|$)|cyber|first-article|quality-manual|calibration|(^|-)ppap|(^|-)ncr(-|$)|corrective",
             "name": "CMMC L1/L2 + ISO 9001 workspace"},
    "seller-books": {"rank": 5, "vertical": "online-sellers", "match": None,
                     "name": "Reseller profit and Schedule C books"},
    "residential-takeoff": {"rank": 6, "vertical": "construction",
                            "match": r"takeoff|framing|(^|-)studs?(-|$)|(^|-)lumber|joist|rafter|truss|(?<!waterp)roof|shingle|siding|sheathing|drywall|(^|-)deck(-|$)|board-feet",
                            "name": "Residential takeoff"},
    "grants": {"rank": 7, "vertical": "nonprofits", "match": None,
               "name": "Grant Autopilot"},
}

# Slug keywords, checked in order; the first vertical whose pattern matches
# wins. Specific verticals sit above broad ones ("etsy-vat" is an e-invoicing
# question before it is a seller one). Patterns anchor on slug word
# boundaries `(^|-)` wherever a bare word sits inside another ("rent" in
# "current", "vat" in "private", "grant" in "migrant").
SLUG_RULES: list[tuple[str, str]] = [
    ("research-tool", r"^$"),  # filled from RESEARCH_SLUGS, see vertical_for
    ("hardware-open-designs", r"^open-|(^|-)pcb(-|$)|kicad|firmware|esp32|arduino|(^|-)bom-"),
    ("eu-einvoicing-accounting",
     r"(^|-)e-?invoic|peppol|xrechnung|zugferd|factur-?x|(^|-)ksef|(^|-)ubl(-|$)|(^|-)(?<!uk-)vat(-|$)|(^|-)oss-|"
     r"datev|gobd|(^|-)sepa(-|$)|(^|-)ustva|(^|-)saf-t|reverse-charge|intrastat|(^|-)camt|(^|-)mt940|"
     r"(^|-)eu-bank|(^|-)pain00"),
    ("consumer", r"charitable-deduction|charity-bunching|donor-advised|cobra-vs-|heat-pump-vs-|car-lease"),
    ("local-services", r"(^|-)lesson|(^|-)tutor|music-teacher|(^|-)aba-|dj-gig"),
    # Customers no vertical of this list names: farms and land, trucking,
    # SaaS metrics, EU product regulation, generic CRM/marketing file checks.
    ("other",
     r"farm|apiary|cattle|cow-calf|(^|-)grain-|(^|-)hay-|grazing|poultry|egg-profit|honey|sheep|oyster|"
     r"maple-syrup|vineyard|grape-grower|fertilizer|microgreens|hydroponic|christmas-tree|pollination|"
     r"timber|sawmill|firewood|hunting-lease|ball-python|beef-|solar-land|tax-lien|tax-deed|"
     r"owner-operator|ifta|(^|-)hos-|form-2290|ucr-fee|truck|(^|-)tow-|car-hauler|pilot-car|lumper|"
     r"fuel-surcharge|(^|-)fleet-|cloud-egress|vector-db|(^|-)gtfs|(^|-)gpx|ics-calendar|vcard|iban-list|"
     r"(hubspot|mailchimp|brevo|klaviyo|activecampaign|pipedrive|salesforce|zoho-crm|google-contacts|"
     r"email-list|google-ads-editor|gbp-bulk)-|payroll-hours|redirect-map|webhook-relay|"
     r"^saas-|(^|-)mrr-|subscription-proration|^eu-(?!vat|einvoic|bank)|equipment-lease|solar-ppa|"
     r"claude-skill|security-questionnaire|employer-payroll|form-5500|payroll-register|retirement-plan-startup"),
    ("local-services",
     r"clean(ing|out)|janitorial|pressure-wash|(^|-)pest-|mosquito|wildlife-exclusion|(^|-)lawn-|"
     r"(^|-)snow-|tree-service|stump-|junk-|(^|-)moving-|biohazard|chimney-sweep|dryer-vent|"
     r"holiday-light|locksmith|(^|-)auto-|tire-shop|vehicle-wrap|window-tinting|(^|-)mobile-detail|"
     r"(^|-)pet-|upholstery|card-grading|appliance-repair|home-staging|septic-pumping|hydroseed|"
     r"irrigation-winterization|(^|-)aeration|sod-install"),
    ("creators",
     r"(^|-)course-|teachers-pay|kickstarter|gumroad|ko-fi|buymeacoffee|teachable|distrokid|ghost-members|"
     r"lemonsqueezy|(^|-)app-(review|subscription|store)|google-play"),
    ("freelancers", r"fiverr|upwork|thumbtack"),
    ("landlords", r"midterm-rental|glamping|rv-rental-host|turo-|wholesale-real-estate|real-estate-professional|self-storage"),
    ("nonprofits",
     r"nonprofit|non-profit|(^|-)grants?(-|$)|(^|-)990|donor|donation|charit|volunteer|fundrais|church|parish|"
     r"(^|-)ministry|tithe|501c|(^|-)pta(-|$)|booster"),
    ("landlords",
     r"landlord|tenant|(^|-)rental-(property|income|unit|dscr|rent)|rent-roll|(^|-)rent-(increase|ledger|receipt|collection)|"
     r"(^|-)str-|short-term-rental|airbnb|vrbo|commercial-lease|eviction|security-deposit|property-manag|"
     r"schedule-e|depreciation-rental|(^|-)property-cap-rate|(^|-)brrrr|duplex|fourplex|section-8(-|$)|"
     r"fix-and-flip|section-24"),
    ("online-sellers",
     r"(^|-)etsy|ebay|amazon|(^|-)fba(-|$)|shopify|poshmark|mercari|depop|whatnot|tiktok-shop|walmart-market|"
     r"(^|-)resell|reseller|(^|-)flipp|marketplace|(^|-)3pl(-|$)|dropship|(^|-)sku(-|$)|ecommerce|e-commerce|"
     r"print-on-demand|(^|-)pod-(fee|profit|margin|price)|wholesale|(^|-)1099-?k|sales-tax-nexus|(^|-)nexus"),
    ("manufacturing-engineering",
     r"(^|-)cnc(-|$)|machin(e-shop|ing|ist)|job-shop|fabricat|(^|-)weld|sheet-metal|tolerance|(^|-)gd-?t(-|$)|(^|-)cmm(-|$)|"
     r"cmmc|nist-?800|dfars|itar|as9100|iso-?9001|(^|-)ppap|(^|-)fmea|(^|-)spc(-|$)|gage-rr|(^|-)oee(-|$)|"
     r"injection-mold|(^|-)die-casting|(^|-)sand-casting|(^|-)lathe|(^|-)mill-|feeds-speeds|(^|-)bolt|torque|(^|-)beam-|beam-calc|"
     r"(^|-)pump-sizing|(^|-)gear|bearing|(^|-)spring-|kanban|assembly-line|"
     r"(^|-)plc(-|$)|(^|-)mrp(-|$)|work-order|(^|-)rfq(-|$)|quote-to|(^|-)laser-cut|waterjet|powder-coat|"
     r"anodiz|plating|(^|-)3d-print|structural|(^|-)fea(-|$)|(^|-)step-file|(^|-)dxf|(^|-)stl(-|$)"),
    ("construction",
     r"contractor|construct|(^|-)aia(-|$)|g70[23]|pay-?app|retainage|(^|-)lien|submittal|(^|-)rfi(-|$)|"
     r"change-order|subcontract|takeoff|(^|-)xer(-|$)|(^|-)p6(-|$)|(^|-)ifc(-|$)|(^|-)bim(-|$)|(^|-)ids(-|$)|"
     r"(^|-)permit|(^|-)osha|framing|drywall|concrete|masonry|roof|shingle|siding|gutter|(^|-)deck(-|$)|"
     r"(^|-)paving|asphalt|excavat|(^|-)grading|(^|-)electrical|(^|-)plumb|(^|-)hvac|furnace|boiler|"
     r"insulation|(^|-)tile-|flooring|(^|-)paint(ing)?-(bid|estimat|job|contract)|remodel|renovat|"
     r"certified-payroll|(^|-)punch-list|daily-log|(^|-)crane|scaffolding|rebar|(^|-)stud-|lumber|"
     r"(^|-)fence|(^|-)window-install|(^|-)solar-install|home-?builder"),
    ("creators",
     r"youtube|podcast|twitch|(^|-)stream(er|ing)?(-|$)|patreon|substack|onlyfans|(^|-)creator|influencer|"
     r"sponsor|(^|-)photograph|(^|-)video-|(^|-)music|(^|-)band(-|$)|(^|-)song|(^|-)audio|(^|-)beat-|"
     r"(^|-)book-(launch|royalt|cover)|self-publish|(^|-)kdp(-|$)|(^|-)authors?(-|$)|newsletter|(^|-)tiktok|"
     r"instagram|(^|-)ugc(-|$)|(^|-)merch(-|$)|(^|-)artist|(^|-)illustrat|(^|-)comic|(^|-)wedding-(photo|video)"),
    ("freelancers",
     r"freelanc|self-employ|(^|-)1099(-|$)|(^|-)1099-(nec|misc|vendor)|schedule-c(-|$)|(^|-)gst(-|$)|(^|-)hst(-|$)|quarterly-(estimated-)?tax|"
     r"estimated-tax|(^|-)se-tax|self-employment|(^|-)day-rate|hourly-rate|(^|-)retainer|(^|-)consult|"
     r"(^|-)contractor-(rate|tax)|(^|-)gig(-|$)|(^|-)uber|(^|-)doordash|(^|-)rideshare|(^|-)sole-prop|"
     r"(^|-)llc-|s-corp|(^|-)ir35|umbrella-company|(^|-)invoice-(generator|template|maker)"),
]

# Ventures in the "research tool" vertical by membership rather than by slug:
# the site's own list of tools implementing a published paper is read from the
# build (RESEARCH_ALGORITHM_SLUGS), and the category does the rest.

# What the site build's category says about the customer, when it says
# anything. Categories filed by job rather than customer (back office, sales,
# compliance evidence, "more") map to None and go on to the description rules.
CATEGORY_VERTICAL: dict[str, str | None] = {
    "trades": "construction",
    "food-service": "local-services",
    "services": "local-services",
    "marketplace": "online-sellers",
    "imports": "online-sellers",
    "logistics": "online-sellers",
    "solo-earner": "freelancers",
    "personal-tax": "consumer",
    "household": "consumer",
    "uk-tax": "freelancers",
    "learning": "consumer",
    "research-algorithms": "research-tool",
    "open-hardware": "hardware-open-designs",
    "music": "creators",
    "ci": "other",
    "self-hosted": None,
    "bookkeeping": None,
    "evidence": None,
    "backoffice": None,
    "sales": None,
    "apps": None,
    "cli": None,
    "more": None,
}

# Description keywords for ventures the slug and category leave open. Whole
# words, case-insensitive; first match wins.
DESC_RULES: list[tuple[str, str]] = [
    ("eu-einvoicing-accounting", r"e-?invoic\w*|peppol|xrechnung|zugferd|factur-x|ksef|\bVAT\b|DATEV|GoBD"),
    ("consumer", r"charitable-deduction|charity-bunching|donor-advised|cobra-vs-|heat-pump-vs-|car-lease"),
    ("local-services", r"(^|-)lesson|(^|-)tutor|music-teacher|(^|-)aba-|dj-gig"),
    # Customers no vertical of this list names: farms and land, trucking,
    # SaaS metrics, EU product regulation, generic CRM/marketing file checks.
    ("other",
     r"farm|apiary|cattle|cow-calf|(^|-)grain-|(^|-)hay-|grazing|poultry|egg-profit|honey|sheep|oyster|"
     r"maple-syrup|vineyard|grape-grower|fertilizer|microgreens|hydroponic|christmas-tree|pollination|"
     r"timber|sawmill|firewood|hunting-lease|ball-python|beef-|solar-land|tax-lien|tax-deed|"
     r"owner-operator|ifta|(^|-)hos-|form-2290|ucr-fee|truck|(^|-)tow-|car-hauler|pilot-car|lumper|"
     r"fuel-surcharge|(^|-)fleet-|cloud-egress|vector-db|(^|-)gtfs|(^|-)gpx|ics-calendar|vcard|iban-list|"
     r"(hubspot|mailchimp|brevo|klaviyo|activecampaign|pipedrive|salesforce|zoho-crm|google-contacts|"
     r"email-list|google-ads-editor|gbp-bulk)-|payroll-hours|redirect-map|webhook-relay|"
     r"^saas-|(^|-)mrr-|subscription-proration|^eu-(?!vat|einvoic|bank)|equipment-lease|solar-ppa|"
     r"claude-skill|security-questionnaire|employer-payroll|form-5500|payroll-register|retirement-plan-startup"),
    ("local-services",
     r"clean(ing|out)|janitorial|pressure-wash|(^|-)pest-|mosquito|wildlife-exclusion|(^|-)lawn-|"
     r"(^|-)snow-|tree-service|stump-|junk-|(^|-)moving-|biohazard|chimney-sweep|dryer-vent|"
     r"holiday-light|locksmith|(^|-)auto-|tire-shop|vehicle-wrap|window-tinting|(^|-)mobile-detail|"
     r"(^|-)pet-|upholstery|card-grading|appliance-repair|home-staging|septic-pumping|hydroseed|"
     r"irrigation-winterization|(^|-)aeration|sod-install"),
    ("creators",
     r"(^|-)course-|teachers-pay|kickstarter|gumroad|ko-fi|buymeacoffee|teachable|distrokid|ghost-members|"
     r"lemonsqueezy|(^|-)app-(review|subscription|store)|google-play"),
    ("freelancers", r"fiverr|upwork|thumbtack"),
    ("landlords", r"midterm-rental|glamping|rv-rental-host|turo-|wholesale-real-estate|real-estate-professional|self-storage"),
    ("nonprofits", r"nonprofits?|non-profits?|charit(y|ies)|grant-?makers?|grant applications?|donors?|501\(c\)"),
    ("landlords", r"landlords?|tenants?|rental propert(y|ies)|short-term rentals?|Airbnb"),
    ("online-sellers", r"Etsy|eBay|Amazon sellers?|Shopify|Poshmark|Mercari|online sellers?|resellers?|e-?commerce"),
    ("construction", r"general contractors?|construction|subcontractors?|job ?sites?|tradespe\w+|remodel\w*"),
    ("manufacturing-engineering", r"machine shops?|job shops?|manufactur\w+|fabricat\w+|engineers?|CNC"),
    ("creators", r"creators?|YouTubers?|podcast\w*|musicians?|photographers?|authors?|streamers?|newsletters?"),
    ("freelancers", r"freelanc\w+|self-employed|sole (proprietors?|traders?)|1099 contractors?"),
    ("local-services", r"salons?|restaurants?|cafes?|clinics?|practices?|studios?|gyms?|shops? owners?|local business\w*|small business\w*|agenc(y|ies)"),
    ("consumer", r"household|homeowners?|families|retirement|personal finance|your own money|renters?"),
    ("research-tool", r"researchers?|statistic\w*|regression|estimator|peer-reviewed|published (paper|method)"),
]

# Hand calls the rules get wrong, each with its reason. A row here is a
# decision a later run can read and overturn with evidence; keep it short.
OVERRIDES: dict[str, dict[str, str]] = {
    "wall-framing-takeoff": {
        "vertical": "construction", "front_door_for": "residential-takeoff",
        "why": "the free build the residential takeoff bet (#6) is grown from",
    },
    "einvoice-preflight": {
        "vertical": "eu-einvoicing-accounting", "front_door_for": "einvoice",
        "why": "the free validator the e-invoice bet (#3) is imported from",
    },
    "gage-rr": {
        "vertical": "research-tool", "front_door_for": "cmmc",
        "why": "measurement-system analysis is an ISO 9001/AS9100 quality record; same shops as the CMMC bet",
    },
    "spc-control-charts": {
        "vertical": "research-tool", "front_door_for": "cmmc",
        "why": "SPC charts are the process-control evidence an ISO 9001/AS9100 audit asks for",
    },
    "job-shop-scheduler": {
        "vertical": "research-tool", "front_door_for": "jobshop-quote",
        "why": "a job shop's scheduling problem; its users are the quoting bet's buyers",
    },
    "assembly-line-balancer": {
        "vertical": "research-tool", "front_door_for": "jobshop-quote",
        "why": "line balancing for small manufacturers, the quoting bet's buyers",
    },
    "trade-show-roi-calculator": {
        "vertical": "other", "front_door_for": None,
        "why": "any B2B exhibitor; its description names manufacturers only as one example",
    },
    "sales-agent": {
        "vertical": "other", "front_door_for": None,
        "why": "outbound tooling the deployer runs on their own keys; serves no one bet's buyers",
    },
    "chant-forge": {
        "vertical": "nonprofits", "front_door_for": None,
        "why": "devotional music for parishes; kept as commons (transition.py), not a grants lead",
    },
}


def description(venture: Path) -> str:
    """VENTURE.yaml's description, folded to one line (same reader as transition.py)."""
    vy = venture / "VENTURE.yaml"
    if not vy.exists():
        return ""
    text = vy.read_text(errors="ignore")
    m = re.search(r"^description:\s*(>-?\s*\n((?:\s+.*\n)+)|(.*))", text, re.M)
    if not m:
        return ""
    body = m.group(2) or m.group(3) or ""
    return " ".join(body.split()).strip("\"'")


_SLUG = [(v, re.compile(p)) for v, p in SLUG_RULES if p != "^$"]
_DESC = [(v, re.compile(p, re.I)) for v, p in DESC_RULES]


def vertical_for(slug: str, category: str | None, desc: str,
                 research_slugs: frozenset[str] = frozenset()) -> tuple[str, str]:
    """(vertical, rule) for one venture. `rule` names the step that decided."""
    if slug in OVERRIDES:
        return OVERRIDES[slug]["vertical"], "override"
    if slug in research_slugs or category == "research-algorithms":
        return "research-tool", "research-list"
    for vertical, pat in _SLUG:
        if pat.search(slug):
            return vertical, "slug"
    by_cat = CATEGORY_VERTICAL.get(category or "")
    if by_cat:
        return by_cat, f"category:{category}"
    for vertical, pat in _DESC:
        if pat.search(desc):
            return vertical, "description"
    return "other", "fallback"


def bet_for(slug: str, vertical: str) -> str | None:
    """The bet whose buyers this venture reaches: a narrowing bet (one with a
    `match`) first, then the bet that takes the rest of the vertical."""
    if slug in OVERRIDES and "front_door_for" in OVERRIDES[slug]:
        return OVERRIDES[slug]["front_door_for"]
    candidates = [(k, b) for k, b in BETS.items() if b["vertical"] == vertical]
    for key, bet in candidates:
        if bet["match"] and re.search(bet["match"], slug):
            return key
    for key, bet in candidates:
        if bet["match"] is None:
            return key
    return None


def classify(slug: str, category: str | None, desc: str,
             research_slugs: frozenset[str] = frozenset()) -> dict:
    vertical, rule = vertical_for(slug, category, desc, research_slugs)
    bet = bet_for(slug, vertical)
    row = {
        "venture": slug,
        "vertical": vertical,
        "rule": rule,
        "site_category": category,
        "front_door_for": bet,
        "status": "front-door" if bet else "frozen",
    }
    if slug in OVERRIDES:
        row["why"] = OVERRIDES[slug]["why"]
    return row


SITE_EXPORT = r"""
import fs from 'node:fs';
const b = await import(process.argv[1] + '/platform/pages/build.mjs');
const out = { categories: {}, research: b.RESEARCH_ALGORITHM_SLUGS ?? [] };
for (const s of JSON.parse(process.argv[2])) out.categories[s] = b.categoryFor(s).id;
fs.writeSync(1, JSON.stringify(out));
"""


def site_categories(slugs: list[str]) -> tuple[dict[str, str], frozenset[str]]:
    """Ask the site build which category each slug is filed under. Without
    node, every category is None and the slug and description rules decide."""
    try:
        res = subprocess.run(
            ["node", "--input-type=module", "-e", SITE_EXPORT, str(ROOT), json.dumps(slugs)],
            capture_output=True, text=True, timeout=120, cwd=ROOT,
        )
        data = json.loads(res.stdout)
        return data["categories"], frozenset(data["research"])
    except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
        print(f"warning: site categories unavailable ({exc}); slug and description rules only",
              file=sys.stderr)
        return {}, frozenset()


def ventures() -> list[str]:
    return sorted(p.parent.name for p in VENTURES.glob("*/VENTURE.yaml"))


def build() -> dict:
    slugs = ventures()
    cats, research = site_categories(slugs)
    rows = [classify(s, cats.get(s), description(VENTURES / s), research) for s in slugs]
    by_vertical = Counter(r["vertical"] for r in rows)
    by_bet = Counter(r["front_door_for"] for r in rows if r["front_door_for"])
    return {
        "generated_by": "portfolio/monetization/verticals.py",
        "bets": {k: {"rank": b["rank"], "name": b["name"], "vertical": b["vertical"]}
                 for k, b in BETS.items()},
        "counts": {
            "ventures": len(rows),
            "by_vertical": {v: by_vertical.get(v, 0) for v in VERTICALS},
            "front_doors_by_bet": {k: by_bet.get(k, 0) for k in BETS},
            "by_status": dict(sorted(Counter(r["status"] for r in rows).items())),
        },
        "ventures": rows,
    }


def render(data: dict) -> str:
    c = data["counts"]
    lines = [f"{c['ventures']} ventures", "", f"{'vertical':<28}{'ventures':>9}{'front doors':>13}"]
    doors = Counter(r["vertical"] for r in data["ventures"] if r["status"] == "front-door")
    for v, n in c["by_vertical"].items():
        lines.append(f"{v:<28}{n:>9}{doors.get(v, 0):>13}")
    lines += ["", f"{'#':<3}{'bet':<56}{'front doors':>12}"]
    for k, b in sorted(data["bets"].items(), key=lambda kv: kv[1]["rank"]):
        lines.append(f"{b['rank']:<3}{b['name'] + ' (' + k + ')':<56}{c['front_doors_by_bet'][k]:>12}")
    lines += ["", "status: " + ", ".join(f"{k} {v}" for k, v in c["by_status"].items())]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--write", action="store_true", help="refresh verticals.json")
    ap.add_argument("--check", action="store_true", help="exit 1 if verticals.json is stale")
    ap.add_argument("--show", metavar="VERTICAL", help="list the ventures in one vertical")
    args = ap.parse_args(argv)
    data = build()
    text = json.dumps(data, indent=2) + "\n"
    if args.check:
        if not OUT.exists() or OUT.read_text() != text:
            print("verticals.json is stale: run verticals.py --write", file=sys.stderr)
            return 1
        print("verticals.json is current")
        return 0
    if args.show:
        for r in data["ventures"]:
            if r["vertical"] == args.show:
                print(f"{r['venture']:<55}{r['rule']:<26}{r['front_door_for'] or '-'}")
        return 0
    if args.write:
        OUT.write_text(text)
    print(render(data))
    return 0


if __name__ == "__main__":
    sys.exit(main())
