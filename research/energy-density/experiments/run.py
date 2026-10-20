"""Write experiments/results.txt: theoretical ceilings on stored energy by technology.

    PYTHONPATH=src python experiments/run.py

Deterministic arithmetic. Every non-constant input is listed with its source (checked in
this run, or assumed) in the section that uses it, and again in the README.
"""
from pathlib import Path
from energy_density import (COUPLES, PUBLISHED, couple_row, flow_battery_wh_per_l, sensible_heat,
                            sensible_exergy, latent_cold_exergy, gravity_wh_per_kg,
                            flywheel_wh_per_kg, sphere_shell_mass_per_volume,
                            isothermal_air_exergy_wh_per_l, ev_per_atom_from_wh_kg,
                            WH_PER_KG_PER_EV_PER_GMOL, T_AMBIENT, P_ATM, molar_mass, atoms)

OUT = Path(__file__).resolve().parent / "results.txt"
C = 273.15

# Thermal stores: (label, c kJ/kgK, T low K, T high K, mean atomic mass g/mol, source)
THERMAL = [
    ("Water tank, 25 -> 85 C", 4.18, 25 + C, 85 + C, molar_mass("H2O") / atoms("H2O"),
     "c = 4.18 kJ/kgK, standard value, assumed"),
    ("Sand, 20 -> 500 C", 0.8, 20 + C, 500 + C, molar_mass("SiO2") / atoms("SiO2"),
     "500 C is Polar Night Energy's reported operating temperature (checked 2026-10-19); c = 0.8 kJ/kgK for silica sand, assumed (not checked)"),
    ("Solar salt, 290 -> 565 C", 1.5, 290 + C, 565 + C, None,
     "60/40 NaNO3/KNO3, c = 1.5 kJ/kgK and the 290-565 C window as in CSP plants, assumed (not checked)"),
]
ICE = (334.0, C, 30 + C)  # latent heat kJ/kg (standard value, assumed), melt K, hot-day ambient K (assumed)

# Rotor materials: (label, strength Pa, density kg/m3, mean atomic mass or None, source)
ROTORS = [
    ("T700S fibre alone, ideal disc (K=1)", 4.9e9, 1800.0, 12.011, 1.0,
     "4,900 MPa and 1.80 g/cm3, Toray T700S data sheet, checked 2026-10-19"),
    ("T700S/epoxy rim (K=0.5)", 2.86e9, 1560.0, None, 0.5,
     "2,860 MPa composite tensile at 60% fibre volume, Toray T700S data sheet (checked); 1,560 kg/m3 from 0.6*1.80 + 0.4*1.20, assumed resin density"),
    ("High-strength steel rim (K=0.5)", 1.5e9, 7850.0, molar_mass("Fe"), 0.5,
     "1.5 GPa and 7,850 kg/m3, assumed (not checked)"),
]
H2_700BAR_DENSITY = 40.2  # kg/m3 at 700 bar, 288 K: US DOE HFTO cryogenic H2 webinar (July 2020), checked 2026-10-19


def fmt(x, w=10, d=0):
    return f"{x:{w}.{d}f}" if x is not None else f"{'-':>{w}s}"


