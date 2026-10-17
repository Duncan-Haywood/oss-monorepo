"""Recycling machines with their own (ASSUMED) part lists, and their payback against avoided imports.

The three machines are the ones ``research/selfrep-materials`` left out: a plastic shredder, a
filament extruder and an aluminium crucible furnace. Their part lists, masses and the processes
that can make each part are ASSUMPTIONS of this project, written as round-number placeholders in
the style of ``selfrep_closure.bom``; they are not taken from any published design.

Per-copy savings come from ``selfrep_materials.balance`` (recycling on minus off), split into the
plastic saving (shredder + extruder, both needed) and the aluminium saving (furnace).
"""
import os
import sys
from dataclasses import replace

_HERE = os.path.dirname(os.path.abspath(__file__))
for sib in ("selfrep-closure", "selfrep-materials"):
    sys.path.insert(0, os.path.join(_HERE, "..", "..", "..", sib, "src"))
from selfrep_closure.bom import SHOPS, Part  # noqa: E402
from selfrep_closure.closure import makeable  # noqa: E402
from selfrep_materials.balance import Params, balance  # noqa: E402


def _v(name, qty, kind, mass_g, why="vitamin: no shop process can make it"):
    return Part(name, qty, kind, mass_g, 0.0, (), why)


def _m(name, qty, mass_g, makers, feedstock, why):
    return Part(name, qty, "made", mass_g, 0.0, makers, why, feedstock=feedstock)


MACHINES = {
    "shredder": [
        _v("geared motor", 1, "electronics", 2000.0),
        _v("hardened steel cutter plates", 6, "metal", 150.0, "vitamin: hardened steel is beyond a router or laser"),
        _v("608 bearing", 4, "bearing", 12.0),
        _v("bolts, nuts and shafts", 1, "fastener", 400.0),
        _v("motor driver / switch", 1, "electronics", 100.0),
        _m("frame and hopper plates", 1, 3000.0, ("cnc", "laser"), "MDF sheet", "flat sheet cut on a router or laser"),
        _m("printed gears and guides", 1, 300.0, ("fdm",), "filament", "printed"),
    ],
    "extruder": [
        _v("stepper motor", 1, "electronics", 300.0),
        _v("steel screw and barrel", 1, "metal", 800.0, "vitamin: machined hardened steel"),
        _v("heater cartridges + thermistors", 3, "electronics", 40.0),
        _v("controller", 1, "electronics", 100.0),
        _v("bolts, nuts and bearings", 1, "fastener", 200.0),
        _m("frame plates", 1, 1000.0, ("cnc", "laser"), "MDF sheet", "flat sheet"),
        _m("printed spooler and guides", 1, 300.0, ("fdm",), "filament", "printed"),
    ],
    "furnace": [
        _v("crucible (graphite or clay)", 1, "ceramic", 1000.0),
        _v("heating element", 1, "electronics", 300.0),
        _v("refractory insulation", 1, "ceramic", 2000.0),
        _v("temperature controller + relay", 1, "electronics", 200.0),
        _v("steel shell", 1, "metal", 3000.0, "vitamin: welded or rolled steel"),
    ],
}
PLASTIC_PAIR = ("shredder", "extruder")


def machine_mass_kg(names, processes, variant_scale=1.0):
    """(vitamin kg, made kg) for the named machines in a shop with ``processes``."""
    v = mk = 0.0
    for n in names:
        for p in MACHINES[n]:
            m = p.qty * p.mass_g * variant_scale / 1000.0
            if makeable(p, set(processes)):
                mk += m
            else:
                v += m
    return v, mk


def machine_import_kg(names, processes, y_metal=Params().y_metal, s=Params().s):
    """Imported mass to build the machines: vitamins plus the feedstock for the parts the shop makes
    (plastic at 1/(1-s), sheet at 1/y_metal; offcuts of the sheet are not recycled here)."""
    v = 0.0
    for n in names:
        for p in MACHINES[n]:
            m = p.qty * p.mass_g / 1000.0
            if not makeable(p, set(processes)):
                v += m
            elif p.feedstock == "filament":
                v += m / (1 - s)
            else:
                v += m / y_metal
    return v


def per_copy_saving(variant, processes, prm=Params()):
    """kg of imports avoided per printer copy by (plastic recycling, aluminium recycling)."""
    off = balance(variant, processes, prm, recycle=False)["imports_kg"]
    on = balance(variant, processes, prm, recycle=True)["imports_kg"]
    plastic = off.get("filament (virgin)", 0.0) - on.get("filament (virgin)", 0.0)
    metal = sum(off[k] - on[k] for k in off if k.startswith("aluminium"))
    return plastic, metal


def paybacks(variant, shop, prm=Params()):
    """Copies needed before a recycler's own imports are repaid by the imports it avoids.
    Returns dict name -> (import_kg, saving_kg_per_copy, copies or None)."""
    procs = SHOPS[shop]
    pl, me = per_copy_saving(variant, procs, prm)
    out = {}
    imp = machine_import_kg(PLASTIC_PAIR, procs)
    out["shredder+extruder"] = (imp, pl, imp / pl if pl > 1e-12 else None)
    if "cast" in procs:
        imp = machine_import_kg(("furnace",), procs)
        out["furnace"] = (imp, me, imp / me if me > 1e-12 else None)
    return out


def with_params(**kw):
    return replace(Params(), **kw)
