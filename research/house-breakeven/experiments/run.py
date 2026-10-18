"""Break-even first cost of the ADU's envelope upgrades. Writes results.txt (deterministic).

    python experiments/run.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
for sib in ("house-open-design", "house-plan", "house-spans", "house-framing", "house-structure", "house-energy", "house-cost"):
    sys.path.insert(0, str(HERE.parents[1] / sib / "src"))

from house_breakeven.model import COMPONENTS, LABEL, annual_saving, assumed_extra_cost, breakeven_cost  # noqa: E402
from house_open_design.plan_set import CLIMATE_SET, SYSTEM_SET  # noqa: E402

out = []
P = out.append
P("A. Whole tight package vs baseline: annual saving and break-even extra first cost (3% real rate, 30 years, assumed prices)")
P("climate\tsystem\tannual_saving_usd\tbreakeven_usd")
for c in CLIMATE_SET:
    for s in SYSTEM_SET:
        P(f"{c}\t{s}\t{annual_saving(COMPONENTS, c, s):.0f}\t{breakeven_cost(COMPONENTS, c, s):.0f}")
P("")
P("B. Break-even by upgrade, heat pump (USD; assumed cost where house-energy has a unit price)")
P("upgrade\t" + "\t".join(CLIMATE_SET) + "\tassumed_extra_cost")
for k in COMPONENTS:
    row = "\t".join(f"{breakeven_cost((k,), c, 'heat pump'):.0f}" for c in CLIMATE_SET)
    a = assumed_extra_cost(k)
    P(f"{LABEL[k]}\t{row}\t{'n/a' if a is None else f'{a:.0f}'}")
P("")
P("C. Same, gas furnace + AC")
P("upgrade\t" + "\t".join(CLIMATE_SET) + "\tassumed_extra_cost")
for k in COMPONENTS:
    row = "\t".join(f"{breakeven_cost((k,), c, 'gas furnace + AC'):.0f}" for c in CLIMATE_SET)
    a = assumed_extra_cost(k)
    P(f"{LABEL[k]}\t{row}\t{'n/a' if a is None else f'{a:.0f}'}")
P("")
P("D. Energy-price multiplier needed for break-even at the assumed extra cost (heat pump, 3%; above 1 means it does not pay at assumed prices)")
P("upgrade\t" + "\t".join(CLIMATE_SET))
for k in ("attic_r", "window_u", "ach50"):
    a = assumed_extra_cost(k)
    P(f"{LABEL[k]}\t" + "\t".join(f"{a / breakeven_cost((k,), c, 'heat pump'):.2f}" for c in CLIMATE_SET))
P("")
P("E. Whole-package break-even against the discount rate (heat pump, USD)")
rates = (0.0, 0.03, 0.07)
P("rate\t" + "\t".join(CLIMATE_SET))
for r in rates:
    P(f"{r:.2f}\t" + "\t".join(f"{breakeven_cost(COMPONENTS, c, 'heat pump', rate=r):.0f}" for c in CLIMATE_SET))
P("")
P("F. Whole-package break-even against the energy price multiplier (Chicago, 3%, USD)")
P("multiplier\theat pump\tgas furnace + AC")
for m in (0.5, 1.0, 1.5, 2.0):
    P(f"{m:.1f}\t" + "\t".join(f"{breakeven_cost(COMPONENTS, 'Chicago (5A)', s, energy_mult=m):.0f}" for s in SYSTEM_SET))
text = "\n".join(out) + "\n"
(HERE / "results.txt").write_text(text)
print(text)
