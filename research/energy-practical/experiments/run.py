"""Write experiments/results.txt: published practical figures against the energy-density ceilings.

    PYTHONPATH=src:../energy-density/src python experiments/run.py

Deterministic arithmetic on the sourced figures in src/energy_practical/data.py.
"""
from pathlib import Path
from energy_practical import gaps, h2_wt_percent, RTE, H2_SYSTEM, CHECKED, LHV_H2_KWH_PER_KG

OUT = Path(__file__).resolve().parent / "results.txt"


def main():
    L = [f"A. Practical figure as a fraction of the first-principles ceiling (sources read {CHECKED})",
         f"{'product':38}{'level':13}{'practical':>14}{'ceiling':>9}{'ratio':>13}  how",
         ]
    for e, ce, lo, hi in gaps():
        prac = f"{e['low']:g}" if e["low"] == e["high"] else f"{e['low']:g}-{e['high']:g}"
        ratio = f"{lo:.2f}" if e["low"] == e["high"] else f"{lo:.2f}-{hi:.2f}"
        L.append(f"{e['label']:38}{e['level']:13}{prac:>14}{ce:9.0f}{ratio:>13}  {e['how']}")
    L.append("Units: Wh/kg, except the flow battery (Wh/L of electrolyte). Ceilings are reactant mass only (energy-density).")
    L.append("NCR18650B is NCA but is compared with the graphite/LiCoO2 ceiling, the nearest couple modelled.")
    L.append("")
    p, (c1, c2) = h2_wt_percent()
    L.append("B. Hydrogen at 700 bar: share of the system's mass that is hydrogen")
    L.append(f"DOE Record 24006, 2023 status: {H2_SYSTEM['kwh_kg']} kWh/kg and {H2_SYSTEM['kwh_l']} kWh/L system, 5.6 kg usable H2 (projected, LHV)")
    L.append(f"practical H2 share = {H2_SYSTEM['kwh_kg']} / {LHV_H2_KWH_PER_KG} = {p:.2f} wt%  (system mass {5.6 / (p / 100):.0f} kg)")
    L.append(f"ideal-sphere ceiling: {c1:.1f} wt% (safety factor 1.00), {c2:.1f} wt% (2.25)")
    L.append(f"practical / ceiling = {p / c1:.2f} and {p / c2:.2f}")
    L.append("")
    L.append("C. Round-trip efficiency, system level (PNNL GridPIQ page, read 2026-10-20; medians of cited ranges)")
    for name, v, src in sorted(RTE, key=lambda r: -r[1]):
        L.append(f"{name:24}{v:4d}%   {src}")
    OUT.write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
