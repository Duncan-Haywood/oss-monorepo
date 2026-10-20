"""Heat-pump downsizing credit for the ADU's envelope upgrades. Writes results.txt (deterministic).

    python experiments/run.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
for sib in ("house-breakeven", "house-open-design", "house-plan", "house-spans", "house-framing", "house-structure", "house-energy", "house-cost", "house-truss"):
    sys.path.insert(0, str(HERE.parents[1] / sib / "src"))

import house_hpsize.model as m  # noqa: E402
from house_hpsize.model import (COSTED, COMPONENTS, PACKAGES, costed_extra, design_load_btuh, downsizing_credit,  # noqa: E402
                                equipment_cost, required_rated_kbtuh, selected_size, total_breakeven)
from house_open_design.plan_set import CLIMATE_SET  # noqa: E402
from house_breakeven.model import breakeven_cost, package_with  # noqa: E402

out = []
P = out.append
P("A. Design heating load, required rated capacity and selected heat pump size (baseline vs tight package)")
P("climate\tdesign_F\tbase_load_btuh\ttight_load_btuh\tbase_need_kbtuh\ttight_need_kbtuh\tbase_size\ttight_size\tcredit_usd")
for c in CLIMATE_SET:
    b, t = PACKAGES["baseline"], PACKAGES["tight"]
    P(f"{c}\t{m.DESIGN_TEMP_F[c]:.0f}\t{design_load_btuh(b, c):.0f}\t{design_load_btuh(t, c):.0f}\t{required_rated_kbtuh(b, c):.1f}\t"
      f"{required_rated_kbtuh(t, c):.1f}\t{selected_size(b, c)}\t{selected_size(t, c)}\t{downsizing_credit(COMPONENTS, c):.0f}")
P("")
P("B. Whole package: energy break-even plus credit, 3% rate (USD, heat pump)")
P("climate\tenergy_breakeven\tcredit\ttotal")
for c in CLIMATE_SET:
    e = breakeven_cost(COMPONENTS, c, "heat pump")
    P(f"{c}\t{e:.0f}\t{downsizing_credit(COMPONENTS, c):.0f}\t{total_breakeven(COMPONENTS, c):.0f}")
P("")
P(f"C. The three costed upgrades (attic, windows, air sealing; assumed extra cost ${costed_extra():.0f}): does the credit close the gap?")
P("climate\tenergy_breakeven\tcredit\ttotal\tgap_without_credit\tgap_with_credit\tsize_base\tsize_costed")
for c in CLIMATE_SET:
    e = breakeven_cost(COSTED, c, "heat pump")
    cr = downsizing_credit(COSTED, c)
    P(f"{c}\t{e:.0f}\t{cr:.0f}\t{e + cr:.0f}\t{costed_extra() - e:.0f}\t{costed_extra() - e - cr:.0f}\t"
      f"{selected_size(PACKAGES['baseline'], c)}\t{selected_size(package_with(*COSTED), c)}")
P("")
P("D. Selected size as one upgrade at a time is added to the baseline (kBtu/h)")
P("climate\tbaseline\t" + "\t".join(COMPONENTS) + "\tall")
for c in CLIMATE_SET:
    P(f"{c}\t{selected_size(PACKAGES['baseline'], c)}\t" + "\t".join(str(selected_size(package_with(k), c)) for k in COMPONENTS)
      + f"\t{selected_size(PACKAGES['tight'], c)}")
P("")
P("E. Sensitivity of the whole-package credit to the sizing margin (Chicago; USD)")
P("oversize\tbase_size\ttight_size\tcredit")
for ov in (1.0, 1.15, 1.3, 1.5):
    m.OVERSIZE = ov
    c = "Chicago (5A)"
    P(f"{ov}\t{selected_size(PACKAGES['baseline'], c)}\t{selected_size(PACKAGES['tight'], c)}\t{downsizing_credit(COMPONENTS, c):.0f}")
m.OVERSIZE = 1.15
P("")
P("F. Credit and size across design-temperature error (Chicago, tight vs baseline; USD)")
P("design_F\tbase_size\ttight_size\tcredit")
for d in (-10, -5, 0, 5, 10):
    m.DESIGN_TEMP_F["Chicago (5A)"] = float(d)
    c = "Chicago (5A)"
    P(f"{d}\t{selected_size(PACKAGES['baseline'], c)}\t{selected_size(PACKAGES['tight'], c)}\t{downsizing_credit(COMPONENTS, c):.0f}")
m.DESIGN_TEMP_F["Chicago (5A)"] = 0.0

text = "\n".join(out) + "\n"
print(text)
(HERE / "results.txt").write_text(text)
