"""A driver-based model of where a new home's price goes, anchored on NAHB's 2024 shares.

Anchor (NAHB, "Cost of Constructing a Home in 2024", Eye on Housing, 2025-01-23, read 2026-10-17): shares of the
average sales price, and shares of construction cost. The model reports price as an index (reference house = 100),
not dollars, because no dollar figure was read from the primary report.

Each construction stage is split into a fixed part and parts that scale with a geometric driver. Those splits
(`STAGE_DRIVERS`) are ASSUMPTIONS of this project, not survey data. Everything else follows from the anchor.
"""
from dataclasses import dataclass, replace

# Shares of the 2024 average sales price.
PRICE_SHARES = {"construction": 0.644, "lot": 0.137, "profit": 0.110, "overhead": 0.057,
                "commission": 0.028, "financing": 0.015, "marketing": 0.008}
# Shares of construction cost (sum to 1.0).
STAGE_SHARES = {"interior_finishes": 0.241, "rough_ins": 0.192, "framing": 0.166, "exterior_finishes": 0.134,
                "foundations": 0.105, "site_work": 0.076, "final_steps": 0.065, "other": 0.021}
# The published price shares sum to 99.9% (rounding); the model closes the 0.1% into the lot so they sum to 1.
PRICE_SHARES = dict(PRICE_SHARES, lot=PRICE_SHARES["lot"] + (1 - sum(PRICE_SHARES.values())))

# Assumed split of each stage over drivers: fixed, floor area, footprint, perimeter (storey-weighted wall area).
STAGE_DRIVERS = {
    "interior_finishes": {"fixed": 0.15, "area": 0.85},
    "rough_ins": {"fixed": 0.30, "area": 0.70},
    "framing": {"area": 0.35, "wall": 0.40, "footprint": 0.25},
    "exterior_finishes": {"wall": 0.70, "footprint": 0.30},
    "foundations": {"perimeter": 0.50, "footprint": 0.50},
    "site_work": {"fixed": 0.60, "footprint": 0.40},
    "final_steps": {"fixed": 0.50, "area": 0.50},
    "other": {"area": 1.0},
}


@dataclass(frozen=True)
class House:
    area: float = 2000.0       # finished floor area, sq ft
    storeys: float = 2.0
    aspect: float = 1.5        # footprint length / width
    finish: float = 1.0        # multiplier on interior finishes (1 = reference)
    foundation: float = 1.0    # multiplier on foundations (slab < 1 < basement)
    lot: float = 1.0           # multiplier on the finished-lot price
    fees: float = 1.0          # multiplier on overhead and general expenses
    months: float = 1.0        # build duration relative to reference; scales financing
    framing_materials: float = 1.0  # multiplier on the lumber-and-sheathing part of framing
    framing_labour: float = 1.0  # multiplier on the labour part of framing


REFERENCE = House()
# Assumed share of framing cost that is materials (the rest labour), used by `framing_materials`.
FRAMING_MATERIAL_SHARE = 0.45


def geometry(h):
    footprint = h.area / h.storeys
    width = (footprint / h.aspect) ** 0.5
    perimeter = 2 * width * (1 + h.aspect)
    return {"fixed": 1.0, "area": h.area, "footprint": footprint, "perimeter": perimeter,
            "wall": perimeter * h.storeys}


def stage_costs(h, ref=REFERENCE):
    """Construction cost by stage, in units where the reference house's construction cost is 1."""
    g, g0 = geometry(h), geometry(ref)
    out = {}
    for stage, split in STAGE_DRIVERS.items():
        v = sum(w * g[d] / g0[d] for d, w in split.items())
        v *= STAGE_SHARES[stage]
        if stage == "interior_finishes":
            v *= h.finish
        elif stage == "foundations":
            v *= h.foundation
        elif stage == "framing":
            v *= FRAMING_MATERIAL_SHARE * h.framing_materials + (1 - FRAMING_MATERIAL_SHARE) * h.framing_labour
        out[stage] = v
    return out


def price(h, ref=REFERENCE):
    """Price index (reference house = 100) and its parts, each as an index point."""
    s = PRICE_SHARES
    C0 = s["construction"]
    stages = stage_costs(h, ref)
    construction = C0 * sum(stages.values())
    lot = s["lot"] * h.lot
    overhead = s["overhead"] * h.fees * construction / C0
    financing = s["financing"] * h.months * (construction + lot) / (C0 + s["lot"])
    # commission, marketing and profit are shares of the price, so price solves a linear equation.
    pct = s["commission"] + s["marketing"] + s["profit"]
    p = (construction + lot + overhead + financing) / (1 - pct)
    return {"price": 100 * p, "construction": 100 * construction, "lot": 100 * lot, "overhead": 100 * overhead,
            "financing": 100 * financing, "commission": 100 * s["commission"] * p,
            "marketing": 100 * s["marketing"] * p, "profit": 100 * s["profit"] * p,
            "stages": {k: 100 * C0 * v for k, v in stages.items()}}


def per_sqft_index(h, ref=REFERENCE):
    """Price per sq ft relative to the reference house's (reference = 100)."""
    return price(h, ref)["price"] / (h.area / ref.area)


def vary(h=REFERENCE, **kw):
    return replace(h, **kw)
