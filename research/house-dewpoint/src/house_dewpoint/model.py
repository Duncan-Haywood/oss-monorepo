"""Steady-state Glaser condensation check for a layered wall.

Temperature falls linearly in thermal resistance; vapor pressure falls linearly in vapor
resistance (1/permeance) until it would exceed saturation, where it is clamped and the
excess is the condensation rate at that interface. SI units. Written from the standard
method, checked by closed-form tests, not against WUFI or a published tool.
"""
from dataclasses import dataclass
import math

PERM = 57.2  # ng/(Pa s m2) per US perm


@dataclass(frozen=True)
class Layer:
    name: str
    r: float      # thermal resistance, m2 K/W
    perm: float   # water-vapor permeance, US perms


def psat(t_c):
    """Saturation vapor pressure of water, Pa (Magnus form, valid roughly -45..60 C)."""
    return 610.94 * math.exp(17.625 * t_c / (t_c + 243.04))


def wall_profile(layers, t_in, rh_in, t_out, rh_out, r_film_in=0.12, r_film_out=0.03):
    """Interface temperatures (C) and unclamped vapor pressures (Pa), inside to outside.

    Returns (temps, pv, vr): nodes are the boundaries between layers, len(layers)+1 of them,
    node 0 the interior face of the first layer, node n the exterior face of the last.
    vr is each layer's vapor resistance in Pa s m2 / ng.
    """
    r_tot = r_film_in + sum(l.r for l in layers) + r_film_out
    q = (t_in - t_out) / r_tot
    temps = [t_in - q * r_film_in]
    for l in layers:
        temps.append(temps[-1] - q * l.r)
    vr = [1.0 / (l.perm * PERM) for l in layers]
    p_in, p_out = rh_in * psat(t_in), rh_out * psat(t_out)
    tot = sum(vr)
    pv, acc = [p_in], 0.0
    for v in vr:
        acc += v
        pv.append(p_in - (p_in - p_out) * acc / tot)
    return temps, pv, vr


def condensation(layers, t_in, rh_in, t_out, rh_out):
    """Condensation per interface, ng/(s m2) (positive = accumulation), and peak RH at each node.

    Clamps the most over-saturated interior node to saturation, re-solves, repeats.
    Returns dict(rates=[...per node], rh=[...per node, unclamped], total=sum of rates).
    """
    temps, pv0, vr = wall_profile(layers, t_in, rh_in, t_out, rh_out)
    n = len(layers)
    ps = [psat(t) for t in temps]
    p_in, p_out = pv0[0], pv0[-1]
    fixed = {0: p_in, n: p_out}
    for _ in range(n + 1):
        nodes = sorted(fixed)
        pv = [0.0] * (n + 1)
        for a, b in zip(nodes, nodes[1:]):
            seg = sum(vr[a:b])
            acc = 0.0
            pv[a] = fixed[a]
            for k in range(a, b):
                acc += vr[k]
                pv[k + 1] = fixed[a] - (fixed[a] - fixed[b]) * acc / seg
        worst = max((i for i in range(1, n) if i not in fixed), key=lambda i: pv[i] - ps[i], default=None)
        if worst is None or pv[worst] <= ps[worst] * (1 + 1e-12):
            break
        fixed[worst] = ps[worst]
    nodes = sorted(fixed)
    rates = [0.0] * (n + 1)
    flux = {}
    for a, b in zip(nodes, nodes[1:]):
        flux[(a, b)] = (fixed[a] - fixed[b]) / sum(vr[a:b])
    for i in nodes[1:-1]:
        lo = max(a for a in nodes if a < i)
        hi = min(b for b in nodes if b > i)
        rates[i] = flux[(lo, i)] - flux[(i, hi)]
    return {"rates": rates, "rh": [p / s for p, s in zip(pv0, ps)], "total": sum(rates), "temps": temps}


# ---- assumed assemblies and climates (see README: from memory, unsourced) ----
ASSEMBLY_LAYERS = {
    "gypsum": Layer("gypsum, latex primer", 0.08, 5.0),
    "batt": Layer("2x6 batt R-19", 3.35, 30.0),
    "osb": Layer("OSB 7/16", 0.11, 2.0),
    "xps1": Layer("XPS 1 in", 0.88, 1.0),
    "xps2": Layer("XPS 2 in", 1.76, 0.5),
    "wrap": Layer("housewrap", 0.0, 10.0),
    "siding": Layer("vented siding", 0.10, 100.0),
}
RETARDERS = {
    "none": Layer("no retarder", 0.0, 1000.0),
    "paint": None,  # gypsum latex primer alone (5 perm)
    "kraft": Layer("kraft facing", 0.0, 1.0),
    "poly": Layer("polyethylene", 0.0, 0.06),
}

# (indoor C, indoor RH, outdoor C, outdoor RH) for a winter and a summer design month; assumed
CLIMATES = {
    "Miami (1A)":     {"winter": (21, 0.40, 20, 0.75), "summer": (24, 0.50, 28, 0.80)},
    "Atlanta (3A)":   {"winter": (21, 0.35, 6, 0.75),  "summer": (24, 0.50, 26, 0.75)},
    "Chicago (5A)":   {"winter": (21, 0.35, -4, 0.75), "summer": (24, 0.50, 24, 0.70)},
    "Duluth (7A)":    {"winter": (21, 0.35, -12, 0.75), "summer": (24, 0.50, 19, 0.70)},
}


def build_wall(retarder, exterior):
    """Layers inside to outside. retarder in RETARDERS, exterior in {'none','xps1','xps2'}."""
    A = ASSEMBLY_LAYERS
    ls = [A["gypsum"]]
    if RETARDERS[retarder] is not None:
        ls.append(RETARDERS[retarder])
    ls += [A["batt"], A["osb"]]
    if exterior != "none":
        ls.append(A[exterior])
    ls += [A["wrap"], A["siding"]]
    return ls
