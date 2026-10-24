"""Cooling-side sizing for the ADU's heat pump, and the downsizing credit once heating AND cooling are counted.

house-hpsize sized the heat pump on the winter design load only and listed cooling as missing ("can govern in Houston").
Here the summer sensible load is UA times (outdoor design - indoor) plus window solar gain by orientation plus internal
gains; the unit must cover the larger of the two requirements. Every summer design temperature, solar factor, SHGC,
internal gain and derating is ASSUMED, not sourced; this is not ACCA Manual J.
"""
from house_hpsize.model import (COMPONENTS, PACKAGES, PLAN, SIZES_KBTUH, equipment_cost, package_with,
                                required_rated_kbtuh as heat_need_kbtuh)
import house_hpsize.model as hp
from house_open_design.analysis import envelope

# Summer design dry-bulb (F), rounded values remembered from ASHRAE-style 1% data: NOT checked against source.
SUMMER_DESIGN_F = {"Houston (2A)": 95.0, "Baltimore (4A)": 91.0, "Chicago (5A)": 90.0, "Minneapolis (6A)": 89.0}
INDOOR_SUMMER_F = 75.0
# Peak solar gain through unshaded glass per ft2 of glass at SHGC 1, Btu/h ft2, by wall (assumed round values).
SOLAR_PEAK = {"S": 60.0, "N": 20.0, "E": 120.0, "W": 120.0}
SHGC = 0.40  # window solar heat gain coefficient, same for both packages (assumed; see sensitivity)
INTERNAL_GAIN_BTUH = 1200.0  # two occupants, appliances, lights (assumed)
LATENT_ALLOWANCE = 1.15  # multiplier on sensible load for humidity removal (assumed; more than this in Houston)
COOL_DERATE_PER_F = 0.005  # share of rated (95 F) cooling capacity lost per F above 95 (assumed)


def window_area_by_wall():
    out = {}
    for o in PLAN.openings:
        if o.kind == "window" and PLAN.wall(o.wall).exterior:
            out[o.wall] = out.get(o.wall, 0.0) + o.width * o.height
    return out


def solar_gain_btuh(shgc=None):
    s = SHGC if shgc is None else shgc
    return sum(a * SOLAR_PEAK[w] * s for w, a in window_area_by_wall().items())


def cooling_load_btuh(pkg, climate, shgc=None):
    """Peak sensible-plus-latent-allowance load (Btu/h). Infiltration is in UA, so the tight package's air sealing counts."""
    ua = envelope(PLAN, pkg)["ua_total"]
    sens = ua * (SUMMER_DESIGN_F[climate] - INDOOR_SUMMER_F) + solar_gain_btuh(shgc) + INTERNAL_GAIN_BTUH
    return sens * LATENT_ALLOWANCE


def cool_need_kbtuh(pkg, climate, shgc=None):
    derate = max(0.5, 1.0 - COOL_DERATE_PER_F * max(0.0, SUMMER_DESIGN_F[climate] - 95.0))
    return cooling_load_btuh(pkg, climate, shgc) * hp.OVERSIZE / derate / 1000.0


def _pick(need):
    return next((s for s in SIZES_KBTUH if s >= need), None)


def governing(pkg, climate):
    """(size, which) with which in {'heating', 'cooling'}; ties go to heating."""
    h, c = heat_need_kbtuh(pkg, climate), cool_need_kbtuh(pkg, climate)
    return _pick(max(h, c)), ("cooling" if c > h else "heating")


def credit(changed, climate):
    """Equipment cost saved by the named upgrades with both loads counted (0 if the governing step is unchanged)."""
    a = governing(PACKAGES["baseline"], climate)[0]
    b = governing(package_with(*changed), climate)[0]
    return equipment_cost(a) - equipment_cost(b)
