"""Sourced numbers on what a new US and Colorado home costs, and the arithmetic that joins them.

Every input is a row of data/facts.csv with a source in data/sources.csv; nothing here is assumed
except where a function says so in its docstring.
"""
import csv
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / "data"

PRICE_PARTS = ["lot", "construction", "financing", "overhead", "marketing", "commission", "profit"]
STAGES = ["site_work", "foundations", "framing", "exterior", "systems", "interior", "final", "other"]
STRUCTURE = ["foundations", "framing", "exterior"]  # the stages a structural system replaces
FEES = ["fee_permit", "fee_impact", "fee_water_sewer"]  # inside NAHB's site-work stage
SOFT = ["financing", "overhead", "marketing", "commission", "profit"]
DENVER_FIXED_FEES = ["denver_water_sewer_sdc", "denver_permit_review"]  # per home
DENVER_AREA_FEES = ["denver_linkage_fee", "denver_materials_sales_tax"]  # scale with floor area

# Cost of each structural system relative to a site-built wood frame, as published (low, high).
# None means the source gives no comparable cost figure.
TECHNIQUES = [
    # name, rel_low, rel_high, what the ratio covers, source, US share of 2024-25 completions
    ("HUD-code manufactured", 0.52, 0.52, "price per sq ft vs site-built, land excluded (2023); site work not comparable", "mhs2023", "~9% of starts+shipments (2023)"),
    ("Advanced framing (OVE)", None, None, "$500-1,000 materials + 3-5% framing labour saved", "ovepath", "partial use, no share"),
    ("Panelized walls / trusses", None, None, "2-6 fewer framing days; no total-cost figure", "nahbmod2024", "1.5% (15,000 units, 2024)"),
    ("Volumetric modular", 0.80, 0.84, "up to -20% (McKinsey, conditional); -16% (Utah study, mixed sectors)", "mckinsey2019", "1.3% (13,000 units, 2024)"),
    ("ICF", 1.005, 1.07, "+0.5-4% (NAHB brief); +6-7% (HUD 1999 side by side)", "nahbicf", "5% concrete-framed incl. block (2025)"),
    ("SIPs", 1.10, 1.10, "~+10% on framing; -55% framing labour (industry study)", "sipabasf", "<2% of walls"),
    ("Light-gauge steel", 1.14, 1.15, "+14.2% installed (HUD demo homes, late 1990s)", "hudsteel", "<0.5% (~5,000, 2025)"),
    ("CLT / mass timber", 1.21, 1.21, "+21% total construction (thesis, 2016)", "minesclt", "no data"),
    ("3D-printed concrete", None, None, "Wolf Ranch TX homes from ~$430k for ~1,850 sq ft; vendor claims only", "khlicon", "hundreds of homes"),
]


def load_facts(path=DATA / "facts.csv"):
    with open(path, newline="") as f:
        return {r["key"]: float(r["value"]) for r in csv.DictReader(f)}


def load_sources(path=DATA / "sources.csv"):
    with open(path, newline="") as f:
        return {r["source"]: r for r in csv.DictReader(f)}


def price_breakdown(f):
    """NAHB 2024 price components: (name, USD, share of price, USD per finished sq ft)."""
    total = sum(f["nahb_" + p] for p in PRICE_PARTS)
    return [(p, f["nahb_" + p], f["nahb_" + p] / total, f["nahb_" + p] / f["nahb_area"]) for p in PRICE_PARTS]


def stage_breakdown(f):
    """NAHB 2024 construction stages: (name, USD, share of construction, share of price, USD per sq ft)."""
    return [(s, f["stage_" + s], f["stage_" + s] / f["nahb_construction"], f["stage_" + s] / f["nahb_price"],
             f["stage_" + s] / f["nahb_area"]) for s in STAGES]


