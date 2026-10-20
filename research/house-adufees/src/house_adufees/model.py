"""Denver Water's 2026 system development charge (SDC, the "tap fee") for treated single-family service.

Schedule: data/sdc.csv, copied from Denver Water's page (data/sources.csv, dwsdc2026, read 2026-10-20). A house pays
a base charge plus a per-sq-ft rate on the *lot* area (the page's "First 22,000 sq ft" is the area charged; the
page does not say lot or floor area, so `charged_area` is a parameter and the README says which reading it uses).
A detached accessory dwelling unit (ADU) pays one flat charge instead.
"""
import csv
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / "data"
STEPS = ("2026-01-01", "2026-07-01")
LOCATIONS = ("inside Denver", "outside Denver")
SEWER_AND_OTHER_2000 = None  # computed in residual()


def schedule():
    with open(DATA / "sdc.csv", newline="") as f:
        return {(r["step"], r["location"]): {k: float(v) for k, v in r.items() if k not in ("step", "location")}
                for r in csv.DictReader(f)}


def house_sdc(area_sqft, step="2026-07-01", location="inside Denver"):
    s = schedule()[(step, location)]
    first = min(area_sqft, 22000)
    return s["base_usd"] + s["first_22000_per_sqft"] * first + s["over_22000_per_sqft"] * max(area_sqft - 22000, 0)


def adu_sdc(step="2026-07-01", location="inside Denver"):
    return schedule()[(step, location)]["adu_usd"]


def adu_discount(area_sqft, step="2026-07-01", location="inside Denver"):
    """Share of the house charge on `area_sqft` that the flat ADU charge saves."""
    h = house_sdc(area_sqft, step, location)
    return 1 - adu_sdc(step, location) / h


def per_sqft(fee, floor_sqft):
    return fee / floor_sqft


def step_increase(kind="adu", area_sqft=2000, location="inside Denver"):
    a, b = STEPS
    if kind == "adu":
        return adu_sdc(b, location) / adu_sdc(a, location) - 1
    return house_sdc(area_sqft, b, location) / house_sdc(area_sqft, a, location) - 1


def residual(total_2000=16930.0, area_sqft=2000, step="2026-01-01"):
    """What is left of house-market's $16,930 'water and sewer SDC' (2,000 sq ft home) after Denver Water's own charge.

    house-market's figure is dated 2026 (CSI), not to a step, so the January step is the stated reading. The remainder
    is sewer and anything else CSI folded in; this project cannot split it, because no sewer schedule was read."""
    return total_2000 - house_sdc(area_sqft, step)


def sewer():
    """DOTI's 2026 sewer permit fees (data/sewer.csv; doti2026fees, doti2026res in data/sources.csv)."""
    with open(DATA / "sewer.csv", newline="") as f:
        return {r["item"]: float(r["usd"]) for r in csv.DictReader(f)}


def sewer_permit_fees(separate_tap, charge_unit_fee=None):
    """Denver sewer-side cost of a new unit: application + inspection, plus the per-unit connection fee.

    DOTI says a sanitary connection fee "may be required" for an ADU that does not share the main house's water
    service, and that sharing "may avoid" it; it publishes no ADU-specific amount. So `separate_tap=False` charges no
    connection fee, and `separate_tap=True` charges the residential per-unit fee ($6,480) as an *upper-bound reading*
    (the schedule's residential line covers SFR, duplex and 3+ unit buildings with their own taps; an ADU is not
    named). `charge_unit_fee` overrides either."""
    s = sewer()
    unit = separate_tap if charge_unit_fee is None else charge_unit_fee
    return s["application"] + s["inspection"] + (s["total_per_unit"] if unit else 0.0)


def adu_water_sewer_total(separate_tap, step="2026-07-01", location="inside Denver"):
    """Denver Water SDC plus DOTI sewer permit fees for the ADU (not plan review, impact or linkage fees)."""
    return adu_sdc(step, location) + sewer_permit_fees(separate_tap)


def house_water_sewer_total(area_sqft=2000, step="2026-07-01", location="inside Denver"):
    return house_sdc(area_sqft, step, location) + sewer_permit_fees(True)


def unexplained_after_sewer(total_2000=16930.0, step="2026-01-01"):
    """house-market's $16,930 less Denver Water's SDC and DOTI's connection fee (no application/inspection)."""
    return residual(total_2000, 2000, step) - sewer()["total_per_unit"]
