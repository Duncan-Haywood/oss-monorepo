"""Bottom-up cost model for a woven outerwear garment.

Chain: materials + trims + labour (+ factory overhead and profit) = factory cost ("FOB");
FOB x brand multiplier = wholesale; wholesale x retail multiplier = retail price (before tax).
Everything numeric below is an ASSUMED stylised input, not a measured or published figure,
except the retail prices, which are reported prices (see README). Ranges drive the Monte Carlo.
"""
from dataclasses import dataclass, field, replace
import numpy as np


@dataclass(frozen=True)
class Scenario:
    name: str
    wage_per_hour: float  # USD, fully loaded sewing-operator wage (assumed)
    line_efficiency: float  # share of paid time that is standard-minute work


# Round-number assumptions, deliberately not tied to a named country's statistics.
SCENARIOS = {
    "high-wage": Scenario("high-wage (assumed $18/h)", 18.0, 0.60),
    "mid-wage": Scenario("mid-wage (assumed $6/h)", 6.0, 0.55),
    "low-wage": Scenario("low-wage (assumed $1.5/h)", 1.5, 0.50),
}


@dataclass(frozen=True)
class Garment:
    name: str
    piece_area_m2: float  # sum of pattern piece areas, shell fabric (assumed from piece dimensions)
    marker_efficiency: float  # share of the marker covered by pieces
    shell_price_per_m2: float
    lining_area_m2: float
    lining_price_per_m2: float
    trims: float  # buttons, buckles, zips, thread, labels, interlining (lump sum, assumed)
    sam_minutes: float  # standard allowed minutes to sew
    cutting_finishing_minutes: float
    overhead_rate: float  # factory overhead and profit as share of direct cost
    brand_multiplier: float  # wholesale / FOB
    retail_multiplier: float  # retail / wholesale
    waste_rate: float = 0.03  # spoilage and shrinkage on top of the marker

    def fabric_used_m2(self):
        return self.piece_area_m2 / self.marker_efficiency * (1 + self.waste_rate)


# Trench coat, ~1.5 m of 1.4 m wide cloth class: pieces total about 2.9 m^2 (assumed:
# body, sleeves, collar, storm flap, belt, pockets, facings).
TRENCH = Garment("trench coat (cotton gabardine, lined)", 2.9, 0.80, 28.0, 2.2, 6.0,
                 22.0, 85.0, 25.0, 0.25, 2.2, 2.2)
# Double-breasted wool/cashmere coat, ~3.4 m^2 of pieces (assumed).
COAT = Garment("long double-breasted wool-blend coat, lined", 3.4, 0.78, 70.0, 2.6, 7.0,
               30.0, 110.0, 35.0, 0.25, 2.4, 2.3)


def cost_breakdown(g: Garment, s: Scenario):
    fabric = g.fabric_used_m2() * g.shell_price_per_m2
    lining = g.lining_area_m2 * (1 + g.waste_rate) / g.marker_efficiency * g.lining_price_per_m2
    materials = fabric + lining
    labour = (g.sam_minutes + g.cutting_finishing_minutes) / 60.0 * s.wage_per_hour / s.line_efficiency
    direct = materials + g.trims + labour
    overhead = direct * g.overhead_rate
    fob = direct + overhead
    wholesale = fob * g.brand_multiplier
    retail = wholesale * g.retail_multiplier
    return {"fabric": fabric, "lining": lining, "trims": g.trims, "labour": labour,
            "overhead_profit": overhead, "fob": fob, "brand_margin": wholesale - fob,
            "wholesale": wholesale, "retail_margin": retail - wholesale, "retail": retail}


def retail_price(g, s):
    return cost_breakdown(g, s)["retail"]


def implied_markup(g, s, observed_retail):
    """Total multiplier (retail / FOB) that the observed price implies for this model's FOB."""
    return observed_retail / cost_breakdown(g, s)["fob"]


def fob_share(g, s, observed_retail):
    return cost_breakdown(g, s)["fob"] / observed_retail


def replica(g: Garment, shell_price_per_m2=7.0, lining_price_per_m2=3.0, trims=8.0,
            sam_minutes=None):
    """A $20-50 build: cheaper cloth, simpler trims, fewer operations (fewer top-stitch rows,
    no hand finishing). Cutting a trench for fewer minutes is the main labour saving."""
    sam = g.sam_minutes * 0.6 if sam_minutes is None else sam_minutes
    return replace(g, name=g.name + " [replica]", shell_price_per_m2=shell_price_per_m2,
                   lining_price_per_m2=lining_price_per_m2, trims=trims, sam_minutes=sam,
                   overhead_rate=0.0, brand_multiplier=1.0, retail_multiplier=1.0)


def monte_carlo(g, s, n=5000, seed=0, rel=0.25):
    """Vary every continuous input by +-rel (uniform) and return quantiles of FOB and retail."""
    rng = np.random.default_rng(seed)
    fields = ["piece_area_m2", "shell_price_per_m2", "lining_price_per_m2", "trims", "sam_minutes",
              "cutting_finishing_minutes", "overhead_rate", "brand_multiplier", "retail_multiplier"]
    fob, ret = [], []
    for _ in range(n):
        gg = replace(g, **{f: getattr(g, f) * rng.uniform(1 - rel, 1 + rel) for f in fields})
        ss = replace(s, wage_per_hour=s.wage_per_hour * rng.uniform(1 - rel, 1 + rel))
        b = cost_breakdown(gg, ss)
        fob.append(b["fob"]); ret.append(b["retail"])
    q = lambda a: tuple(float(x) for x in np.quantile(a, [0.05, 0.5, 0.95]))
    return {"fob": q(fob), "retail": q(ret)}
