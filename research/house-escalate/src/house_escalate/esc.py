"""Heat pump against gas furnace + AC when fuel prices grow in real terms.

house-energy charges a constant annual energy bill. Here the gas part and the electricity part of each package's
bill are separated (the bill is linear in the two prices) and each is discounted with its own real growth rate g:
PV = bill x sum_t ((1+g)/(1+r))^t. Everything else is house-hvacnpc/house-energy, unchanged.
"""
import house_energy.model as M
from house_energy.model import Prices


def annuity(rate, g=0.0, years=M.YEARS):
    return sum(((1 + g) / (1 + rate)) ** t for t in range(1, years + 1))


def table(climate, prices):
    """{system: [(first_cost, gas_bill, elec_bill) for every package]}: the bill split by fuel."""
    gas_only = Prices(prices.gas_per_therm, 0.0, prices.cost_mult, prices.energy_mult)
    elec_only = Prices(0.0, prices.elec_per_kwh, prices.cost_mult, prices.energy_mult)
    out = {}
    for s in M.SYSTEMS:
        out[s] = []
        for p in M.options():
            out[s].append((M.first_cost(p, prices),
                           M.energy(p, climate, s, gas_only)["annual_cost"],
                           M.energy(p, climate, s, elec_only)["annual_cost"]))
    return out


def best_npc(rows, rate, g_gas, g_elec, years=M.YEARS):
    ag, ae = annuity(rate, g_gas, years), annuity(rate, g_elec, years)
    return min(fc + gb * ag + eb * ae for fc, gb, eb in rows)


def premium(tab, rate=M.DISCOUNT, g_gas=0.0, g_elec=0.0, years=M.YEARS):
    """NPC(gas furnace + AC) - NPC(heat pump), each with its own cost-optimal envelope. Positive: the heat pump may
    cost that much more to install and still tie."""
    return (best_npc(tab["gas furnace + AC"], rate, g_gas, g_elec, years)
            - best_npc(tab["heat pump"], rate, g_gas, g_elec, years))


def breakeven_gas_growth(tab, target, rate=M.DISCOUNT, g_elec=0.0, lo=-0.05, hi=0.15, years=M.YEARS):
    """Real yearly gas price growth at which premium == target USD (heat pump installed-cost premium over gas).
    premium rises with g_gas (gas gets dearer); returns None if target is outside [lo, hi]."""
    f = lambda g: premium(tab, rate, g, g_elec, years) - target
    if f(lo) > 0 or f(hi) < 0:
        return None
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if f(mid) < 0 else (lo, mid)
    return (lo + hi) / 2
