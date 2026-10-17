"""Cost of a comfort lever: fabric change -> comfort shift (garment-thermal) -> added cost (garment-teardown).

A lever changes the shell fabric. Its comfort benefit is the comfort-equivalent shift in
degrees C (exact, from garment-thermal's PMV model), signed so that positive = more benefit
in the scenario's direction (cooling for warm scenarios, warming for the cool one).
Its cost is an ASSUMED price premium per m2 of shell cloth, times the cloth the marker uses,
carried up the teardown multiplier chain. No premium below is a quoted price.
"""
from dataclasses import dataclass, replace
from itertools import product

from garment_teardown.model import Garment, Scenario, cost_breakdown
from garment_thermal.model import Fabric, Env, comfort_equivalent_shift

BASE = Fabric(clo=0.5, eps_out=0.95, tau_ir=0.0, alpha_sol=0.5, im=0.4)

# name -> (fabric field, new value). "thin" and "thick" change insulation.
LEVERS = {
    "ir_transparent": ("tau_ir", 0.8),
    "low_emissivity": ("eps_out", 0.2),
    "white": ("alpha_sol", 0.15),
    "thin": ("clo", 0.3),
    "thick": ("clo", 0.9),
}

# scenario -> (Env, met, direction); direction +1 = benefit is feeling cooler, -1 = feeling warmer.
SCEN = {
    "warm room 28 C": (Env(28, 28, 0.1, 50, 0.0), 1.2, +1),
    "sunny outdoors 32 C": (Env(32, 32, 1.0, 40, 200.0), 1.6, +1),
    "cool room 16 C": (Env(16, 16, 0.1, 50, 0.0), 1.2, -1),
}


def apply(fab: Fabric, names):
    for n in names:
        f, v = LEVERS[n]
        fab = replace(fab, **{f: v})
    return fab


def benefit(names, scen, base=BASE):
    """Comfort benefit in C of applying the levers `names` together (non-additive: solved jointly)."""
    env, met, direction = SCEN[scen]
    return -direction * comfort_equivalent_shift(met, base, apply(base, names), env)


@dataclass(frozen=True)
class CostModel:
    garment: Garment
    scenario: Scenario
    premium: dict  # lever -> USD per m2 of shell cloth (treated), assumed
    thickness_exponent: float = 1.0  # cloth price scales as (clo/0.5)**exponent

    def added_fob(self, names):
        """Added factory cost (USD) for the shell cloth the marker uses."""
        a = self.garment.fabric_used_m2()
        base = cost_breakdown(self.garment, self.scenario)["fob"]
        extra = 0.0
        price = self.garment.shell_price_per_m2
        clo = BASE.clo
        for n in names:
            if n in ("thin", "thick"):
                clo = LEVERS[n][1]
            else:
                extra += self.premium.get(n, 0.0) * a
        new_price = price * (clo / BASE.clo) ** self.thickness_exponent
        extra += (new_price - price) * a
        # overhead and profit apply to direct cost, as in the teardown chain
        return extra * (1 + self.garment.overhead_rate), base

    def added_retail(self, names):
        extra_fob, _ = self.added_fob(names)
        return extra_fob * self.garment.brand_multiplier * self.garment.retail_multiplier


def cost_per_degree(model: CostModel, names, scen):
    """Added retail USD per degree C of benefit; None when the benefit is <= 0."""
    b = benefit(names, scen)
    return None if b <= 1e-9 else model.added_retail(names) / b


def best_under_budget(model: CostModel, scen, budget, names=tuple(LEVERS)):
    """Exhaustive search over lever subsets (excluding thin+thick together) within an added-retail budget."""
    best = ((), 0.0, 0.0)
    for mask in product([0, 1], repeat=len(names)):
        sub = tuple(n for n, m in zip(names, mask) if m)
        if "thin" in sub and "thick" in sub:
            continue
        c = model.added_retail(sub)
        if c > budget + 1e-12:
            continue
        b = benefit(sub, scen)
        if b > best[1] + 1e-12:
            best = (sub, b, c)
    return best