def reconcile(f):
    """Put NAHB's survey house and the Census average on the same basis: price excluding the lot, per sq ft."""
    ex_lot = f["nahb_price"] - f["nahb_lot"]
    return {
        "nahb_ppsf_ex_lot": ex_lot / f["nahb_area"],
        "nahb_construction_ppsf": f["nahb_construction"] / f["nahb_area"],
        "census_avg_ppsf_ex_lot": f["census_avg_ppsf_ex_lot"],
        "census_median_ppsf_ex_lot": f["census_median_ppsf_ex_lot"],
        "nahb_over_census_avg": ex_lot / f["nahb_area"] / f["census_avg_ppsf_ex_lot"] - 1,
        "construction_share_ex_lot": f["nahb_construction"] / ex_lot,
    }


def split_house(f, ppsf_ex_lot, area):
    """Split a house priced at ppsf_ex_lot (Census basis, lot excluded) over NAHB's 2024 shares.

    Assumes the house's cost structure matches NAHB's survey average, which skews larger and dearer.
    """
    ex_lot = f["nahb_price"] - f["nahb_lot"]
    price = ppsf_ex_lot * area
    out = {p: price * f["nahb_" + p] / ex_lot for p in PRICE_PARTS if p != "lot"}
    for s in STAGES:
        out["stage_" + s] = out["construction"] * f["stage_" + s] / f["nahb_construction"]
    out["price_ex_lot"] = price
    return out


def denver_house(f, area=2000, include_review_delay=True):
    """A Denver new home, lot excluded: NAHB's non-fee construction cost per sq ft scaled by Denver's
    RSMeans composite index, plus the fees the Common Sense Institute (CSI) itemises for a 2,000 sq ft Denver home, with NAHB's
    soft-cost shares on top.

    Assumptions: Denver's construction cost per sq ft relative to the nation follows the RSMeans
    composite; NAHB's national fees are replaced (not added to) by Denver's; the materials sales tax
    CSI lists is treated as a fee, so part of it may already sit in the national materials cost.
    """
    national_fees = sum(f[k] for k in FEES)
    hard_ppsf = (f["nahb_construction"] - national_fees) / f["nahb_area"]
    hard = hard_ppsf * f["denver_cci"] * area
    # CSI's fees are for a 2,000 sq ft home: tap and permit fees are held per home, the linkage fee
    # ($ per sq ft) and the materials sales tax scale with area (an assumption for the tax).
    fees = sum(f[k] for k in DENVER_FIXED_FEES) + sum(f[k] for k in DENVER_AREA_FEES) * area / 2000
    delay = f["denver_review_carry"] if include_review_delay else 0.0
    construction = hard + fees + delay
    ex_lot = f["nahb_price"] - f["nahb_lot"]
    soft_share = sum(f["nahb_" + p] for p in SOFT) / ex_lot
    price = construction / (1 - soft_share)
    return {"hard": hard, "fees": fees, "delay": delay, "construction": construction,
            "soft": price - construction, "price_ex_lot": price, "ppsf_ex_lot": price / area,
            "fee_share": (fees + delay) / price,
            "national_fee_share": national_fees / ex_lot}


def reach(f, saving, stages=STRUCTURE):
    """Share of the NAHB price moved by a fractional saving on the given construction stages."""
    return saving * sum(f["stage_" + s] for s in stages) / f["nahb_price"]


def small_home(f, area=1200):
    """Building cost of a small home (lot excluded) at each published benchmark price per sq ft.

    Census and NAHB averages are for ~2,100-2,650 sq ft houses; a small house costs more per sq ft
    (kitchens, baths and fees do not shrink), so the site-built figures are lower bounds.
    """
    d = denver_house(f, area)
    return [
        ("HUD-code manufactured, national avg 2024", f["mh_ppsf"], f["mh_ppsf"] * area),
        ("Site-built, US median 2025 (Census)", f["census_median_ppsf_ex_lot"], f["census_median_ppsf_ex_lot"] * area),
        ("Site-built, West median 2025 (Census)", f["census_west_median_ppsf_ex_lot"], f["census_west_median_ppsf_ex_lot"] * area),
        ("Site-built, Denver (this model)", d["ppsf_ex_lot"], d["price_ex_lot"]),
    ]
