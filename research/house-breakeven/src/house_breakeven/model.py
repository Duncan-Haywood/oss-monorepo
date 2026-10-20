"""Break-even first cost of the ADU's envelope upgrades.

Reuses house-open-design's envelope and degree-day energy (themselves house-energy's model) and answers the inverse of
house-energy's question: not "which package has the lowest net present cost" but "how much extra may each upgrade
cost before it stops paying back". Energy is linear in UA, so the one-at-a-time savings add up exactly to the whole
package's saving; the tests check that. All prices (gas, electricity), the climates and the discount rate are
house-energy's assumptions, swept here, never sourced.
"""
from house_energy.model import Prices  # noqa: F401
from house_open_design.analysis import PACKAGES, annual_energy, envelope
from house_open_design.plan_set import ADU
from house_plan.plan import make_plan

PLAN = make_plan(ADU)
COMPONENTS = ("wall_r", "attic_r", "window_u", "ach50", "floor_batt_r")
LABEL = {"wall_r": "wall (advanced 2x6 + R-5 foam)", "attic_r": "attic R-30 to R-49", "window_u": "windows U-0.35 to U-0.27",
         "ach50": "air sealing 5 to 3 ACH50", "floor_batt_r": "floor batt R-19 to R-30"}


def annuity(rate, years=30):
    return float(years) if rate == 0 else sum(1 / (1 + rate) ** t for t in range(1, years + 1))


def annual_cost(pkg, climate, system, energy_mult=1.0):
    base = Prices()
    prices = Prices(gas_per_therm=base.gas_per_therm * energy_mult, elec_per_kwh=base.elec_per_kwh * energy_mult)
    return annual_energy(envelope(PLAN, pkg), climate, system, prices)["annual_cost"]


def package_with(*changed):
    return {**PACKAGES["baseline"], **{k: PACKAGES["tight"][k] for k in changed}}


def annual_saving(changed, climate, system, energy_mult=1.0):
    """Dollars a year saved by taking the named components from baseline to tight."""
    return (annual_cost(PACKAGES["baseline"], climate, system, energy_mult)
            - annual_cost(package_with(*changed), climate, system, energy_mult))


def breakeven_cost(changed, climate, system, rate=0.03, energy_mult=1.0):
    """Largest extra first cost (USD) at which the upgrade's present-value energy saving still covers it."""
    return annual_saving(changed, climate, system, energy_mult) * annuity(rate)


# Assumed installed incremental costs, from house-energy's unsourced unit prices, scaled to this plan's areas.
# The wall switch is left out: its cost is lumber and labour from house-framing, which house-energy nets against savings.
def assumed_extra_cost(component):
    env = envelope(PLAN, PACKAGES["baseline"])
    area = PLAN.params.width * PLAN.params.depth
    from house_energy.model import AIR_SEAL, ATTIC_PER_FT2_PER_R, FOAM_PER_FT2_R5, WINDOW_PER_FT2
    b, t = PACKAGES["baseline"], PACKAGES["tight"]
    if component == "attic_r":
        return area * ATTIC_PER_FT2_PER_R * (t["attic_r"] - b["attic_r"])
    if component == "window_u":
        return env["window_ft2"] * (WINDOW_PER_FT2[t["window_u"]] - WINDOW_PER_FT2[b["window_u"]])
    if component == "ach50":
        return AIR_SEAL[t["ach50"]] - AIR_SEAL[b["ach50"]]
    return None
