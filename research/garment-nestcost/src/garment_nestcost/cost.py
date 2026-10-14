"""Cost of a garment with shell and lining marker efficiencies measured separately (garment-teardown's
`cost_breakdown` uses one efficiency for both)."""
from . import _paths  # noqa: F401
from dataclasses import replace
from garment_teardown.model import cost_breakdown


def cost_with_markers(g, s, eff_shell, eff_lining):
    """Same chain as `garment_teardown.model.cost_breakdown`, with its single marker efficiency split in two."""
    b = cost_breakdown(replace(g, marker_efficiency=eff_shell), s)
    lining = g.lining_area_m2 * (1 + g.waste_rate) / eff_lining * g.lining_price_per_m2
    direct = b["fabric"] + lining + b["trims"] + b["labour"]
    fob = direct * (1 + g.overhead_rate)
    wholesale = fob * g.brand_multiplier
    return {"fabric": b["fabric"], "lining": lining, "labour": b["labour"], "fob": fob,
            "retail": wholesale * g.retail_multiplier}
