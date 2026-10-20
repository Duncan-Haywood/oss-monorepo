"""Cooling vs heating heat pump sizing for the ADU. Writes results.txt (deterministic).

    python experiments/run.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
for sib in ("house-hpsize", "house-breakeven", "house-open-design", "house-plan", "house-spans", "house-framing", "house-structure", "house-energy", "house-cost", "house-truss"):
    sys.path.insert(0, str(HERE.parents[1] / sib / "src"))

import house_coolsize.model as m  # noqa: E402
from house_coolsize.model import (COMPONENTS, PACKAGES, cool_need_kbtuh, cooling_load_btuh, credit, governing,  # noqa: E402
                                  solar_gain_btuh, window_area_by_wall)
from house_hpsize.model import downsizing_credit, required_rated_kbtuh, selected_size  # noqa: E402
from house_open_design.plan_set import CLIMATE_SET  # noqa: E402

b, t = PACKAGES["baseline"], PACKAGES["tight"]
out = []
P = out.append
P("A. Window glass by wall (ft2) and peak solar gain at SHGC %.2f (Btu/h)" % m.SHGC)
P("wall\tglass_ft2")
for w, a in sorted(window_area_by_wall().items()):
    P(f"{w}\t{a:.1f}")
P(f"solar_gain_btuh\t{solar_gain_btuh():.0f}")
P("")
P("B. Design loads (Btu/h) and required rated capacity (kBtu/h); baseline then tight")
P("climate\theat_load_b\tcool_load_b\theat_need_b\tcool_need_b\theat_need_t\tcool_need_t\tgoverns_b\tgoverns_t")
for c in CLIMATE_SET:
    from house_hpsize.model import design_load_btuh
    P(f"{c}\t{design_load_btuh(b, c):.0f}\t{cooling_load_btuh(b, c):.0f}\t{required_rated_kbtuh(b, c):.1f}\t{cool_need_kbtuh(b, c):.1f}\t"
      f"{required_rated_kbtuh(t, c):.1f}\t{cool_need_kbtuh(t, c):.1f}\t{governing(b, c)[1]}\t{governing(t, c)[1]}")
P("")
P("C. Selected size (kBtu/h) and whole-package credit (USD): heating only (house-hpsize) vs heating and cooling")
P("climate\theat_only_b\theat_only_t\theat_credit\tboth_b\tboth_t\tboth_credit")
for c in CLIMATE_SET:
    P(f"{c}\t{selected_size(b, c)}\t{selected_size(t, c)}\t{downsizing_credit(COMPONENTS, c):.0f}\t{governing(b, c)[0]}\t{governing(t, c)[0]}\t{credit(COMPONENTS, c):.0f}")
P("")
P("D. Governing size as one upgrade at a time is added to the baseline (kBtu/h)")
P("climate\tbaseline\t" + "\t".join(COMPONENTS) + "\tall")
from house_breakeven.model import package_with  # noqa: E402
for c in CLIMATE_SET:
    P(f"{c}\t{governing(b, c)[0]}\t" + "\t".join(str(governing(package_with(k), c)[0]) for k in COMPONENTS) + f"\t{governing(t, c)[0]}")
P("")
P("E. Sensitivity of the governing size and credit to window SHGC (Houston and Minneapolis)")
P("climate\tshgc\tbase_cool_need\ttight_cool_need\tbase_size\ttight_size")
for c in ("Houston (2A)", "Minneapolis (6A)"):
    for s in (0.2, 0.3, 0.4, 0.5, 0.6):
        m.SHGC = s
        P(f"{c}\t{s}\t{cool_need_kbtuh(b, c):.1f}\t{cool_need_kbtuh(t, c):.1f}\t{governing(b, c)[0]}\t{governing(t, c)[0]}")
m.SHGC = 0.40
P("")
P("F. Sensitivity to the latent allowance (Houston; baseline and tight governing size, credit USD)")
P("latent\tbase_size\ttight_size\tcredit")
for l in (1.0, 1.15, 1.3, 1.5):
    m.LATENT_ALLOWANCE = l
    c = "Houston (2A)"
    P(f"{l}\t{governing(b, c)[0]}\t{governing(t, c)[0]}\t{credit(COMPONENTS, c):.0f}")
m.LATENT_ALLOWANCE = 1.15

P("")
P("G. Required rated cooling capacity against window SHGC (Houston, kBtu/h)")
P("shgc\tbaseline\ttight")
for s_ in (0.2, 0.3, 0.4, 0.5, 0.6):
    P(f"{s_}\t{cool_need_kbtuh(b, 'Houston (2A)', s_):.1f}\t{cool_need_kbtuh(t, 'Houston (2A)', s_):.1f}")

text = "\n".join(out) + "\n"
print(text)
(HERE / "results.txt").write_text(text)
