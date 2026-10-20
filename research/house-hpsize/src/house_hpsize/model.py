"""Heat-pump downsizing credit for the ADU's envelope upgrades.

house-breakeven counts only energy savings and lists the equipment downsizing credit as a missing term. A tighter
envelope lowers the peak heating load, and equipment comes in discrete sizes, so the credit is a step function of
the load, not a smooth saving. Heat loss is house-open-design's UA (itself house-energy's model). The winter design
temperatures, the capacity-retention curve, the size catalogue and the equipment prices are ASSUMED, not sourced.
"""
from house_breakeven.model import COMPONENTS, PACKAGES, PLAN, annuity, assumed_extra_cost, breakeven_cost, package_with
from house_open_design.analysis import envelope

# Winter design dry-bulb (F), roughly the 99% values remembered from ASHRAE climatic data: NOT checked against source.
DESIGN_TEMP_F = {"Houston (2A)": 33.0, "Baltimore (4A)": 17.0, "Chicago (5A)": 0.0, "Minneapolis (6A)": -11.0}
INDOOR_F = 70.0
# Share of rated (47 F) heating capacity a cold-climate heat pump keeps at the design temperature: linear, assumed.
RETENTION_PER_F = 0.008
MIN_RETENTION = 0.5
# Nominal rated capacities available (kBtu/h at 47 F), assumed ductless/ducted sizes.
SIZES_KBTUH = (6, 9, 12, 18, 24, 30, 36)
OVERSIZE = 1.15  # sizing margin over the design load (assumed)
# Installed equipment price: fixed part plus per kBtu/h (assumed, unsourced).
EQUIP_FIXED, EQUIP_PER_KBTUH = 1500.0, 150.0


def design_load_btuh(pkg, climate):
    """Peak heat loss (Btu/h) at the design temperature: UA times the temperature difference. No internal-gain credit."""
    return envelope(PLAN, pkg)["ua_total"] * (INDOOR_F - DESIGN_TEMP_F[climate])


def retention(climate):
    return max(MIN_RETENTION, 1.0 - RETENTION_PER_F * (47.0 - DESIGN_TEMP_F[climate]))


def required_rated_kbtuh(pkg, climate):
    return design_load_btuh(pkg, climate) * OVERSIZE / retention(climate) / 1000.0


def selected_size(pkg, climate):
    need = required_rated_kbtuh(pkg, climate)
    for s in SIZES_KBTUH:
        if s >= need:
            return s
    return None  # beyond the catalogue: needs more than one unit


def equipment_cost(size):
    return EQUIP_FIXED + EQUIP_PER_KBTUH * size


def downsizing_credit(changed, climate):
    """Equipment cost saved by moving the named components to the tight package, 0 if the catalogue step does not change."""
    a, b = selected_size(PACKAGES["baseline"], climate), selected_size(package_with(*changed), climate)
    return equipment_cost(a) - equipment_cost(b)


def total_breakeven(changed, climate, rate=0.03, energy_mult=1.0):
    """Energy break-even (heat pump) plus the downsizing credit."""
    return breakeven_cost(changed, climate, "heat pump", rate, energy_mult) + downsizing_credit(changed, climate)


COSTED = ("attic_r", "window_u", "ach50")


def costed_extra(changed=COSTED):
    return sum(assumed_extra_cost(k) for k in changed)
