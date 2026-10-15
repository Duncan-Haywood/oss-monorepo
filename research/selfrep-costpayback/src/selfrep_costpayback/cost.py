"""Cost-weighted payback of the recycling machines of `research/selfrep-recyclers`.

`selfrep-recyclers` measured payback in imported kilograms, so a kilogram of MDF counted as much
as a kilogram of motor. Here every import is priced. All prices are ASSUMED round-number
placeholders in the same arbitrary currency units as `selfrep_closure.bom` (roughly dollars);
none is a quote. The mass model, part lists and per-copy savings are reused unchanged.
"""
import os
import sys
from dataclasses import dataclass, replace

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "..", "..", "selfrep-recyclers", "src"))
from selfrep_recyclers.machines import (MACHINES, PLASTIC_PAIR, SHOPS, Params, balance,  # noqa: E402,F401
                                        makeable, with_params)

# ASSUMED price per kg of each imported feedstock (currency units / kg).
FEEDSTOCK_PRICE = {"filament": 20.0, "filament (virgin)": 20.0, "MDF sheet": 3.0,
                   "aluminium sheet": 6.0, "aluminium bar": 6.0, "brass/bronze ingot": 10.0}
# ASSUMED price per unit of each vitamin line of the recycling machines (currency units).
VITAMIN_UNIT_PRICE = {
    "geared motor": 40.0, "hardened steel cutter plates": 6.0, "608 bearing": 0.5,
    "bolts, nuts and shafts": 6.0, "motor driver / switch": 8.0,
    "stepper motor": 12.0, "steel screw and barrel": 25.0, "heater cartridges + thermistors": 4.0,
    "controller": 15.0, "bolts, nuts and bearings": 5.0,
    "crucible (graphite or clay)": 15.0, "heating element": 12.0, "refractory insulation": 20.0,
    "temperature controller + relay": 12.0, "steel shell": 25.0,
    # parts the shop could make but must buy finished when it lacks the process (printer-only shop)
    "frame and hopper plates": 30.0, "printed gears and guides": 20.0,
    "frame plates": 12.0, "printed spooler and guides": 15.0,
}


@dataclass(frozen=True)
class Prices:
    filament: float = 20.0
    sheet: float = 3.0          # MDF sheet for frames
    aluminium: float = 6.0
    vitamin_scale: float = 1.0  # multiplies every vitamin price


def machine_cost(names, processes, pr=Prices(), y_metal=Params().y_metal, s=Params().s):
    """(vitamin cost, feedstock cost) to build the machines in a shop with ``processes``."""
    vit = feed = 0.0
    for n in names:
        for p in MACHINES[n]:
            if not makeable(p, set(processes)):
                vit += p.qty * VITAMIN_UNIT_PRICE[p.name] * pr.vitamin_scale
            else:
                kg = p.qty * p.mass_g / 1000.0
                if p.feedstock == "filament":
                    feed += kg / (1 - s) * pr.filament
                else:
                    feed += kg / y_metal * pr.sheet
    return vit, feed


def saving_cost_per_copy(variant, processes, prm=Params(), pr=Prices()):
    """Currency avoided per printer copy by (plastic recycling, aluminium recycling)."""
    off = balance(variant, processes, prm, recycle=False)["imports_kg"]
    on = balance(variant, processes, prm, recycle=True)["imports_kg"]
    pl = (off.get("filament (virgin)", 0.0) - on.get("filament (virgin)", 0.0)) * pr.filament
    al = sum(off[k] - on[k] for k in off if k.startswith("aluminium")) * pr.aluminium
    return pl, al


def cost_paybacks(variant, shop, prm=Params(), pr=Prices()):
    """name -> (machine cost, vitamin share of it, saving per copy, copies or None)."""
    procs = SHOPS[shop]
    pl, al = saving_cost_per_copy(variant, procs, prm, pr)
    out = {}
    for name, names, sav in (("shredder+extruder", PLASTIC_PAIR, pl), ("furnace", ("furnace",), al)):
        if name == "furnace" and "cast" not in procs:
            continue
        v, f = machine_cost(names, procs, pr)
        out[name] = (v + f, v / (v + f), sav, (v + f) / sav if sav > 1e-12 else None)
    return out


def breakeven_filament_price(variant, shop, copies, prm=Params(), pr=Prices()):
    """Filament price at which the plastic pair repays itself in ``copies`` printer copies
    (machine cost itself depends on the filament price through its printed parts)."""
    lo, hi = 0.0, 1e4
    for _ in range(200):
        mid = (lo + hi) / 2
        c = cost_paybacks(variant, shop, prm, replace(pr, filament=mid))["shredder+extruder"][3]
        if c is None or c > copies:
            lo = mid
        else:
            hi = mid
    return hi
