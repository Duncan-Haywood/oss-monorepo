"""Write results.txt: volumetric ceilings. Deterministic, instant.  PYTHONPATH=src python experiments/run.py"""
from pathlib import Path
from energy_volumetric import volumetric_row, store_wh_per_l, H2_LIQUID
from energy_density import couple_row, sensible_heat, sensible_exergy, flywheel_wh_per_kg, gravity_wh_per_kg

HERE = Path(__file__).resolve().parent
out = []
out.append("A. Couples: Wh/kg (energy-density), Wh/L all reactants (O2 liquid), Wh/L with O2 from air")
out.append(f"{'couple':<44}{'Wh/kg':>9}{'Wh/L all':>10}{'Wh/L air':>10}")
for key in ["lead_acid", "li_ion_lco", "li_ion_lfp", "li_s", "zn_air", "al_air", "li_o2"]:
    m = couple_row(key)
    v = volumetric_row(key)
    out.append(f"{m['label'][:42]:<44}{m['wh_kg']:>9.0f}{v['wh_l_all']:>10.0f}{v['wh_l_air']:>10.0f}")
out.append("")
out.append("B. Hydrogen (Gibbs energy of H2 + O2 from air; Wh per litre of H2 alone)")
h = couple_row("h2_o2")
gas = volumetric_row("h2_o2")
liq = volumetric_row("h2_o2", h2_density=H2_LIQUID)
out.append(f"{'H2 gas, 700 bar':<44}{h['wh_kg_metal']:>9.0f}{gas['wh_l_air']:>10.0f}")
out.append(f"{'H2 liquid, 20 K':<44}{h['wh_kg_metal']:>9.0f}{liq['wh_l_air']:>10.0f}")
out.append("")
out.append("C. Stores (Wh/kg, bulk kg/L, Wh/L)")
for label, whkg, rho in [
    ("Sand 20-500 C, heat (1.6 kg/L bulk)", sensible_heat(0.8, 293.15, 773.15), 1.6),
    ("Sand 20-500 C, exergy", sensible_exergy(0.8, 293.15, 773.15), 1.6),
    ("Solar salt 290-565 C, exergy (1.8 kg/L)", sensible_exergy(1.5, 563.15, 838.15), 1.8),
    ("Water 25-85 C, heat", sensible_heat(4.18, 298.15, 358.15), 1.0),
    ("Water lifted 300 m (1.0 kg/L)", gravity_wh_per_kg(300), 1.0),
    ("CFRP flywheel rim (1.56 kg/L, 2860 MPa)", flywheel_wh_per_kg(2.86e9, 1560, 0.5), 1.56),
]:
    out.append(f"{label:<44}{whkg:>9.1f}{store_wh_per_l(whkg, rho):>10.1f}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
