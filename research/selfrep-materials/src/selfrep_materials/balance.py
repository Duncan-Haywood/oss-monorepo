"""Mass and energy balance for one printer copy built by a seed shop, with recycling.

Part list and the feedstock each process consumes come from ``selfrep_closure.bom`` (the
sibling project ``research/selfrep-closure``; masses there are ASSUMED placeholders).
Every process parameter below (yields, losses, specific energies) is ASSUMED by this
project, not measured or sourced; experiments sweep them over wide ranges.

Model (steady state, one copy):
* Plastic. Printing a product mass P uses filament F = P / (1 - s), where s is the share of
  filament that ends as scrap (supports, purge, failed prints). A fraction r of scrap is
  shredded and re-extruded; the rest is lost. Recycled filament can supply at most a share
  phi of F (degradation limit). Virgin plastic V = F - min(r*(s + eol*P/F)*F, phi*F), where eol*P is plastic recovered from
  retired machines (0 in the base case: only the shop's own scrap is recycled).
* Metal (aluminium sheet/bar, brass). Machining a product mass P from stock uses stock
  S = P / y (y = cutting yield); offcuts S - P are remelted only if the shop has casting,
  with melt loss m (dross, oxidation); otherwise they are scrap.
* Energy (electric, kWh): printing, shredding, extrusion, machining (per kg removed or
  cut) and melting (theory: sensible + latent heat of Al divided by furnace efficiency).
"""
import os
import sys
from dataclasses import dataclass, replace

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "..", "..", "selfrep-closure", "src"))
from selfrep_closure.bom import SHOPS  # noqa: E402,F401
from selfrep_closure.closure import makeable, parts_for  # noqa: E402


@dataclass(frozen=True)
class Params:
    s: float = 0.10        # scrap share of filament
    r: float = 0.80        # share of scrap recovered by shred + re-extrude
    phi: float = 0.30      # max recycled share of filament (degradation limit)
    y_metal: float = 0.70  # cutting yield: product / stock
    m_loss: float = 0.08   # melt loss of remelted offcuts
    eol: float = 0.0       # retired printed plastic per copy, as a multiple of the copy's printed mass (ASSUMED scenario)
    # specific energies, kWh per kg (ASSUMED)
    e_print: float = 8.0     # FDM printing, per kg printed (small hobby printer, long runs)
    e_shred: float = 0.3
    e_extrude: float = 1.0
    e_machine: float = 2.0   # router/laser, per kg of product
    furnace_eff: float = 0.25  # electric crucible furnace, share of heat reaching the metal


# Handbook-order thermophysical values for aluminium (approximate; checked against a handbook is an owner step)
AL_CP = 0.90e3        # J/(kg K)
AL_LATENT = 3.97e5    # J/kg
AL_MELT_C = 660.0
ROOM_C = 20.0


def melt_energy_kwh_per_kg(furnace_eff):
    j = AL_CP * (AL_MELT_C - ROOM_C) + AL_LATENT
    return j / 3.6e6 / furnace_eff


def parts_by_feedstock(variant, processes):
    """Product mass (kg) per feedstock class for makeable parts of one copy of the BOM."""
    out = {}
    for p in parts_for(variant):
        if makeable(p, set(processes)):
            out[p.feedstock] = out.get(p.feedstock, 0.0) + p.qty * p.mass_g / 1000.0
    return out


def vitamin_mass(variant, processes):
    t = 0.0
    for p in parts_for(variant):
        if not makeable(p, set(processes)):
            t += p.qty * p.mass_g / 1000.0
    return t


def balance(variant, processes, prm=Params(), recycle=True):
    """Return dict of imported masses (kg), scrap, energy for one copy."""
    prod = parts_by_feedstock(variant, processes)
    imp = {"vitamins": vitamin_mass(variant, processes)}
    energy = {}
    scrap_lost = 0.0
    eol_used = 0.0
    # plastic
    P = prod.get("filament", 0.0)
    if P:
        F = P / (1 - prm.s)
        scrap = F - P
        pool = scrap + prm.eol * P   # shreddable plastic: own scrap plus retired machines' printed parts
        rec = min(prm.r * pool, prm.phi * F) if recycle else 0.0
        from_scrap = min(rec, prm.r * scrap)
        eol_used = rec - from_scrap
        imp["filament (virgin)"] = F - rec
        scrap_lost += scrap - from_scrap
        energy["print"] = prm.e_print * P
        energy["shred+extrude"] = (prm.e_shred + prm.e_extrude) * rec
    # metals
    cast = "cast" in processes
    for name, P in prod.items():
        if name == "filament":
            continue
        S = P / prm.y_metal
        off = S - P
        is_al = name.startswith("aluminium")
        if recycle and cast and is_al:
            remelted = off * (1 - prm.m_loss)
            imp[name] = S - remelted
            scrap_lost += off - remelted
            energy["melt Al"] = energy.get("melt Al", 0.0) + melt_energy_kwh_per_kg(prm.furnace_eff) * off
        else:
            imp[name] = S
            scrap_lost += off
        energy["machine"] = energy.get("machine", 0.0) + prm.e_machine * P
    total = sum(imp.values())
    return {"eol_used_kg": eol_used, "imports_kg": imp, "total_import_kg": total, "scrap_lost_kg": scrap_lost,
            "energy_kwh": energy, "total_energy_kwh": sum(energy.values())}


def sweep_parameter(variant, processes, field, values, base=Params(), recycle=True):
    return [(v, balance(variant, processes, replace(base, **{field: v}), recycle)) for v in values]
