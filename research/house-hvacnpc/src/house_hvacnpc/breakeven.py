"""Break-even equipment premium: the extra installed cost of a heat pump over a gas furnace + AC at which both tie on NPC."""
import house_energy.model as M
from house_energy import evaluate, optimise


def annuity(rate, years=M.YEARS):
    return sum(1 / (1 + rate) ** t for t in range(1, years + 1))


def npc(pkg, climate, system, prices, rate=M.DISCOUNT, years=M.YEARS):
    e = M.evaluate(pkg, climate, system, prices)
    return e["first_cost"] + e["annual_cost"] * annuity(rate, years)


def premium(climate, prices, rate=M.DISCOUNT, years=M.YEARS):
    """(premium, gas annual cost, heat-pump annual cost). Each system gets its own cost-optimal envelope at this rate.
    A positive premium: the heat pump may cost that much more than furnace + AC and still tie. Negative: the heat
    pump must cost that much LESS to tie."""
    best = {}
    for s in M.SYSTEMS:
        p = min(M.options(), key=lambda q: npc(q, climate, s, prices, rate, years))
        best[s] = (p, npc(p, climate, s, prices, rate, years), M.evaluate(p, climate, s, prices)["annual_cost"])
    g, h = best["gas furnace + AC"], best["heat pump"]
    return g[1] - h[1], g[2], h[2]