def main():
    L = []
    L.append("A. Electrochemical couples: theoretical specific energy on reactant mass")
    L.append(f"{'couple':58s}{'V':>6s}{'Wh/kg':>9s}{'metal':>9s}{'eV/atom':>9s}{'g/mol':>8s}")
    rows = {}
    for key, *_ in COUPLES:
        r = couple_row(key)
        rows[key] = r
        L.append(f"{r['label']:58s}{r['volts']:6.2f}{fmt(r['wh_kg'], 9)}{fmt(r['wh_kg_metal'], 9)}"
                 f"{r['ev_atom']:9.3f}{r['mean_m']:8.2f}")
    L.append("'metal' = on the reactive metal (or H2) alone, with O2 from the air; '-' = closed cell.")
    L.append("eV/atom = n*E / reactant atoms; g/mol = mean reactant atomic mass; Wh/kg = %.0f * eV/atom / g/mol."
             % WH_PER_KG_PER_EV_PER_GMOL)
    L.append("")

    L.append("B. Cross-check against published theoretical values (arithmetic check, not new data)")
    checks = [("lead_acid", rows["lead_acid"]["wh_kg"]), ("li_s", rows["li_s"]["wh_kg"]),
              ("zn_air", rows["zn_air"]["wh_kg"]), ("al_air_metal", rows["al_air"]["wh_kg_metal"]),
              ("li_o2", rows["li_o2"]["wh_kg"])]
    for k, ours in checks:
        pub, src = PUBLISHED[k]
        L.append(f"{k:14s} ours {ours:7.0f}  published {pub:6d}  diff {100 * (ours - pub) / pub:+5.1f}%  ({src})")
    li_o2_3v = rows["li_o2"]["wh_kg_metal"] * 3.0 / rows["li_o2"]["volts"]
    L.append(f"li_o2 Li-only basis: {rows['li_o2']['wh_kg_metal']:.0f} Wh/kg at 2.96 V, {li_o2_3v:.0f} at 3.0 V;"
             " published Li-only figures of ~11,400-11,700 differ by the voltage used.")
    L.append("")

    L.append("C. Flow battery (all-vanadium), ceiling per litre of total electrolyte (both tanks, full SOC swing)")
    for conc in (1.6, 2.0):
        L.append(f"V {conc:.1f} mol/L, 1.26 V: {flow_battery_wh_per_l(conc, 1.26):5.1f} Wh/L")
    L.append("1.26 V: cell voltage quoted in US patent 10,079,401 (checked 2026-10-19); 1.6 and 2.0 mol/L assumed.")
    L.append("Reported practical VRB energy density: 15-25 Wh/L (Wikipedia, checked 2026-10-19).")
    L.append("")

    L.append(f"D. Thermal stores: heat, and exergy (the ceiling on electricity back) with dead state {T_AMBIENT - C:.0f} C")
    L.append(f"{'store':30s}{'heat Wh/kg':>12s}{'exergy Wh/kg':>14s}{'exergy %':>10s}{'heat eV/atom':>14s}")
    for label, c, tl, th, m, src in THERMAL:
        q, x = sensible_heat(c, tl, th), sensible_exergy(c, tl, th)
        ev = ev_per_atom_from_wh_kg(q, m) if m else None
        L.append(f"{label:30s}{q:12.1f}{x:14.1f}{100 * x / q:10.1f}{fmt(ev, 14, 3)}")
    for label, c, tl, th, m, src in THERMAL:
        L.append(f"  {label}: {src}")
    lat, tm, t0 = ICE
    L.append(f"{'Ice, latent (cold store)':30s}{lat / 3.6:12.1f}{latent_cold_exergy(lat, tm, t0):14.1f}"
             f"{100 * latent_cold_exergy(lat, tm, t0) / (lat / 3.6):10.1f}{fmt(None, 14)}")
    L.append(f"  Ice: latent heat {lat:.0f} kJ/kg, standard value, assumed; exergy against a {t0 - C:.0f} C day (assumed).")
    L.append("")

    L.append("E. Mechanical stores")
    for h in (100, 300, 600):
        g = gravity_wh_per_kg(h)
        L.append(f"Lifted mass (pumped hydro, blocks) {h:4d} m: {g:6.3f} Wh/kg, {g * 1000 / 1000:6.3f} kWh/m3 of water"
                 f" ({ev_per_atom_from_wh_kg(g, molar_mass('H2O') / atoms('H2O')):.1e} eV/atom)")
    for label, s, rho, m, k, src in ROTORS:
        w = flywheel_wh_per_kg(s, rho, k)
        ev = f", {ev_per_atom_from_wh_kg(w, m):.3f} eV/atom" if m else ""
        L.append(f"Flywheel at burst speed, {label}: {w:6.0f} Wh/kg of rotor{ev}")
    for label, s, rho, m, k, src in ROTORS:
        L.append(f"  {label}: {src}")
    L.append("Burst speed is the ceiling; a working flywheel runs below it with a safety factor, a hub,"
             " bearings and a containment housing, none counted here.")
    for bar in (200, 300):
        L.append(f"Compressed air, ideal gas, isothermal, {bar} bar tank: {isothermal_air_exergy_wh_per_l(bar * 1e5):5.1f} Wh/L of tank"
                 " (heat for the expansion comes from the surroundings; per kg of tank is not a storage figure)")
    L.append("")

    L.append("F. Hydrogen at 700 bar (Gibbs free energy, i.e. a 100%-efficient fuel cell)")
    g_kg = rows["h2_o2"]["wh_kg_metal"]
    L.append(f"H2 alone: {g_kg:.0f} Wh/kg; gas at 700 bar, 288 K, {H2_700BAR_DENSITY} kg/m3: {g_kg * H2_700BAR_DENSITY / 1000:.0f} Wh/L of gas")
    for sf in (1.0, 2.25):
        shell = sphere_shell_mass_per_volume(700e5 - P_ATM, 2.86e9, 1560.0, safety=sf)
        frac = H2_700BAR_DENSITY / (H2_700BAR_DENSITY + shell)
        L.append(f"  ideal T700/epoxy sphere, safety factor {sf:4.2f}: shell {shell:6.1f} kg/m3, H2 {100 * frac:4.1f} wt%,"
                 f" {g_kg * frac:6.0f} Wh/kg of H2 + shell")
    L.append("  Safety factor 2.25 assumed (not checked). Real tanks are cylinders with liners, bosses and valves,"
             " so they are heavier than the ideal sphere; the sphere is a ceiling.")
    L.append("")

    L.append("G. Summary: ceilings in Wh/kg of active material (for the figure)")
    summary = [
        ("Lead-acid", rows["lead_acid"]["wh_kg"], "electrochemical"),
        ("Li-ion graphite/LiCoO2", rows["li_ion_lco"]["wh_kg"], "electrochemical"),
        ("Li-ion graphite/LiFePO4", rows["li_ion_lfp"]["wh_kg"], "electrochemical"),
        ("Zinc-air (with O2)", rows["zn_air"]["wh_kg"], "electrochemical"),
        ("Lithium-sulfur", rows["li_s"]["wh_kg"], "electrochemical"),
        ("Aluminium-air (with O2, H2O)", rows["al_air"]["wh_kg"], "electrochemical"),
        ("Lithium-oxygen (with O2)", rows["li_o2"]["wh_kg"], "electrochemical"),
        ("H2 + O2 (with O2)", rows["h2_o2"]["wh_kg"], "electrochemical"),
        ("H2 alone (Gibbs)", g_kg, "fuel"),
        ("Flywheel, T700/epoxy rim", flywheel_wh_per_kg(2.86e9, 1560.0, 0.5), "mechanical"),
        ("Flywheel, steel rim", flywheel_wh_per_kg(1.5e9, 7850.0, 0.5), "mechanical"),
        ("Pumped hydro, 300 m", gravity_wh_per_kg(300), "mechanical"),
        ("Sand 500 C, heat", sensible_heat(0.8, 20 + C, 500 + C), "heat"),
        ("Sand 500 C, exergy", sensible_exergy(0.8, 20 + C, 500 + C), "exergy"),
        ("Solar salt, heat", sensible_heat(1.5, 290 + C, 565 + C), "heat"),
        ("Water 25-85 C, heat", sensible_heat(4.18, 25 + C, 85 + C), "heat"),
        ("Water 25-85 C, exergy", sensible_exergy(4.18, 25 + C, 85 + C), "exergy"),
    ]
    for label, v, kind in sorted(summary, key=lambda r: -r[1]):
        L.append(f"{label:32s}{v:12.2f}  {kind}")
    OUT.write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
